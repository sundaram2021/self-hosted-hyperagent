import { describe, expect, it, vi } from 'vitest';

import { createExaTools } from './exa.js';

const SEARCH_RESPONSE = {
  results: [
    {
      title: 'Result One',
      url: 'https://example.com/one',
      publishedDate: '2026-01-01',
      text: 'x'.repeat(5000),
    },
    { title: null, url: 'https://example.com/two' },
  ],
};

describe('Exa tools', () => {
  it('web_search posts the query with the API key and compacts results', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json(SEARCH_RESPONSE),
    );

    const tools = createExaTools({ apiKey: 'exa-key', fetchImpl: fetchImpl as typeof fetch });
    const results = (await tools.web_search!.execute!(
      { query: 'self-hosted agents' },
      { toolCallId: 't1', messages: [] },
    )) as Array<{ url: string; text: string | null }>;

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('exa-key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      query: 'self-hosted agents',
      numResults: 5,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.url).toBe('https://example.com/one');
    // Long content is truncated for the model.
    expect(results[0]!.text!.length).toBeLessThanOrEqual(2000);
  });

  it('surfaces API errors with status codes', async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('unauthorized', { status: 401 }),
    );

    const tools = createExaTools({ apiKey: 'bad-key', fetchImpl: fetchImpl as typeof fetch });
    await expect(
      tools.web_search!.execute!({ query: 'anything' }, { toolCallId: 't1', messages: [] }),
    ).rejects.toThrow(/401/);
  });

  it('get_page_contents and find_similar hit their endpoints', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ results: [] }),
    );
    const tools = createExaTools({ apiKey: 'exa-key', fetchImpl: fetchImpl as typeof fetch });

    await tools.get_page_contents!.execute!(
      { urls: ['https://example.com'] },
      { toolCallId: 't1', messages: [] },
    );
    await tools.find_similar!.execute!(
      { url: 'https://example.com' },
      { toolCallId: 't2', messages: [] },
    );

    const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('https://api.exa.ai/contents');
    expect(urls).toContain('https://api.exa.ai/findSimilar');
  });
});
