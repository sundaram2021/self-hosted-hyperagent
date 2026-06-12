import type { ModelInfo, ProviderId } from '@hyperagent/shared';

/**
 * Curated model catalog with best-effort pricing (USD per million tokens).
 *
 * - This list is a convenience, not a gate: every provider also accepts a
 *   custom model id typed by the user.
 * - Pricing `null` means "track tokens, show cost as unknown" — the
 *   observability layer (Phase 9) degrades gracefully and supports overrides.
 * - Keep entries roughly current; editing this file is the expected way to
 *   add new models between releases.
 */
export const MODEL_CATALOG: Record<ProviderId, ModelInfo[]> = {
  anthropic: [
    {
      id: 'claude-opus-4-5',
      label: 'Claude Opus 4.5',
      pricing: { inputPerMTok: 5, outputPerMTok: 25 },
    },
    {
      id: 'claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5',
      pricing: { inputPerMTok: 3, outputPerMTok: 15 },
    },
    {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      pricing: { inputPerMTok: 1, outputPerMTok: 5 },
    },
  ],
  openai: [
    { id: 'gpt-5', label: 'GPT-5', pricing: { inputPerMTok: 1.25, outputPerMTok: 10 } },
    { id: 'gpt-5-mini', label: 'GPT-5 mini', pricing: { inputPerMTok: 0.25, outputPerMTok: 2 } },
    { id: 'gpt-5-nano', label: 'GPT-5 nano', pricing: { inputPerMTok: 0.05, outputPerMTok: 0.4 } },
  ],
  google: [
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      pricing: { inputPerMTok: 1.25, outputPerMTok: 10 },
    },
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      pricing: { inputPerMTok: 0.3, outputPerMTok: 2.5 },
    },
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      pricing: { inputPerMTok: 0.1, outputPerMTok: 0.4 },
    },
  ],
  xai: [
    { id: 'grok-4', label: 'Grok 4', pricing: { inputPerMTok: 3, outputPerMTok: 15 } },
    { id: 'grok-3-mini', label: 'Grok 3 mini', pricing: { inputPerMTok: 0.3, outputPerMTok: 0.5 } },
  ],
  deepseek: [
    {
      id: 'deepseek-chat',
      label: 'DeepSeek V3 (chat)',
      pricing: { inputPerMTok: 0.27, outputPerMTok: 1.1 },
    },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek R1 (reasoner)',
      pricing: { inputPerMTok: 0.55, outputPerMTok: 2.19 },
    },
  ],
  mistral: [
    {
      id: 'mistral-large-latest',
      label: 'Mistral Large',
      pricing: { inputPerMTok: 2, outputPerMTok: 6 },
    },
    {
      id: 'mistral-small-latest',
      label: 'Mistral Small',
      pricing: { inputPerMTok: 0.1, outputPerMTok: 0.3 },
    },
  ],
  kimi: [
    { id: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo', pricing: null },
    { id: 'moonshot-v1-128k', label: 'Moonshot v1 128k', pricing: null },
  ],
  zai: [
    { id: 'glm-4.6', label: 'GLM-4.6', pricing: { inputPerMTok: 0.6, outputPerMTok: 2.2 } },
    { id: 'glm-4.5-air', label: 'GLM-4.5 Air', pricing: { inputPerMTok: 0.2, outputPerMTok: 1.1 } },
  ],
  qwen: [
    { id: 'qwen-plus', label: 'Qwen Plus', pricing: null },
    { id: 'qwen-turbo', label: 'Qwen Turbo', pricing: null },
  ],
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B (Groq)',
      pricing: { inputPerMTok: 0.59, outputPerMTok: 0.79 },
    },
    {
      id: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B (Groq)',
      pricing: { inputPerMTok: 0.05, outputPerMTok: 0.08 },
    },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (OpenRouter)', pricing: null },
    { id: 'openai/gpt-5', label: 'GPT-5 (OpenRouter)', pricing: null },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (OpenRouter)', pricing: null },
  ],
};

/** Look up catalog pricing for a model; null when unknown. */
export function findModelPricing(
  providerId: ProviderId,
  modelId: string,
): { inputPerMTok: number; outputPerMTok: number } | null {
  const entry = MODEL_CATALOG[providerId]?.find((m) => m.id === modelId);
  return entry?.pricing ?? null;
}

/** Default model per provider (first catalog entry). */
export function defaultModelFor(providerId: ProviderId): string {
  return MODEL_CATALOG[providerId]?.[0]?.id ?? '';
}

/**
 * Estimated USD cost for a call. Null when the model has no catalog pricing
 * or token counts are unknown — callers must handle partial pricing.
 */
export function estimateCostUsd(
  provider: string,
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const pricing = findModelPricing(provider as ProviderId, model);
  if (!pricing || inputTokens === null || outputTokens === null) return null;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}
