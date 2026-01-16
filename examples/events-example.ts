/**
 * Events Example
 * Demonstrates how to work with agent events for monitoring and control
 *
 * To run this example:
 *   1. Create a .env file with: OPENROUTER_API_KEY=your-key-here
 *   2. Run: npx tsx examples/events-example.ts
 */

import { ChatCompletionsClient } from '../src/clients/openai-client.js';
import { Agent, SIMPLE_FINISH_TOOL, type AgentRunResult, type FinishParams } from '../src/index.js';
import { WebToolProvider } from '../src/tools/web/provider.js';
import { getApiConfig, loadEnv } from './_helpers.js';

// Load environment variables
loadEnv();

// ============================================================================
// Example 1: Basic Event Monitoring
// ============================================================================

async function example1_BasicEvents() {
  console.log('\n========================================');
  console.log('Example 1: Basic Event Monitoring');
  console.log('========================================\n');

  const { apiKey, baseURL, model } = getApiConfig();
  const client = new ChatCompletionsClient({
    apiKey,
    baseURL,
    model,
  });

  const agent = new Agent({
    client,
    name: 'event-agent',
    maxTurns: 5,
    tools: [new WebToolProvider()],
    finishTool: SIMPLE_FINISH_TOOL,
  });

  // Set up event listeners for real-time monitoring
  agent.on('run:start', ({ task }) => {
    console.log('🚀 Agent started');
    console.log('   Task:', typeof task === 'string' ? task : '[complex task]');
  });

  agent.on('turn:start', ({ turn, maxTurns }) => {
    console.log(`\n📍 Turn ${turn + 1}/${maxTurns}`);
  });

  agent.on('message:assistant', ({ content, toolCalls }) => {
    if (content) {
      console.log('💬 Assistant:', content.substring(0, 100));
    }
    if (toolCalls && toolCalls.length > 0) {
      console.log('🔧 Tool calls:', toolCalls.map((tc) => tc.name).join(', '));
    }
  });

  agent.on('tool:start', ({ name }) => {
    console.log(`   ⚙️  Starting tool: ${name}`);
  });

  agent.on('tool:complete', ({ name, success }) => {
    console.log(`   ${success ? '✅' : '❌'} Tool complete: ${name}`);
  });

  agent.on('tool:error', ({ name, error }) => {
    console.log(`   ❌ Tool error: ${name} - ${error.message}`);
  });

  agent.on('turn:complete', ({ tokenUsage }) => {
    if (tokenUsage) {
      console.log(`   📊 Tokens: ${tokenUsage.input + tokenUsage.output} total`);
    }
  });

  agent.on('run:complete', ({ result, duration }) => {
    console.log(`\n✅ Agent completed in ${duration}ms`);
    console.log('   Total turns:', result.messageHistory.length);
    if (result.finishParams) {
      console.log('   Finished:', JSON.stringify(result.finishParams));
    }
  });

  agent.on('run:error', ({ error, duration }) => {
    console.log(`\n❌ Agent failed after ${duration}ms: ${error.message}`);
  });

  // Run the agent with session
  // Note: We disable the default logger here to avoid duplicate logs with our custom event listeners
  await using session = agent.session({ noLogger: true });
  const result: AgentRunResult<FinishParams> = await session.run(
    'What is 2+2? When you know the answer, call the finish tool.'
  );
}

// ============================================================================
// Example 2: Streaming with Async Generators
// ============================================================================

async function example2_Streaming() {
  console.log('\n========================================');
  console.log('Example 2: Streaming with runStream()');
  console.log('========================================\n');

  const { apiKey, baseURL, model } = getApiConfig();
  const client = new ChatCompletionsClient({
    apiKey,
    baseURL,
    model,
  });

  const agent = new Agent({
    client,
    name: 'streaming-agent',
    maxTurns: 5,
    finishTool: SIMPLE_FINISH_TOOL,
  });

  console.log('🌊 Streaming agent events...\n');

  let result: AgentRunResult<FinishParams> | undefined;
  // Use async generator to stream events
  for await (const event of agent.runStream('What is 2+2? Call finish when done.')) {
    switch (event.type) {
      case 'start':
        console.log('🚀 Started');
        break;

      case 'turn:start':
        console.log(`\n📍 Turn ${event.turn + 1}/${event.maxTurns}`);
        break;

      case 'message':
        if (event.message.role === 'assistant') {
          const content =
            typeof event.message.content === 'string' ? event.message.content : JSON.stringify(event.message.content);
          console.log('💬 Assistant:', content.substring(0, 80));
        } else if (event.message.role === 'tool') {
          console.log('🔧 Tool result received');
        }
        break;

      case 'tool:result':
        console.log(`   ${event.success ? '✅' : '❌'} ${event.toolName}`);
        break;

      case 'turn:complete':
        if (event.tokenUsage) {
          const total = event.tokenUsage.input + event.tokenUsage.output;
          console.log(`   📊 ${total} tokens used`);
        }
        break;

      case 'summarization':
        console.log('📝 Context summarized');
        break;

      case 'complete':
        console.log('\n✅ Stream complete');
        console.log('   Message groups:', event.result.messageHistory.length);
        result = event.result;
        break;

      case 'error':
        console.log('\n❌ Stream error:', event.error.message);
        break;
    }
  }

  console.log('\n=== Agent Result ===');
  console.log(JSON.stringify(result, null, 2));
}

// ============================================================================
// Example 3: Cancellation with AbortController
// ============================================================================

async function example3_Cancellation() {
  console.log('\n========================================');
  console.log('Example 3: Cancellation with AbortController');
  console.log('========================================\n');

  const { apiKey, baseURL, model } = getApiConfig();
  const client = new ChatCompletionsClient({
    apiKey,
    baseURL,
    model,
  });

  const agent = new Agent({
    client,
    name: 'cancellable-agent',
    maxTurns: 30,
    finishTool: SIMPLE_FINISH_TOOL,
  });

  // Create abort controller
  const controller = new AbortController();

  // Set up monitoring
  let turnCount = 0;
  agent.on('turn:start', ({ turn }) => {
    turnCount = turn + 1;
    console.log(`Turn ${turnCount}...`);

    // Cancel after 3 turns
    if (turnCount >= 3) {
      console.log('\n⏰ Cancelling after 3 turns...');
      controller.abort('Maximum turns reached');
    }
  });

  // Run with cancellation support and session
  // Note: We disable the default logger to keep the output clean for this example
  await using session = agent.session({ noLogger: true });
  try {
    const result: AgentRunResult<FinishParams> = await session.run('Count to 100, one number per turn.', {
      signal: controller.signal,
    });
    console.log('Completed normally');
    console.log('\n=== Agent Result ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('✅ Successfully cancelled after', turnCount, 'turns');
    } else {
      console.error('❌ Unexpected error:', error);
    }
  }
}

// ============================================================================
// Example 4: Structured Logging
// ============================================================================

async function example4_StructuredLogging() {
  console.log('\n========================================');
  console.log('Example 4: Structured Logging');
  console.log('========================================\n');

  const { apiKey, baseURL, model } = getApiConfig();
  const client = new ChatCompletionsClient({
    apiKey,
    baseURL,
    model,
  });

  const agent = new Agent({
    client,
    name: 'logging-agent',
    maxTurns: 5,
    finishTool: SIMPLE_FINISH_TOOL,
  });

  // The session automatically attaches the structured logger by default
  // This provides formatted console output with boxes for messages, tool results, and summaries
  await using session = agent.session();
  await session.run('What is 2+2? Call finish when done.');
}

// ============================================================================
// Example 5: Combined Events and Structured Logging
// ============================================================================

async function example5_Combined() {
  console.log('\n========================================');
  console.log('Example 5: Combined Events + Logging');
  console.log('========================================\n');

  const { apiKey, baseURL, model } = getApiConfig();
  const client = new ChatCompletionsClient({
    apiKey,
    baseURL,
    model,
  });

  const agent = new Agent({
    client,
    name: 'combined-agent',
    maxTurns: 5,
    tools: [new WebToolProvider()],
    finishTool: SIMPLE_FINISH_TOOL,
  });

  // Add custom event handlers alongside the structured logger
  // These can be used for custom metrics, alerts, or side effects
  agent.on('tool:complete', ({ name, success }) => {
    // Example: Send metrics to monitoring system
    console.log(`[METRICS] Tool ${name} completed: ${success ? 'success' : 'failure'}`);
  });

  agent.on('run:complete', ({ duration }) => {
    // Example: Log to external system
    console.log(`[METRICS] Total run duration: ${duration}ms`);
  });

  // The structured logger runs alongside custom event handlers
  await using session = agent.session();
  await session.run('What is 2+2? Call finish when done.');
}

// ============================================================================
// Main
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🎯 Events Example\n');
  console.log('Demonstrates how to work with agent events:');
  console.log('  • Basic event monitoring');
  console.log('  • Streaming with async generators');
  console.log('  • Cancellation with AbortController');
  console.log('  • Structured logging');
  console.log('  • Combining events and cancellation');

  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error('\n❌ Error: API key not set');
    console.log('Please set OPENROUTER_API_KEY in your .env file');
    console.log('Recommended: Use OpenRouter with Claude Sonnet 4.5');
    process.exit(1);
  }

  // Run examples - uncomment the ones you want to try:
  // await example1_BasicEvents();
  // await example2_Streaming();
  // await example3_Cancellation();
  // await example4_StructuredLogging();
  await example5_Combined();

  console.log('\n✨ Demo complete!');
}
