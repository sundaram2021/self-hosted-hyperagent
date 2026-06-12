import { z } from 'zod';

/**
 * Curated provider registry. Popular providers only — no arbitrary
 * OpenAI-compatible endpoints (deliberate product decision).
 * Phase 3 extends each entry with a model catalog and pricing.
 */
export const providerIdSchema = z.enum([
  'anthropic',
  'openai',
  'google',
  'xai',
  'deepseek',
  'mistral',
  'kimi',
  'zai',
  'qwen',
  'groq',
  'openrouter',
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Environment variable checked first; overrides any database-stored key. */
  keyEnvVar: string;
  /** Where users create an API key. */
  keyUrl: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyEnvVar: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyEnvVar: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    keyEnvVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    keyEnvVar: 'XAI_API_KEY',
    keyUrl: 'https://console.x.ai',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    keyEnvVar: 'DEEPSEEK_API_KEY',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    keyEnvVar: 'MISTRAL_API_KEY',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot AI)',
    keyEnvVar: 'MOONSHOT_API_KEY',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
  },
  {
    id: 'zai',
    label: 'Z.ai (GLM)',
    keyEnvVar: 'ZAI_API_KEY',
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
  {
    id: 'qwen',
    label: 'Qwen (Alibaba)',
    keyEnvVar: 'DASHSCOPE_API_KEY',
    keyUrl: 'https://bailian.console.alibabacloud.com',
  },
  {
    id: 'groq',
    label: 'Groq',
    keyEnvVar: 'GROQ_API_KEY',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyEnvVar: 'OPENROUTER_API_KEY',
    keyUrl: 'https://openrouter.ai/settings/keys',
  },
];

export const keySourceSchema = z.enum(['env', 'database', 'none']);
export type KeySource = z.infer<typeof keySourceSchema>;

/** GET /api/providers response item. */
export const providerStatusSchema = z.object({
  id: providerIdSchema,
  label: z.string(),
  keyEnvVar: z.string(),
  keyUrl: z.string(),
  keySource: keySourceSchema,
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const saveProviderKeyBodySchema = z.object({
  apiKey: z.string().min(8).max(4096),
});
export type SaveProviderKeyBody = z.infer<typeof saveProviderKeyBodySchema>;

/** Database settings key that stores a provider's API key (encrypted). */
export function providerKeySettingKey(providerId: ProviderId): string {
  return `provider:${providerId}:api_key`;
}
