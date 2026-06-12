import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';

import type { SettingsService } from '../services/settings.js';

export const EMBEDDING_DIMENSIONS = 1536;

export interface Embedder {
  /** Provider id used (for logging/UI). */
  provider: 'openai' | 'google';
  embed(values: string[]): Promise<number[][]>;
}

/**
 * Pick an embedding provider from available keys (env first, then encrypted
 * DB keys): OpenAI text-embedding-3-small, else Google gemini-embedding-001 —
 * both at 1536 dimensions to match the pgvector column.
 *
 * Returns null when no embedding-capable key exists; memory then degrades to
 * full-text-only recall (and consolidation to exact-duplicate detection).
 */
export async function createEmbedder(
  envSource: NodeJS.ProcessEnv,
  settings: SettingsService,
): Promise<Embedder | null> {
  const openaiKey =
    envSource.OPENAI_API_KEY ?? (await settings.getValue('provider:openai:api_key'));
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return {
      provider: 'openai',
      embed: async (values) => {
        const { embeddings } = await embedMany({
          model: openai.textEmbedding('text-embedding-3-small'),
          values,
        });
        return embeddings;
      },
    };
  }

  const googleKey =
    envSource.GOOGLE_GENERATIVE_AI_API_KEY ?? (await settings.getValue('provider:google:api_key'));
  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return {
      provider: 'google',
      embed: async (values) => {
        const { embeddings } = await embedMany({
          model: google.textEmbedding('gemini-embedding-001'),
          values,
          providerOptions: {
            google: { outputDimensionality: EMBEDDING_DIMENSIONS },
          },
        });
        return embeddings;
      },
    };
  }

  return null;
}
