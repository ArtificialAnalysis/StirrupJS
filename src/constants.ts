/**
 * Global constants for the Stirrup framework
 */

/** Default maximum number of turns for agent execution */
export const AGENT_MAX_TURNS = 30;

/** Context summarization cutoff threshold (percentage of context window) */
export const CONTEXT_SUMMARIZATION_CUTOFF = 0.7;

/** Tool name for finishing agent execution */
export const FINISH_TOOL_NAME = 'finish';

/** Image resolution limit (1 megapixel) */
export const RESOLUTION_1MP = 1_000_000;

/** Video resolution limit (480p: 640×480) */
export const RESOLUTION_480P = 640 * 480;

/** Default audio bitrate for transcoding */
export const AUDIO_BITRATE = '192k';

/** Maximum content length for web fetch results */
export const MAX_WEB_CONTENT_LENGTH = 40_000;

/** Sub-agent indentation spaces */
export const SUBAGENT_INDENT_SPACES = 8;

/** Default command timeout in milliseconds */
export const DEFAULT_COMMAND_TIMEOUT = 300_000; // 5 minutes

/** Default E2B sandbox timeout in milliseconds */
export const DEFAULT_E2B_TIMEOUT = 600_000; // 10 minutes

/** Retry configuration */
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_MIN_TIMEOUT = 1000;
export const RETRY_MAX_TIMEOUT = 10_000;
