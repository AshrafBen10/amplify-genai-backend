//Copyright (c) 2024 Vanderbilt University  
//Authors: Jules White, Allen Karns, Karely Rodriguez, Max Moundas

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { validateAgentConfiguration, handleAgentError, chatBedrockAgent } from '../bedrock/bedrockAgent.js';

/**
 * Feature: bedrock-agent-integration, Property 1: Configuration Error Handling
 * Feature: bedrock-agent-integration, Property 5: Error Handling Comprehensiveness
 * **Validates: Requirements 1.4, 2.6, 6.1, 6.2, 6.3, 6.4, 6.5**
 */

// Mock dependencies
jest.mock('../common/streams.js');
jest.mock('../common/logging.js');

describe('Bedrock Agent Error Handling', () => {
    let mockWritable;
    let mockContext;

    beforeEach(() => {
        mockWritable = {
            write: jest.fn(),
            end: jest.fn(),
            on: jest.fn()
        };
        mockContext = {
            awsRequestId: 'test-request-id'
        };
        jest.clearAllMocks();
    });

    test('Property 1: Configuration Error Handling - For any invalid agent configuration, validation should fail', () => {
        fc.assert(fc.property(
            fc.oneof(
                fc.constant(null),
                fc.constant(undefined),
                fc.constant(''),
                fc.constant('   '),
                fc.integer(),
                fc.object()
            ),
            fc.oneof(
                fc.constant(null),
                fc.constant(undefined),
                fc.constant(''),
                fc.constant('   '),
                fc.integer(),
                fc.object()
            ),
            fc.oneof(
                fc.constant(null),
                fc.constant(undefined),
                fc.constant(''),
                fc.constant('   '),
                fc.integer(),
                fc.object()
            ),
            (agentId, agentAlias, region) => {
                const result = validateAgentConfiguration(agentId, agentAlias, region);
                expect(result.isValid).toBe(false);
                expect(result.errors).toBeInstanceOf(Array);
                expect(result.errors.length).toBeGreaterThan(0);
            }
        ), { numRuns: 100 });
    });

    test('Property 1: Configuration Error Handling - For any valid agent configuration, validation should pass', () => {
        fc.assert(fc.property(
            fc.string().filter(s => s.trim().length > 0),
            fc.string().filter(s => s.trim().length > 0),
            fc.string().filter(s => s.trim().length > 0),
            (agentId, agentAlias, region) => {
                const result = validateAgentConfiguration(agentId, agentAlias, region);
                expect(result.isValid).toBe(true);
                expect(result.errors).toEqual([]);
            }
        ), { numRuns: 100 });
    });

    test('Property 5: Error Handling Comprehensiveness - For any AWS error type, handleAgentError should map to appropriate status code', () => {
        const errorMappings = [
            { name: 'ValidationException', expectedStatus: 400 },
            { name: 'AccessDeniedException', expectedStatus: 401 },
            { name: 'ResourceNotFoundException', expectedStatus: 404 },
            { name: 'ThrottlingException', expectedStatus: 429 },
            { name: 'ServiceUnavailableException', expectedStatus: 503 },
            { name: 'UnknownError', expectedStatus: 500 }
        ];

        fc.assert(fc.property(
            fc.constantFrom(...errorMappings),
            fc.string(),
            (errorMapping, message) => {
                const error = new Error(message);
                error.name = errorMapping.name;
                
                // Mock sendErrorMessage to capture the call
                const { sendErrorMessage } = require('../common/streams.js');
                sendErrorMessage.mockClear();
                
                handleAgentError(error, mockWritable);
                
                expect(sendErrorMessage).toHaveBeenCalledWith(
                    mockWritable,
                    errorMapping.expectedStatus,
                    expect.any(String)
                );
            }
        ), { numRuns: 100 });
    });

    test('Property 5: Error Handling Comprehensiveness - For any invalid chat body, chatBedrockAgent should handle gracefully', async () => {
        // Set up environment variables for valid configuration
        const originalEnv = process.env;
        process.env = {
            ...originalEnv,
            BEDROCK_AGENT_ID: 'test-agent-id',
            BEDROCK_AGENT_ALIAS: 'test-alias',
            BEDROCK_AGENT_REGION: 'us-east-1'
        };

        try {
            await fc.assert(fc.asyncProperty(
                fc.oneof(
                    fc.constant(null),
                    fc.constant(undefined),
                    fc.string(),
                    fc.integer(),
                    fc.object({ messages: fc.string() }), // Invalid messages format
                    fc.object({ messages: fc.integer() }) // Invalid messages format
                ),
                async (invalidChatBody) => {
                    const { sendErrorMessage } = require('../common/streams.js');
                    sendErrorMessage.mockClear();
                    
                    await chatBedrockAgent(invalidChatBody, mockWritable, mockContext);
                    
                    // Should call sendErrorMessage for invalid input
                    expect(sendErrorMessage).toHaveBeenCalled();
                }
            ), { numRuns: 50 });
        } finally {
            process.env = originalEnv;
        }
    });
});