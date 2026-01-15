/**
 * Tool exports and DEFAULT_TOOLS
 */

export { SIMPLE_FINISH_TOOL, FinishParamsSchema, type FinishParams } from './finish.js';
export { CALCULATOR_TOOL, CalculatorParamsSchema, type CalculatorParams } from './calculator.js';
export { USER_INPUT_TOOL, UserInputParamsSchema, type UserInputParams } from './user-input.js';
export { WebToolProvider, WebFetchMetadata, WebSearchMetadata } from './web/provider.js';
export {
  CodeExecToolProvider,
  LocalCodeExecToolProvider,
  DockerCodeExecToolProvider,
  E2BCodeExecToolProvider,
} from './code-exec/index.js';

/**
 * Default tools for agents
 * Includes code execution (via LocalCodeExecToolProvider) and web fetch/search capabilities
 */
import { WebToolProvider } from './web/provider.js';
import { LocalCodeExecToolProvider } from './code-exec/index.js';

export const DEFAULT_TOOLS = [new LocalCodeExecToolProvider(), new WebToolProvider()];
