/**
 * Helper utilities for examples
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Load environment variables from .env file in project root
 * Call this at the top of your example file
 */
export function loadEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  config({ path: join(__dirname, '..', '.env') });
}

/**
 * Get API configuration for OpenRouter with Claude Sonnet 4.5
 * Uses OpenRouter API by default (recommended for examples)
 */
export function getApiConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENROUTER_API_KEY
    ? 'https://openrouter.ai/api/v1'
    : undefined;
  const model = process.env.OPENROUTER_API_KEY
    ? 'anthropic/claude-sonnet-4.5'
    : 'gpt-5.2';

  if (!apiKey) {
    console.error('Error: Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env file');
    console.error('Copy .env.example to .env and add your API key');
    console.error('Recommended: Use OPENROUTER_API_KEY with Claude Sonnet 4.5');
    process.exit(1);
  }

  return { apiKey, baseURL, model };
}
