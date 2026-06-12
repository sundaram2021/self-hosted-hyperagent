import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import type { ProviderId } from '@hyperagent/shared';
import type { LanguageModel } from 'ai';

/**
 * Build a LanguageModel for any curated provider. Kimi, Z.ai, Qwen, and
 * OpenRouter speak the OpenAI-compatible protocol; the base URLs are fixed
 * here on purpose — no arbitrary endpoint configuration is exposed (product
 * decision: popular providers only).
 */
export interface CreateModelOptions {
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
}

const OPENAI_COMPATIBLE_BASES: Partial<Record<ProviderId, { name: string; baseURL: string }>> = {
  kimi: { name: 'kimi', baseURL: 'https://api.moonshot.ai/v1' },
  zai: { name: 'zai', baseURL: 'https://api.z.ai/api/paas/v4' },
  qwen: { name: 'qwen', baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
  openrouter: { name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1' },
};

export function createLanguageModel(options: CreateModelOptions): LanguageModel {
  const { providerId, modelId, apiKey } = options;

  switch (providerId) {
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'openai':
      return createOpenAI({ apiKey })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case 'xai':
      return createXai({ apiKey })(modelId);
    case 'deepseek':
      return createDeepSeek({ apiKey })(modelId);
    case 'mistral':
      return createMistral({ apiKey })(modelId);
    case 'groq':
      return createGroq({ apiKey })(modelId);
    case 'kimi':
    case 'zai':
    case 'qwen':
    case 'openrouter': {
      const base = OPENAI_COMPATIBLE_BASES[providerId]!;
      return createOpenAICompatible({
        name: base.name,
        baseURL: base.baseURL,
        apiKey,
      })(modelId);
    }
  }
}
