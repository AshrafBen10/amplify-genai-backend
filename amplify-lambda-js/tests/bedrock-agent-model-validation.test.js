//Copyright (c) 2024 Vanderbilt University  
//Authors: Jules White, Allen Karns, Karely Rodriguez, Max Moundas

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { isBedrockAgentModel } from '../common/params.js';

/**
 * Feature: bedrock-agent-integration, Property 6: Model Validation Compatibility
 * **Validates: Requirements 3.4, 3.5**
 */

describe('Bedrock Agent Model Validation', () => {
    test('Property 6: Model Validation Compatibility - For any valid agent model ID, isBedrockAgentModel should return true', () => {
        fc.assert(fc.property(
            fc.oneof(
                fc.constant('bedrock-agent'),
                fc.string().filter(s => s.startsWith('bedrock-agent-')),
                fc.string().filter(s => s.includes('agent') && s.length > 5)
            ),
            (modelId) => {
                const result = isBedrockAgentModel(modelId);
                expect(result).toBe(true);
            }
        ), { numRuns: 100 });
    });

    test('Property 6: Model Validation Compatibility - For any non-agent model ID, isBedrockAgentModel should return false', () => {
        fc.assert(fc.property(
            fc.oneof(
                fc.string().filter(s => s.includes('gpt')),
                fc.string().filter(s => s.includes('claude')),
                fc.string().filter(s => s.includes('gemini')),
                fc.string().filter(s => s.startsWith('anthropic')),
                fc.string().filter(s => !s.includes('agent') && s.length > 0)
            ),
            (modelId) => {
                const result = isBedrockAgentModel(modelId);
                expect(result).toBe(false);
            }
        ), { numRuns: 100 });
    });

    test('Property 6: Model Validation Compatibility - For any invalid input, isBedrockAgentModel should return false', () => {
        fc.assert(fc.property(
            fc.oneof(
                fc.constant(null),
                fc.constant(undefined),
                fc.constant(''),
                fc.integer(),
                fc.object()
            ),
            (invalidInput) => {
                const result = isBedrockAgentModel(invalidInput);
                expect(result).toBe(false);
            }
        ), { numRuns: 100 });
    });
});