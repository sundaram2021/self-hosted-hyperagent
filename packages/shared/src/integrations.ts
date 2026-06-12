import { z } from 'zod';

import { keySourceSchema } from './providers.js';

/**
 * Non-LLM integrations with API keys (search etc.). Same env-first key
 * resolution as model providers.
 */
export const integrationIdSchema = z.enum(['exa']);
export type IntegrationId = z.infer<typeof integrationIdSchema>;

export interface IntegrationInfo {
  id: IntegrationId;
  label: string;
  description: string;
  keyEnvVar: string;
  keyUrl: string;
}

export const INTEGRATIONS: readonly IntegrationInfo[] = [
  {
    id: 'exa',
    label: 'Exa Search',
    description: 'Web search, page contents, and find-similar tools for the agent.',
    keyEnvVar: 'EXA_API_KEY',
    keyUrl: 'https://dashboard.exa.ai/api-keys',
  },
];

export const integrationStatusSchema = z.object({
  id: integrationIdSchema,
  label: z.string(),
  description: z.string(),
  keyEnvVar: z.string(),
  keyUrl: z.string(),
  keySource: keySourceSchema,
});
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const saveIntegrationKeyBodySchema = z.object({
  apiKey: z.string().min(8).max(4096),
});
export type SaveIntegrationKeyBody = z.infer<typeof saveIntegrationKeyBodySchema>;

/** Database settings key for an integration's API key (encrypted). */
export function integrationKeySettingKey(id: IntegrationId): string {
  return `integration:${id}:api_key`;
}
