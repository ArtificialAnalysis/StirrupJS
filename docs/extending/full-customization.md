# Full Customization

For deep customization of the framework internals, you can clone the StirrupJS repository and modify the source code directly.

## When to Customize

Consider full customization when you need to:

- Modify core agent behavior (loop logic, context management)
- Change how tools are executed or validated
- Implement custom message formats or protocols
- Integrate with proprietary infrastructure
- Build a specialized framework on top of StirrupJS

For most use cases, you don't need full customization:
- **Custom tools**: Use the [Tools guide](../guides/tools.md)
- **Custom clients**: Use the [Clients guide](clients.md)
- **Custom loggers**: Use the [Loggers guide](loggers.md)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/ArtificialAnalysis/stirrupJS.git
cd stirrup-js
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 4. Run Examples

```bash
# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run an example
npx tsx examples/getting-started.ts
```

## Project Structure

```
stirrup-js/
├── src/                    # Source code
│   ├── core/              # Core agent logic
│   │   ├── agent.ts       # Agent class
│   │   ├── session.ts     # Session management
│   │   └── context.ts     # Context tracking
│   ├── clients/           # LLM clients
│   │   └── openai-client.ts
│   ├── tools/             # Built-in tools
│   │   ├── code-exec/     # Code execution
│   │   │   ├── base.ts
│   │   │   ├── local.ts
│   │   │   ├── docker.ts
│   │   │   └── e2b.ts
│   │   ├── web/           # Web tools
│   │   ├── finish.ts      # Finish tool
│   │   └── calculator.ts  # Calculator tool
│   ├── utils/             # Utilities
│   │   ├── logger.ts      # Logging
│   │   └── structured-logger.ts
│   └── index.ts           # Main exports
├── examples/              # Example code
├── docs/                  # Documentation
├── dist/                  # Compiled output
└── package.json
```

## Key Files to Customize

### Core Agent Logic

**`src/core/agent.ts`**
- Main agent loop
- Tool execution
- Message handling
- Context management

Example customization:

```typescript
// Add custom pre-processing before each turn
async processTurn() {
  // Your custom logic here
  await this.myCustomPreprocessing();

  // Original turn logic
  const response = await this.client.complete(/* ... */);

  // Your custom post-processing
  await this.myCustomPostprocessing(response);

  return response;
}
```

### Session Management

**`src/core/session.ts`**
- Session context
- File handling
- Tool initialization

Example customization:

```typescript
// Add custom session initialization
export async function createSessionState(agent: Agent): Promise<SessionState> {
  const state = {
    // Original state
    depth: getParentDepth(),
    execEnv: null,

    // Your custom additions
    customMetrics: new MyMetrics(),
    auditLog: new AuditLogger(),
  };

  return state;
}
```

### Tool Execution

**`src/core/agent.ts` - `executeTool()`**
- How tools are called
- Parameter validation
- Result handling

Example customization:

```typescript
async executeTool(toolCall: ToolCall) {
  // Add rate limiting
  await this.rateLimiter.checkLimit(toolCall.function.name);

  // Add logging
  this.auditLog.logToolCall(toolCall);

  // Original execution
  const result = await super.executeTool(toolCall);

  // Add custom result processing
  return this.processToolResult(result);
}
```

## Common Customizations

### 1. Custom Message Format

Modify how messages are structured:

```typescript
// src/core/agent.ts
interface CustomChatMessage extends ChatMessage {
  metadata?: {
    timestamp: number;
    userId?: string;
    sessionId?: string;
  };
}

class CustomAgent extends Agent {
  protected async addMessage(message: ChatMessage) {
    const customMessage: CustomChatMessage = {
      ...message,
      metadata: {
        timestamp: Date.now(),
        userId: this.currentUserId,
        sessionId: this.sessionId,
      },
    };

    this.messages.push(customMessage);
  }
}
```

### 2. Custom Context Summarization

Implement your own summarization strategy:

```typescript
// src/core/agent.ts
class CustomAgent extends Agent {
  protected async shouldSummarize(): Promise<boolean> {
    // Your custom logic
    const tokenCount = this.estimateTokens();
    const turnCount = this.messageHistory.length;

    // Summarize based on custom criteria
    return tokenCount > 50000 || turnCount > 20;
  }

  protected async summarizeContext() {
    // Your custom summarization
    const summary = await this.myCustomSummarizer(this.messages);
    this.messages = [summary, ...this.recentMessages];
  }
}
```

### 3. Tool Result Caching

Cache tool results to avoid redundant execution:

```typescript
// src/core/agent.ts
class CachingAgent extends Agent {
  private cache = new Map<string, ToolResult>();

  protected async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const cacheKey = this.getCacheKey(toolCall);

    if (this.cache.has(cacheKey)) {
      console.log('Cache hit:', toolCall.function.name);
      return this.cache.get(cacheKey)!;
    }

    const result = await super.executeTool(toolCall);
    this.cache.set(cacheKey, result);

    return result;
  }

  private getCacheKey(toolCall: ToolCall): string {
    return `${toolCall.function.name}:${toolCall.function.arguments}`;
  }
}
```

### 4. Custom Retry Logic

Add retry logic for failed tool calls:

```typescript
// src/core/agent.ts
class RetryAgent extends Agent {
  protected async executeTool(
    toolCall: ToolCall,
    maxRetries = 3
  ): Promise<ToolResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await super.executeTool(toolCall);
      } catch (error) {
        lastError = error as Error;
        console.log(`Attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          await this.delay(1000 * attempt); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 5. Telemetry and Monitoring

Add comprehensive telemetry:

```typescript
// src/core/agent.ts
class MonitoredAgent extends Agent {
  private metrics = {
    totalTurns: 0,
    toolCalls: new Map<string, number>(),
    errors: new Map<string, number>(),
    avgTurnDuration: 0,
  };

  protected async processTurn() {
    const startTime = Date.now();
    this.metrics.totalTurns++;

    try {
      const result = await super.processTurn();

      // Track successful turn
      const duration = Date.now() - startTime;
      this.updateAvgDuration(duration);

      return result;
    } catch (error) {
      // Track errors
      const errorType = error.constructor.name;
      this.metrics.errors.set(
        errorType,
        (this.metrics.errors.get(errorType) || 0) + 1
      );

      throw error;
    }
  }

  getMetrics() {
    return this.metrics;
  }
}
```

## Using Custom Code

### Option 1: Modify and Use Locally

```typescript
// Your application code
import { Agent } from './stirrup-js/src/core/agent.js';
import { ChatCompletionsClient } from './stirrup-js/src/clients/openai-client.js';

const agent = new Agent({
  client,
  // Your config
});
```

### Option 2: Build and Install Locally

```bash
# In stirrup-js directory
npm run build
npm link

# In your project
npm link @stirrup/stirrup
```

### Option 3: Publish Private Package

```bash
# Update package.json name
{
  "name": "@myorg/stirrup",
  "version": "1.0.0"
}

# Publish to private registry
npm publish --registry https://your-registry.com
```

## Testing Custom Changes

### Run Existing Tests

```bash
npm test
```

### Add Your Own Tests

```typescript
// tests/custom-agent.test.ts
import { describe, it, expect } from 'vitest';
import { CustomAgent } from '../src/core/custom-agent';

describe('CustomAgent', () => {
  it('should implement custom behavior', async () => {
    const agent = new CustomAgent({ /* ... */ });
    // Your tests
  });
});
```

## Contributing Back

If your customization would benefit others, consider contributing:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

See `CONTRIBUTING.md` in the repository.

## Examples in the Wild

Check out these projects using StirrupJS:

- [StirrupJS](https://github.com/ArtificialAnalysis/stirrupJS) - The main repository
- [Stirrup](https://github.com/ArtificialAnalysis/Stirrup) - Python version

## Best Practices

1. **Extend, don't modify**: Use class extension when possible
2. **Keep it compatible**: Maintain public API compatibility
3. **Document changes**: Comment your customizations
4. **Test thoroughly**: Write tests for custom behavior
5. **Version control**: Track your modifications separately
6. **Stay updated**: Regularly sync with upstream

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Discussions**: Ask questions and share customizations
- **Documentation**: Check the guides and API reference

## Next Steps

- [Custom Clients](clients.md) - Implement custom LLM clients
- [Custom Tools](tools.md) - Advanced tool patterns
- [Custom Loggers](loggers.md) - Implement custom logging
