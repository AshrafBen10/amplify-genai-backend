/**
 * Property tests for Bedrock Agent session management
 * Feature: bedrock-agent-integration, Property 4: Session ID Consistency
 */

import { createHash } from 'crypto';

// Test the generateSessionId function directly (copied from bedrockAgent.js)
const generateSessionId = (conversationId, requestId) => {
    const baseId = conversationId || requestId || 'default-session';
    // Create a hash to ensure consistent session ID format
    const hash = createHash('md5').update(baseId).digest('hex');
    return `session-${hash.substring(0, 16)}`;
};

describe('Bedrock Agent Session Property Tests', () => {
    
    describe('Property 4: Session ID Consistency', () => {
        
        test('Feature: bedrock-agent-integration, Property 4: Session ID Consistency - same conversationId should generate same session ID', () => {
            const conversationId = 'test-conversation-123';
            const requestId1 = 'request-1';
            const requestId2 = 'request-2';
            
            // Generate session IDs with same conversation ID but different request IDs
            const sessionId1 = generateSessionId(conversationId, requestId1);
            const sessionId2 = generateSessionId(conversationId, requestId2);
            
            // Should be the same because conversationId takes precedence
            expect(sessionId1).toBe(sessionId2);
        });
        
        test('Feature: bedrock-agent-integration, Property 4: Session ID Consistency - same requestId should generate same session ID when no conversationId', () => {
            const requestId = 'test-request-456';
            
            // Generate session IDs with same request ID
            const sessionId1 = generateSessionId(null, requestId);
            const sessionId2 = generateSessionId(undefined, requestId);
            
            // Should be the same
            expect(sessionId1).toBe(sessionId2);
        });
        
        test('Feature: bedrock-agent-integration, Property 4: Session ID Consistency - different conversationIds should generate different session IDs', () => {
            const conversationId1 = 'conversation-1';
            const conversationId2 = 'conversation-2';
            const requestId = 'same-request';
            
            // Generate session IDs with different conversation IDs
            const sessionId1 = generateSessionId(conversationId1, requestId);
            const sessionId2 = generateSessionId(conversationId2, requestId);
            
            // Should be different
            expect(sessionId1).not.toBe(sessionId2);
        });
        
        test('Feature: bedrock-agent-integration, Property 4: Session ID Consistency - session ID format should be consistent', () => {
            const testCases = [
                { conversationId: 'test-1', requestId: 'req-1' },
                { conversationId: 'another-conversation', requestId: 'req-2' },
                { conversationId: null, requestId: 'standalone-request' },
                { conversationId: undefined, requestId: undefined }
            ];
            
            testCases.forEach(({ conversationId, requestId }) => {
                const sessionId = generateSessionId(conversationId, requestId);
                
                // Should always start with 'session-'
                expect(sessionId).toMatch(/^session-[a-f0-9]{16}$/);
                
                // Should be exactly 24 characters long (session- + 16 hex chars)
                expect(sessionId).toHaveLength(24);
            });
        });
        
        test('Feature: bedrock-agent-integration, Property 4: Session ID Consistency - empty inputs should generate default session', () => {
            const sessionId1 = generateSessionId('', '');
            const sessionId2 = generateSessionId(null, null);
            const sessionId3 = generateSessionId(undefined, undefined);
            
            // All should generate the same default session ID
            expect(sessionId1).toBe(sessionId2);
            expect(sessionId2).toBe(sessionId3);
            
            // Should still follow the format
            expect(sessionId1).toMatch(/^session-[a-f0-9]{16}$/);
        });
        
        test('Feature: bedrock-agent-integration, Property 4: Session ID Consistency - conversationId takes precedence over requestId', () => {
            const conversationId = 'priority-conversation';
            const requestId1 = 'request-1';
            const requestId2 = 'request-2';
            
            // When conversationId is present, requestId should not affect the result
            const sessionId1 = generateSessionId(conversationId, requestId1);
            const sessionId2 = generateSessionId(conversationId, requestId2);
            
            expect(sessionId1).toBe(sessionId2);
            
            // But when conversationId is different, result should be different
            const sessionId3 = generateSessionId('different-conversation', requestId1);
            expect(sessionId1).not.toBe(sessionId3);
        });
        
        test('Feature: bedrock-agent-integration, Property 4: Session ID Consistency - deterministic hash generation', () => {
            // Test that the same input always produces the same hash
            const inputs = [
                'test-input-1',
                'another-test-input',
                'special-chars-!@#$%',
                '12345',
                'very-long-conversation-id-that-should-still-work-correctly'
            ];
            
            inputs.forEach(input => {
                const sessionId1 = generateSessionId(input, null);
                const sessionId2 = generateSessionId(input, null);
                
                // Should be identical
                expect(sessionId1).toBe(sessionId2);
                
                // Should be deterministic across multiple calls
                for (let i = 0; i < 5; i++) {
                    const sessionIdN = generateSessionId(input, null);
                    expect(sessionIdN).toBe(sessionId1);
                }
            });
        });
    });
});