import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";

const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

const input = {
    agentId: '3RAM4VDCCU',
    agentAliasId: 'ZE8JEFLFIU',
    sessionId: 'debug-session-123',
    inputText: 'Hello, how are you?',
    enableTrace: false
};

console.log('Invoking Bedrock Agent...');

try {
    const command = new InvokeAgentCommand(input);
    const response = await client.send(command);
    
    console.log('Response received, processing stream...');
    
    let eventCount = 0;
    let chunkCount = 0;
    let totalText = '';
    
    if (response.completion) {
        for await (const event of response.completion) {
            eventCount++;
            console.log(`\n=== Event ${eventCount} ===`);
            console.log('Event keys:', Object.keys(event));
            
            if (event.chunk) {
                chunkCount++;
                console.log(`Chunk ${chunkCount} keys:`, Object.keys(event.chunk));
                
                if (event.chunk.bytes) {
                    const decoder = new TextDecoder();
                    const text = decoder.decode(event.chunk.bytes);
                    totalText += text;
                    console.log(`Chunk ${chunkCount} text:`, JSON.stringify(text));
                    console.log(`Chunk ${chunkCount} bytes length:`, event.chunk.bytes.length);
                } else {
                    console.log(`Chunk ${chunkCount} has no bytes`);
                }
            }
            
            if (event.trace) {
                console.log('Trace event:', event.trace);
            }
            
            // Log any other properties
            const otherKeys = Object.keys(event).filter(key => key !== 'chunk' && key !== 'trace');
            if (otherKeys.length > 0) {
                console.log('Other event properties:', otherKeys);
                otherKeys.forEach(key => {
                    console.log(`  ${key}:`, event[key]);
                });
            }
        }
    } else {
        console.log('No completion stream in response');
    }
    
    console.log('\n=== Summary ===');
    console.log('Total events:', eventCount);
    console.log('Total chunks:', chunkCount);
    console.log('Total text length:', totalText.length);
    console.log('Total text:', JSON.stringify(totalText));
    
} catch (error) {
    console.error('Error:', error);
}