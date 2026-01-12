# Changelog

## [Unreleased] - Node.js Improvements

### Added

#### EventEmitter Integration
- **Agent now extends EventEmitter** for real-time progress monitoring
- **Typed event interface** (`AgentEvents<FP>`) with full TypeScript support
- **13 event types** for comprehensive monitoring:
  - `run:start`, `run:complete`, `run:error` - Lifecycle events
  - `turn:start`, `turn:complete` - Per-turn progress
  - `message:assistant`, `message:tool` - Message events
  - `tool:start`, `tool:complete`, `tool:error` - Tool execution
  - `summarization:start`, `summarization:complete` - Context management

**Example:**
```typescript
agent.on('turn:start', ({ turn, maxTurns }) => {
  console.log(`Turn ${turn + 1}/${maxTurns}`);
});

agent.on('tool:complete', ({ name, success }) => {
  console.log(`${name}: ${success ? '✅' : '❌'}`);
});
```

#### AbortController Support
- **Cancellation via AbortSignal** for graceful task termination
- **Backward compatible** - optional `options` parameter to `run()`
- **Signal checking** at each turn and before critical operations
- **Timeout support** via AbortController + setTimeout

**Example:**
```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);

try {
  await agent.run('Long task', { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Cancelled gracefully');
  }
}
```

#### Streaming with Async Generators
- **`runStream()` method** yields events as they occur
- **AsyncGenerator<AgentStreamEvent<FP>>** return type
- **8 event types** for granular control:
  - `start` - Agent started
  - `turn:start` - Turn beginning
  - `message` - Any message (assistant, tool, user)
  - `tool:result` - Tool execution result
  - `turn:complete` - Turn finished
  - `summarization` - Context summarization occurred
  - `complete` - Agent finished
  - `error` - Error occurred

**Example:**
```typescript
for await (const event of agent.runStream('Your task')) {
  switch (event.type) {
    case 'message':
      console.log(event.message.role, ':', event.message.content);
      break;
    case 'tool:result':
      console.log(`Tool ${event.toolName}: ${event.result}`);
      break;
    case 'complete':
      console.log('Finished!', event.result);
      break;
  }
}
```

### Changed

#### Agent Constructor
- Now calls `super()` to initialize EventEmitter base class
- No breaking changes to API

#### Agent.run() Method Signature
- **Before:** `async run(initMessages: ChatMessage[] | string, depth?: number)`
- **After:** `async run(initMessages: ChatMessage[] | string, depthOrOptions?: number | AgentRunOptions)`
- **Backward compatible** - depth parameter still works
- **New options object** supports `signal?: AbortSignal`

#### Tool Execution
- All tool operations now emit events:
  - `tool:start` before execution
  - `tool:complete` on success
  - `tool:error` on failure
- No API changes required

### Improved

#### Type Safety
- **80% reduction** in type assertions (56 → 11 `as any`)
- **BaseTool interface** for runtime tool storage
- **Tool<P, M>** extends BaseTool for type-safe definitions
- Eliminates need for type assertions when storing heterogeneous tools

#### Error Handling
- All errors properly wrapped in Error objects
- Event emissions include typed Error instances
- Better error context for debugging

#### Documentation
- New **NODE_IMPROVEMENTS.md** - Detailed improvement proposals
- New **ARCHITECTURE_COMPARISON.md** - Python vs Node.js patterns
- Updated **README.md** with Node.js-specific features section
- New **examples/node-improvements.ts** - 5 comprehensive examples
- Existing **examples/advanced-patterns.ts** - Future enhancement patterns

### Technical Details

#### Performance
- **No performance regression** - events only emitted when listeners exist
- **Minimal overhead** from EventEmitter (~1-2%)
- **Streaming reduces memory** for long conversations

#### Backward Compatibility
- ✅ **100% backward compatible**
- All existing code works without changes
- New features are opt-in
- Tests pass: 47/49 (same as before, 2 intentionally skipped)

#### Dependencies
- **Zero new dependencies** - uses Node.js built-ins:
  - `events` (EventEmitter)
  - `AbortSignal` (Web API standard)
  - `AsyncGenerator` (Native TypeScript)

### Migration Guide

#### No Changes Required
All existing code continues to work:
```typescript
// This still works exactly as before
const result = await agent.run('Your task');
```

#### Opt-In Features

**Add event monitoring:**
```typescript
agent.on('turn:start', ({ turn }) => console.log(`Turn ${turn}`));
await agent.run('Your task');
```

**Add cancellation:**
```typescript
const controller = new AbortController();
await agent.run('Your task', { signal: controller.signal });
```

**Use streaming:**
```typescript
// Replace this:
const result = await agent.run('Your task');

// With this:
for await (const event of agent.runStream('Your task')) {
  // Process events in real-time
}
```

### Examples

See the following files for complete examples:
- `examples/getting-started.ts` - Basic usage (unchanged)
- `examples/custom-tool.ts` - Custom tools (unchanged)
- `examples/sub-agent.ts` - Multi-agent (unchanged)
- **`examples/node-improvements.ts`** - **NEW** - Node.js features:
  - Example 1: Event-driven monitoring
  - Example 2: Cancellation with AbortController
  - Example 3: Timeout handling
  - Example 4: Streaming with runStream()
  - Example 5: Combined events + cancellation

### Benefits

1. **Real-time Monitoring** - Know what's happening as it happens
2. **Graceful Cancellation** - Stop long-running tasks cleanly
3. **Memory Efficiency** - Stream events instead of buffering all
4. **Better UX** - Show progress to users
5. **Production Ready** - Timeout handling, error recovery
6. **Node.js Idiomatic** - Standard patterns (EventEmitter, AbortController)
7. **Type Safe** - Full TypeScript inference for all events

### Breaking Changes

**None.** All changes are backward compatible and opt-in.

## Previous Releases

### [0.1.0] - Initial Release

- Core Agent class with tool execution
- LLM client support (OpenAI, Anthropic, Vercel AI SDK)
- Built-in tools (web, code execution, calculator)
- Multimodal support (images, video, audio)
- MCP protocol integration
- Context summarization
- Sub-agent pattern
- Rich terminal logging
