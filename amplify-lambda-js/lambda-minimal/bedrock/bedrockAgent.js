//Copyright (c) 2024 Vanderbilt University  
//Authors: Jules White, Allen Karns, Karely Rodriguez, Max Moundas

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { sendDeltaToStream, sendStateEventToStream, sendErrorMessage } from "../common/streams.js";
import { getLogger } from "../common/logging.js";
import { trace } from "../common/trace.js";
import { createHash } from 'crypto';

const logger = getLogger("bedrockAgent");

/**
 * Validate Bedrock Agent configuration
 * @param {string} agentId - The agent ID
 * @param {string} agentAlias - The agent alias
 * @param {string} region - The AWS region
 * @returns {Object} - Validation result with isValid and error message
 */
export const validateAgentConfiguration = (agentId, agentAlias, region) => {
    const errors = [];
    
    if (!agentId || typeof agentId !== 'string' || agentId.trim().length === 0) {
        errors.push('BEDROCK_AGENT_ID is required and must be a non-empty string');
    }
    
    if (!agentAlias || typeof agentAlias !== 'string' || agentAlias.trim().length === 0) {
        errors.push('BEDROCK_AGENT_ALIAS is required and must be a non-empty string');
    }
    
    if (!region || typeof region !== 'string' || region.trim().length === 0) {
        errors.push('BEDROCK_AGENT_REGION is required and must be a non-empty string');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
};

/**
 * Generate a consistent session ID from conversation ID or request ID
 * @param {string} conversationId - The conversation identifier
 * @param {string} requestId - The request identifier as fallback
 * @returns {string} - A consistent session ID
 */
export const generateSessionId = (conversationId, requestId) => {
    const baseId = conversationId || requestId || 'default-session';
    // Create a hash to ensure consistent session ID format
    const hash = createHash('md5').update(baseId).digest('hex');
    return `session-${hash.substring(0, 16)}`;
};

/**
 * Prepare agent request from chat messages
 * @param {Array} messages - Array of chat messages
 * @param {string} sessionId - Session identifier
 * @returns {Object} - Formatted agent request
 */
export const prepareAgentRequest = (messages, sessionId) => {
    // Combine all user messages into a single input text
    const userMessages = messages
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join('\n\n');
    
    return {
        sessionId,
        inputText: userMessages || 'Hello',
        enableTrace: process.env.TRACING_ENABLED === 'true'
    };
};

/**
 * Handle agent errors and send appropriate responses
 * @param {Error} error - The error object
 * @param {Object} writable - The writable stream
 */
export const handleAgentError = (error, writable) => {
    logger.error('Bedrock Agent error:', error);
    
    let statusCode = 500;
    let statusText = 'Internal Server Error';
    
    if (error.name === 'ValidationException') {
        statusCode = 400;
        statusText = 'Invalid agent configuration';
    } else if (error.name === 'AccessDeniedException') {
        statusCode = 401;
        statusText = 'Unauthorized access to agent';
    } else if (error.name === 'ResourceNotFoundException') {
        statusCode = 404;
        statusText = 'Agent not found';
    } else if (error.name === 'ThrottlingException') {
        statusCode = 429;
        statusText = 'Rate limit exceeded, please try again later';
    } else if (error.name === 'ServiceUnavailableException') {
        statusCode = 503;
        statusText = 'Agent service temporarily unavailable';
    }
    
    sendErrorMessage(writable, statusCode, statusText);
};

/**
 * Stream agent response chunks to the client
 * @param {AsyncIterable} responseStream - The agent response stream
 * @param {Object} writable - The writable stream for client
 * @param {string} requestId - Request identifier for tracing
 */
export const streamAgentResponse = async (responseStream, writable, requestId) => {
    try {
        for await (const event of responseStream) {
            if (event.chunk) {
                const chunk = event.chunk;
                
                if (chunk.bytes) {
                    // Decode the response bytes
                    const decoder = new TextDecoder();
                    const text = decoder.decode(chunk.bytes);
                    
                    // Send the text chunk to the stream in the expected format
                    sendDeltaToStream(writable, "answer", { delta: { text: text } });
                    
                    // Trace the response if enabled
                    if (process.env.TRACING_ENABLED === 'true') {
                        trace(requestId, ["agent-response"], { text });
                    }
                }
            }
            
            if (event.trace) {
                // Handle trace information if available
                logger.debug('Agent trace:', event.trace);
                sendStateEventToStream(writable, { trace: event.trace });
            }
        }
        
        // End the stream
        writable.end();
        
        writable.on('finish', () => {
            logger.debug('Agent response stream finished');
        });
        
    } catch (streamError) {
        logger.error('Error streaming agent response:', streamError);
        handleAgentError(streamError, writable);
    }
};

/**
 * Main chat function for Bedrock Agents
 * @param {Object} chatBody - The chat request body
 * @param {Object} writable - The writable stream for responses
 * @param {Object} context - Lambda execution context
 */
export const chatBedrockAgent = async (chatBody, writable, context) => {
    const startTime = Date.now();
    
    try {
        // Validate environment configuration
        const agentId = process.env.BEDROCK_AGENT_ID;
        const agentAlias = process.env.BEDROCK_AGENT_ALIAS;
        const region = process.env.BEDROCK_AGENT_REGION || process.env.DEP_REGION || 'us-east-1';
        
        // Comprehensive configuration validation
        const validation = validateAgentConfiguration(agentId, agentAlias, region);
        if (!validation.isValid) {
            const errorMessage = `Agent configuration validation failed: ${validation.errors.join(', ')}`;
            logger.error(errorMessage, { 
                agentId: !!agentId, 
                agentAlias: !!agentAlias, 
                region: !!region,
                errors: validation.errors
            });
            sendErrorMessage(writable, 500, 'Agent configuration not available');
            return;
        }
        
        // Validate chat body structure
        if (!chatBody || typeof chatBody !== 'object') {
            logger.error('Invalid chat body provided', { chatBody: typeof chatBody });
            sendErrorMessage(writable, 400, 'Invalid request format');
            return;
        }
        
        // Validate messages array
        const messages = chatBody.messages || [];
        if (!Array.isArray(messages)) {
            logger.error('Messages must be an array', { messages: typeof messages });
            sendErrorMessage(writable, 400, 'Invalid messages format');
            return;
        }
        
        // Extract options and generate session ID
        const options = chatBody.options || {};
        const requestId = options.requestId || context.awsRequestId;
        const conversationId = options.conversationId;
        const sessionId = generateSessionId(conversationId, requestId);
        
        logger.info('Starting Bedrock Agent chat:', {
            agentId,
            agentAlias,
            sessionId,
            requestId,
            region,
            messageCount: messages.length
        });
        
        // Send initial state to client
        sendStateEventToStream(writable, {
            agent: {
                id: agentId,
                alias: agentAlias,
                sessionId
            }
        });
        
        // Initialize Bedrock Agent Runtime client with error handling
        let client;
        try {
            client = new BedrockAgentRuntimeClient({ region });
            logger.debug('Bedrock Agent Runtime client initialized successfully', { region });
        } catch (clientError) {
            logger.error('Failed to initialize Bedrock Agent Runtime client:', {
                error: clientError.message,
                region,
                requestId
            });
            sendErrorMessage(writable, 500, 'Failed to initialize agent client');
            return;
        }
        
        // Prepare the agent request
        const agentRequest = prepareAgentRequest(chatBody.messages || [], sessionId);
        
        const input = {
            agentId,
            agentAliasId: agentAlias,
            sessionId,
            inputText: agentRequest.inputText,
            enableTrace: agentRequest.enableTrace
        };
        
        // Trace the request if enabled
        if (process.env.TRACING_ENABLED === 'true') {
            trace(requestId, ["agent-request"], { 
                agentId, 
                agentAlias, 
                sessionId,
                inputText: agentRequest.inputText 
            });
        }
        
        logger.debug('Invoking Bedrock Agent with input:', {
            agentId,
            agentAliasId: agentAlias,
            sessionId,
            inputTextLength: input.inputText.length,
            enableTrace: input.enableTrace
        });
        
        // Invoke the agent
        const command = new InvokeAgentCommand(input);
        const response = await client.send(command);
        
        // Stream the response
        if (response.completion) {
            await streamAgentResponse(response.completion, writable, requestId);
        } else {
            logger.warn('No completion stream received from agent');
            sendErrorMessage(writable, 500, 'No response from agent');
        }
        
        // Log completion metrics
        const duration = Date.now() - startTime;
        logger.info('Bedrock Agent chat completed:', {
            requestId,
            sessionId,
            duration,
            agentId,
            agentAlias
        });
        
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Bedrock Agent chat failed:', {
            error: error.message,
            duration,
            requestId: chatBody.options?.requestId
        });
        
        handleAgentError(error, writable);
    }
    
    writable.on('error', (error) => {
        logger.error('Writable stream error:', error);
    });
};