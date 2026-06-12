import type { ToolSet } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';

const EXA_BASE_URL = 'https://api.exa.ai';
const MAX_TEXT_CHARS = 2000;

const exaResultSchema = z
  .object({
    title: z.string().nullable().optional(),
    url: z.string(),
    publishedDate: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
  })
  .passthrough();

const exaResponseSchema = z.object({ results: z.array(exaResultSchema) }).passthrough();

export interface ExaToolOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

function compactResult(result: z.infer<typeof exaResultSchema>) {
  return {
    title: result.title ?? null,
    url: result.url,
    publishedDate: result.publishedDate ?? null,
    text: result.text ? result.text.slice(0, MAX_TEXT_CHARS) : null,
  };
}

async function exaPost(
  path: string,
  body: Record<string, unknown>,
  options: ExaToolOptions,
  signal: AbortSignal | undefined,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${EXA_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': options.apiKey,
    },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Exa API ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = exaResponseSchema.parse(await response.json());
  return parsed.results.map(compactResult);
}

/** Exa web tools: search with content snippets, page contents, find similar. */
export function createExaTools(options: ExaToolOptions): ToolSet {
  return {
    web_search: tool({
      description:
        'Search the web (Exa). Returns results with title, url, date, and a text snippet. ' +
        'Cite sources by URL when you use them.',
      inputSchema: z.object({
        query: z.string().min(1).max(500).describe('The search query'),
        numResults: z.number().int().min(1).max(10).optional().describe('Default 5'),
      }),
      execute: async ({ query, numResults }, { abortSignal }) =>
        exaPost(
          '/search',
          {
            query,
            numResults: numResults ?? 5,
            contents: { text: { maxCharacters: MAX_TEXT_CHARS } },
          },
          options,
          abortSignal,
        ),
    }),
    get_page_contents: tool({
      description: 'Fetch the readable text content of specific web pages (Exa).',
      inputSchema: z.object({
        urls: z.array(z.string().url()).min(1).max(5).describe('Page URLs to fetch'),
      }),
      execute: async ({ urls }, { abortSignal }) =>
        exaPost('/contents', { urls, text: true }, options, abortSignal),
    }),
    find_similar: tool({
      description: 'Find pages semantically similar to a given URL (Exa).',
      inputSchema: z.object({
        url: z.string().url().describe('The reference URL'),
        numResults: z.number().int().min(1).max(10).optional().describe('Default 5'),
      }),
      execute: async ({ url, numResults }, { abortSignal }) =>
        exaPost(
          '/findSimilar',
          {
            url,
            numResults: numResults ?? 5,
            contents: { text: { maxCharacters: MAX_TEXT_CHARS } },
          },
          options,
          abortSignal,
        ),
    }),
  };
}
