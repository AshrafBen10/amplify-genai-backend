//Copyright (c) 2024 Vanderbilt University  
//Authors: Jules White, Allen Karns, Karely Rodriguez, Max Moundas

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { chatBedrockAgent } from '../bedrock/bedrockAgent.js';

/**
 * Feature: bedrock-agent-integration, Property 9: Comprehensive Logging
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

// Mock dependencies
jest.mock('../common/logging.js');
jest.mock('../common/streams.js');
jest.mock('@aws-sdk/client-bedrock-agent-runtime');

describe('Bedrock Agent Logging', () => {
    let mockLogger;
    let mockWritable;
    let mockContext;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };
        
        mockWritable = {
            write: jest.fn(),
            end: jest.fn(),
            on: jest.fn()
        };
        
        mockContext = {
            awsRequestId: 'test-request-id'
        };

        // Mock getLogger to return our mock
        const { getLogger } = require('../common/logging.js');
        getLogger.mockReturnValue(mockLogger);
        
        jest.clearAllMocks();
    });

    test('Property 9: Comprehensive Logging - For any valid agent request, all required log events should be generated', async () => {
        // Set up environment variables
        const originalEnv = process.env;
        process.env = {
            ...originalEnv,
            BEDROCK_AGENT_ID: 'test-agent-id',
            BEDROCK_AGENT_ALIAS: 'test-alias',
            BEDROCK_AGENT_REGION: 'us-east-1'
        };

        try {
            await fc.assert(fc.asyncProperty(
                fc.record({
                    messages: fc.array(fc.record({
                        role: fc.constantFrom('user', 'assistant'),
                        content: fc.string()
                    })),
                    options: fc.record({
                        requestId: fc.string(),
                        conversationId: fc.string()
                    })
                }),
                async (chatBody) => {
                    // Mock successful AWS SDK response
                    const { BedrockAgentRuntimeClient } = require('@aws-sdk/client-bedrock-agent-runtime');
                    const mockClient = {
                        send: jest.fn().mockResolvedValue({
                            completion: {
                                [Symbol.asyncIterator]: async function* () {
                                    yield { chunk: { bytes: new TextEncoder().encode('test response') } };
                                }
                            }
                        })
                    };
                    BedrockAgentRuntimeClient.mockImplementation(() => mockClient);

                    await chatBedrockAgent(chatBody, mockWritable, mockContext);

                    // Verify comprehensive logging occurred
                    expect(mockLogger.info).toHaveBeenCalledWith(
                        'Starting Bedrock Agent chat:',
                        expect.objectContaining({
                            agentId: expect.any(String),
                            agentAlias: expect.any(String),
                            sessionId: expect.any(String),
                            requestId: expect.any(String),
                            region: expect.any(String),
                            messageCount: expect.any(Number)
                        })
                    );

                    expect(mockLogger.debug).toHaveBeenCalledWith(
                        'Bedrock Agent Runtime client initialized successfully',
                        expect.objectContaining({
                            region: expect.any(String)
                        })
                    );

                    expect(mockLogger.debug).toHaveBeenCalledWith(
                        'Invoking Bedrock Agent with input:',
                        expect.objectContaining({
                            agentId: expect.any(String),
                            agentAliasId: expect.any(String),
                            sessionId: expect.any(String),
                            inputTextLength: expect.any(Number),
                            enableTrace: expect.any(Boolean)
                        })
                    );

                    expect(mockLogger.info).toHaveBeenCalledWith(
                        'Bedrock Agent chat completed:',
                        expect.objectContaining({
                            requestId: expect.any(String),
                            sessionId: expect.any(String),
                            duration: expect.any(Number),
                            agentId: expect.any(String),
                            agentAlias: expect.any(String)
                        })
                    );
                }
            ), { numRuns: 20 });
        } finally {
            process.env = originalEnv;
        }
    });

    test('Property 9: Comprehensive Logging - For any configuration error, error logging should include diagnostic information', async () => {
        // Test with missing environment variables
        const originalEnv = process.env;
        process.env = {
            ...originalEnv,
            BEDROCK_AGENT_ID: undefined,
            BEDROCK_AGENT_ALIAS: undefined
        };

        try {
            await fc.assert(fc.asyncProperty(
                fc.record({
                    messages: fc.array(fc.record({
                        role: fc.constantFrom('user', 'assistant'),
                        content: fc.string()
                    }))
                }),
                async (chatBody) => {
                    await chatBedrockAgent(chatBody, mockWritable, mockContext);

                    // Verify error logging includes diagnostic information
                    expect(mockLogger.error).toHaveBeenCalledWith(
                        expect.stringContaining('Agent configuration validation failed'),
                        expect.objectContaining({
                            agentId: expect.any(Boolean),
                            agentAlias: expect.any(Boolean),
                            region: expect.any(Boolean),
                            errors: expect.any(Array)
                        })
                    );
                }
            ), { numRuns: 20 });
        } finally {
            process.env = originalEnv;
        }
    });

    test('Property 9: Comprehensive Logging - For any runtime error, error logging should include context and duration', async () => {
        // Set up environment variables
        const originalEnv = process.env;
        process.env = {
            ...originalEnv,
            BEDROCK_AGENT_ID: 'test-agent-id',
            BEDROCK_AGENT_ALIAS: 'test-alias',
            BEDROCK_AGENT_REGION: 'us-east-1'
        };

        try {
            await fc.assert(fc.asyncProperty(
                fc.record({
                    messages: fc.array(fc.record({
                        role: fc.constantFrom('user', 'assistant'),
                        content: fc.string()
                    })),
                    options: fc.record({
                        requestId: fc.string()
                    })
                }),
                async (chatBody) => {
                    // Mock AWS SDK to throw an error
                    const { BedrockAgentRuntimeClient } = require('@aws-sdk/client-bedrock-agent-runtime');
                    const mockClient = {
                        send: jest.fn().mockRejectedValue(new Error('Test AWS error'))
                    };
                    BedrockAgentRuntimeClient.mockImplementation(() => mockClient);

                    await chatBedrockAgent(chatBody, mockWritable, mockContext);

                    // Verify error logging includes context and duration
                    expect(mockLogger.error).toHaveBeenCalledWith(
                        'Bedrock Agent chat failed:',
                        expect.objectContaining({
                            error: expect.any(String),
                            duration: expect.any(Number),
                            requestId: expect.any(String)
                        })
                    );
                }
            ), { numRuns: 20 });
        } finally {
            process.env = originalEnv;
        }
    });
});