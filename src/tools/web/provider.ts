/**
 * Web tool provider - fetch and search capabilities
 */

import axios, { type AxiosInstance } from 'axios';
import retry from 'async-retry';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { z } from 'zod';
import type { Tool, BaseTool, ToolProvider, ToolResult } from '../../core/models.js';
import { MAX_RETRY_ATTEMPTS, RETRY_MIN_TIMEOUT, RETRY_MAX_TIMEOUT, MAX_WEB_CONTENT_LENGTH } from '../../constants.js';

/**
 * Metadata for web fetch operations
 */
export class WebFetchMetadata {
  constructor(
    public numUses: number = 1,
    public pagesFetched: string[] = []
  ) {}

  add(other: WebFetchMetadata): WebFetchMetadata {
    return new WebFetchMetadata(this.numUses + other.numUses, [...this.pagesFetched, ...other.pagesFetched]);
  }

  toJSON() {
    return {
      num_uses: this.numUses,
      pages_fetched: this.pagesFetched,
    };
  }
}

/**
 * Metadata for web search operations
 */
export class WebSearchMetadata {
  constructor(
    public numUses: number = 1,
    public pagesReturned: number = 0
  ) {}

  add(other: WebSearchMetadata): WebSearchMetadata {
    return new WebSearchMetadata(this.numUses + other.numUses, this.pagesReturned + other.pagesReturned);
  }

  toJSON() {
    return {
      num_uses: this.numUses,
      pages_returned: this.pagesReturned,
    };
  }
}

/**
 * Parameters for web fetch
 */
export const FetchWebPageParamsSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
});

export type FetchWebPageParams = z.infer<typeof FetchWebPageParamsSchema>;

/**
 * Parameters for web search
 */
export const WebSearchParamsSchema = z.object({
  query: z.string().describe('Search query'),
});

export type WebSearchParams = z.infer<typeof WebSearchParamsSchema>;

/**
 * Web tool provider
 * Provides web fetch and search capabilities
 */
export class WebToolProvider implements ToolProvider {
  private client?: AxiosInstance;
  private braveApiKey?: string;
  private timeout: number;

  constructor(timeout: number = 180_000, braveApiKey?: string) {
    this.timeout = timeout;
    this.braveApiKey = braveApiKey ?? process.env.BRAVE_API_KEY;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // Cleanup if needed
  }

  async getTools(): Promise<Tool[]> {
    // Create HTTP client
    this.client = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Stirrup-Agent/1.0',
      },
    });

    const tools: BaseTool[] = [this.createFetchTool()];

    // Add search tool if API key is available
    if (this.braveApiKey) {
      tools.push(this.createSearchTool());
    }

    return tools;
  }

  /**
   * Create web fetch tool
   */
  private createFetchTool(): Tool<typeof FetchWebPageParamsSchema, WebFetchMetadata> {
    return {
      name: 'web_fetch',
      description: 'Fetch and extract the main content from a web page',
      parameters: FetchWebPageParamsSchema,
      executor: async (params): Promise<ToolResult<WebFetchMetadata>> => {
        try {
          const content = await this.fetchPage(params.url);
          return {
            content,
            metadata: new WebFetchMetadata(1, [params.url]),
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: `Error fetching page: ${errorMsg}`,
            metadata: new WebFetchMetadata(1, []),
          };
        }
      },
    };
  }

  /**
   * Create web search tool
   */
  private createSearchTool(): Tool<typeof WebSearchParamsSchema, WebSearchMetadata> {
    return {
      name: 'web_search',
      description: 'Search the web using Brave Search API',
      parameters: WebSearchParamsSchema,
      executor: async (params): Promise<ToolResult<WebSearchMetadata>> => {
        try {
          const results = await this.searchWeb(params.query);
          return {
            content: results.content,
            metadata: new WebSearchMetadata(1, results.count),
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: `Error searching: ${errorMsg}`,
            metadata: new WebSearchMetadata(1, 0),
          };
        }
      },
    };
  }

  /**
   * Fetch and extract content from a web page
   */
  private async fetchPage(url: string): Promise<string> {
    if (!this.client) {
      throw new Error('HTTP client not initialized');
    }

    // Fetch with retry
    const response = await retry(
      async () => {
        return await this.client!.get(url);
      },
      {
        retries: MAX_RETRY_ATTEMPTS,
        minTimeout: RETRY_MIN_TIMEOUT,
        maxTimeout: RETRY_MAX_TIMEOUT,
      }
    );

    const html = response.data as string;

    // Parse with cheerio
    const $ = cheerio.load(html);

    // Remove non-content elements
    $('script, style, nav, footer, header, aside, noscript, iframe, svg, form').remove();
    $('[role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]').remove();
    $('.nav, .navbar, .menu, .sidebar, .footer, .header, .ads, .advertisement, .social-share').remove();

    // Try to find the main content area
    let contentHtml: string;
    const mainContent = $('article, main, [role="main"], .content, .post, .article, #content, #main').first();

    if (mainContent.length > 0) {
      contentHtml = mainContent.html() || '';
    } else {
      // Fall back to body content
      contentHtml = $('body').html() || '';
    }

    if (!contentHtml.trim()) {
      throw new Error('Failed to extract article content');
    }

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim();

    // Convert to Markdown with Turndown
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    let markdown = turndown.turndown(contentHtml);

    // Add title if available
    if (title) {
      markdown = `# ${title}\n\n${markdown}`;
    }

    // Truncate if too long
    if (markdown.length > MAX_WEB_CONTENT_LENGTH) {
      markdown = markdown.substring(0, MAX_WEB_CONTENT_LENGTH) + '\n\n[Content truncated]';
    }

    return markdown;
  }

  /**
   * Search the web using Brave Search API
   */
  private async searchWeb(query: string): Promise<{ content: string; count: number }> {
    if (!this.client || !this.braveApiKey) {
      throw new Error('Search not available (missing API key)');
    }

    // Call Brave Search API
    const response = await retry(
      async () => {
        return await this.client!.get('https://api.search.brave.com/res/v1/web/search', {
          params: { q: query, count: 5 },
          headers: {
            'X-Subscription-Token': this.braveApiKey,
            Accept: 'application/json',
          },
        });
      },
      {
        retries: MAX_RETRY_ATTEMPTS,
        minTimeout: RETRY_MIN_TIMEOUT,
        maxTimeout: RETRY_MAX_TIMEOUT,
      }
    );

    const data = response.data as {
      web?: {
        results?: Array<{
          title: string;
          url: string;
          description: string;
        }>;
      };
    };
    const results = data.web?.results || [];

    if (results.length === 0) {
      return { content: 'No search results found', count: 0 };
    }

    // Format results as XML
    let content = `<search_results query="${query}">\n`;
    for (const result of results) {
      content += `  <result>\n`;
      content += `    <title>${this.escapeXml(result.title || '')}</title>\n`;
      content += `    <url>${this.escapeXml(result.url || '')}</url>\n`;
      content += `    <description>${this.escapeXml(result.description || '')}</description>\n`;
      content += `  </result>\n`;
    }
    content += `</search_results>`;

    return { content, count: results.length };
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
