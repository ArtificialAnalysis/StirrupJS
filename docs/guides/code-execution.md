# Code Execution

StirrupJS includes three code execution backends: local, Docker, and E2B cloud sandboxes. All backends provide the same `code_exec` tool interface.

## Overview

The `code_exec` tool allows agents to execute shell commands in an isolated environment. This is one of the most powerful built-in tools.

**Common use cases:**
- Installing and using Python packages
- Data analysis and visualization
- File processing and conversion
- Running scripts and automation
- Image and video manipulation

## Local Execution (Default)

The `LocalCodeExecToolProvider` executes commands in a temporary directory on your machine.

### Basic Usage

```typescript
import { LocalCodeExecToolProvider } from 'stirrupjs/tools';

const agent = new Agent({
  client,
  tools: [new LocalCodeExecToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

Or use `DEFAULT_TOOLS` which includes local execution:

```typescript
import { DEFAULT_TOOLS } from 'stirrupjs';

const agent = new Agent({
  client,
  tools: DEFAULT_TOOLS,  // Includes LocalCodeExecToolProvider
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### Features

- **Isolated temp directory**: Each session gets a fresh temp directory
- **Security**: Commands run with current user permissions
- **uv package manager**: Recommended for Python packages (fast, reliable)
- **File access**: Read/write files in execution directory
- **Output capture**: Returns stdout, stderr, and exit code

### Example

```typescript
await using session = agent.session({ outputDir: './output' });

await session.run(`
  Create a Python script that generates a sine wave chart:
  1. Use matplotlib to create the chart
  2. Save as sine_wave.png
  3. Call finish with the file path
`);

// File automatically saved to ./output/sine_wave.png
```

### Command Restrictions

You can restrict which commands are allowed:

```typescript
const provider = new LocalCodeExecToolProvider([
  'python',
  'node',
  'uv',
  'pip',
]);
```

### Custom Temp Directory

```typescript
const provider = new LocalCodeExecToolProvider(
  undefined,  // No command restrictions
  '/custom/temp/path'
);
```

## Docker Execution

The `DockerCodeExecToolProvider` runs commands in Docker containers for better isolation.

### Installation

Requires Docker to be installed and running on your machine.

### Basic Usage

```typescript
import { DockerCodeExecToolProvider } from 'stirrupjs/tools';

const agent = new Agent({
  client,
  tools: [new DockerCodeExecToolProvider('python:3.12-slim')],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### Configuration

```typescript
const provider = new DockerCodeExecToolProvider(
  'python:3.12-slim',  // Docker image
  undefined,           // Allowed commands (undefined = all)
  undefined,           // Temp directory base path
  'Docker code execution'  // Custom description
);
```

### Features

- **Full isolation**: Commands run in containers
- **Consistent environment**: Same environment every time
- **Security**: Better isolation than local execution
- **Custom images**: Use any Docker image
- **File access**: Files automatically mounted

### Example Images

```typescript
// Python with scientific packages
new DockerCodeExecToolProvider('python:3.12-slim')

// Node.js
new DockerCodeExecToolProvider('node:20-alpine')

// Custom image with dependencies
new DockerCodeExecToolProvider('myorg/custom-agent-env:latest')
```

### Limitations

- Slower startup (container creation)
- Requires Docker installed
- More resource intensive

## E2B Cloud Sandboxes

The `E2BCodeExecToolProvider` runs commands in E2B cloud sandboxes - fully isolated, cloud-based environments.

### Installation

Sign up for E2B: https://e2b.dev

Set your API key:
```bash
export E2B_API_KEY='your-key-here'
```

### Basic Usage

```typescript
import { E2BCodeExecToolProvider } from 'stirrupjs/tools';

const agent = new Agent({
  client,
  tools: [new E2BCodeExecToolProvider({
    apiKey: process.env.E2B_API_KEY!,
    template: 'base',
  })],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### Configuration

```typescript
const provider = new E2BCodeExecToolProvider({
  apiKey: process.env.E2B_API_KEY!,
  template: 'base',           // E2B template
  metadata: { user: 'alice' }, // Optional metadata
  timeoutMs: 60000,           // Execution timeout
});
```

### Features

- **Cloud-based**: No local setup required
- **Scalable**: Automatic resource management
- **Secure**: Complete isolation in cloud
- **Fast**: Pre-warmed environments
- **Consistent**: Same environment everywhere

### Templates

E2B provides pre-built templates:

- `base`: Basic Ubuntu environment
- `python`: Python with common packages
- `node`: Node.js environment
- Custom: Create your own templates

See [E2B templates](https://e2b.dev/docs/templates) for details.

### Advantages

- No Docker installation needed
- Better for production deployments
- Scales automatically
- Consistent across development/production

### Limitations

- Requires internet connection
- Costs money (has free tier)
- Slightly higher latency than local

## Choosing a Backend

| Backend | Best For | Pros | Cons |
|---------|----------|------|------|
| **Local** | Development, prototyping | Fast, free, simple setup | Less isolation, requires local environment |
| **Docker** | Production, better isolation | Good isolation, consistent env | Slower startup, needs Docker |
| **E2B** | Production, scale | Cloud-based, secure, scalable | Costs money, needs internet |

### Recommendations

- **Development**: Use `LocalCodeExecToolProvider` (fastest iteration)
- **Production** (self-hosted): Use `DockerCodeExecToolProvider` (better isolation)
- **Production** (cloud): Use `E2BCodeExecToolProvider` (easiest deployment)

## Using Python Packages

All backends support package installation. We recommend using `uv` for fast, reliable package management.

### Example Task

```typescript
await session.run(`
  Create a data visualization:
  1. Use 'uv pip install matplotlib pandas'
  2. Load data from data.csv
  3. Create a bar chart
  4. Save as chart.png
  5. Call finish with the file path
`);
```

### Package Installation with uv

```typescript
// Agent automatically uses uv
await session.run(`
  Install pandas and analyze data.csv:
  1. Run: uv pip install pandas
  2. Load the CSV
  3. Calculate statistics
  4. Print results
`);
```

### Traditional pip

```typescript
await session.run(`
  Use traditional pip if needed:
  1. Run: pip install requests
  2. Fetch data from API
  3. Process and save
`);
```

## Working with Files

### Creating Files

The agent can create files in its execution directory:

```typescript
await using session = agent.session({ outputDir: './results' });

await session.run(`
  Create three files:
  1. data.json - some JSON data
  2. chart.png - a visualization
  3. report.txt - a summary

  Call finish with all three file paths.
`);

// All three files saved to ./results/
```

### Reading Files

Files in the execution directory can be read:

```typescript
await session.run(`
  Read the file 'input.txt' and count words.
  The file should be in the current directory.
`);
```

### File Persistence

Files persist within a session:

```typescript
await session.run('Create data.csv with sample data');
await session.run('Load data.csv and create a chart');
// data.csv is still available
```

But are cleaned up when session ends:

```typescript
await using session = agent.session();
await session.run('Create temp.txt');
// Session ends, temp.txt is deleted
```

## Security Considerations

### Local Execution

- Commands run with your user permissions
- Can access files on your system
- Use `allowedCommands` to restrict execution
- Consider using Docker for untrusted code

### Docker Execution

- Commands isolated in containers
- Cannot access host filesystem (except mounted volumes)
- Better for running untrusted code
- Still requires Docker daemon access

### E2B Execution

- Full isolation in cloud sandboxes
- Cannot access local system
- Best security for untrusted code
- Network access can be restricted

### Best Practices

1. **Validate user input**: Never pass unsanitized user input directly to commands
2. **Restrict commands**: Use `allowedCommands` in local/Docker
3. **Use Docker/E2B**: For production or untrusted code
4. **Monitor execution**: Use structured logging to track commands
5. **Set timeouts**: Prevent infinite loops/long-running commands

## Advanced Usage

### Custom Command Restrictions

```typescript
const provider = new LocalCodeExecToolProvider([
  'python',    // Allow Python
  'python3',   // And Python3
  'uv',        // And uv
  'node',      // And Node.js
  // Block everything else (bash, rm, etc.)
]);
```

### Custom Description

Help the agent understand the environment:

```typescript
const provider = new LocalCodeExecToolProvider(
  undefined,
  undefined,
  'Execute commands in a Python 3.12 environment with numpy, pandas, and matplotlib pre-installed. Use uv for package management.'
);
```

### Multiple Execution Environments

```typescript
const pythonEnv = new DockerCodeExecToolProvider('python:3.12');
const nodeEnv = new DockerCodeExecToolProvider('node:20');

const agent = new Agent({
  client,
  tools: [pythonEnv, nodeEnv],  // Error: Only one code exec provider allowed
  finishTool: SIMPLE_FINISH_TOOL,
});
```

!!! warning "One Code Exec Provider"
    Agents can only have one code execution provider. Use Docker/E2B with pre-installed tools if you need multiple languages.

## Examples

### Data Analysis

```typescript
await session.run(`
  Analyze sales_data.csv:
  1. Install pandas: uv pip install pandas
  2. Load the CSV
  3. Calculate total sales, average, and top 5 products
  4. Print results in a formatted table
`);
```

### Image Processing

```typescript
await session.run(`
  Process image.jpg:
  1. Install Pillow: uv pip install Pillow
  2. Resize to 800x600
  3. Apply blur filter
  4. Save as processed.jpg
  5. Call finish with the path
`);
```

### Web Scraping

```typescript
await session.run(`
  Scrape data from example.com:
  1. Install beautifulsoup4 requests: uv pip install beautifulsoup4 requests
  2. Fetch the page
  3. Extract all article titles
  4. Save to titles.json
  5. Call finish with the path
`);
```

## Next Steps

- [Creating Tools](tools.md) - Build custom tools
- [Tool Providers](tool-providers.md) - Advanced tool management
- [Examples](../examples.md) - More code execution examples
