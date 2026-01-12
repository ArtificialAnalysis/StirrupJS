# ChatCompletionsClient API Reference

The `ChatCompletionsClient` provides OpenAI-compatible API support for chat completions.

## Constructor

```typescript
new ChatCompletionsClient(config: ChatCompletionsClientConfig)
```

### ChatCompletionsClientConfig

```typescript
interface ChatCompletionsClientConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens?: number;
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `apiKey` | `string` | Yes | API key for authentication |
| `baseURL` | `string` | Yes | Base URL for API endpoint |
| `model` | `string` | Yes | Model identifier |
| `maxTokens` | `number` | No | Maximum tokens in response |

## Properties

### name

```typescript
readonly name: string
```

Client identifier (returns the model name).

## Methods

### complete()

```typescript
async complete(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal
): Promise<ChatCompletionResponse>
```

Send a chat completion request.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `messages` | `ChatMessage[]` | Conversation history |
| `tools` | `ToolDefinition[]` | Available tools |
| `signal` | `AbortSignal` | Optional cancellation signal |

**Returns:**

```typescript
interface ChatCompletionResponse {
  message: ChatMessage;
  tokenUsage?: {
    input: number;
    output: number;
  };
}
```

## Usage Examples

### OpenRouter

```typescript
import { ChatCompletionsClient } from 'stirrupjs/clients';

const client = new ChatCompletionsClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4.5',
  maxTokens: 100_000,
});
```

### OpenAI

```typescript
const client = new ChatCompletionsClient({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-5.2',
  maxTokens: 8000,
});
```

### Together AI

```typescript
const client = new ChatCompletionsClient({
  apiKey: process.env.TOGETHER_API_KEY!,
  baseURL: 'https://api.together.xyz/v1',
  model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  maxTokens: 8000,
});
```

### Deepseek

```typescript
const client = new ChatCompletionsClient({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  maxTokens: 4000,
});
```

## Error Handling

```typescript
try {
  const response = await client.complete(messages, tools);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request cancelled');
  } else if (error.response?.status === 429) {
    console.log('Rate limited');
  } else {
    console.error('API error:', error);
  }
}
```

## See Also

- [Custom Clients](../../extending/clients.md) - Implement custom clients
- [Core Concepts](../../concepts.md#client) - Client overview
