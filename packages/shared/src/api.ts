import { z } from 'zod';

/** Uniform error envelope returned by the server for all non-2xx responses. */
export const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const API_ERROR_CODES = {
  validation: 'VALIDATION',
  notFound: 'NOT_FOUND',
  appSecretMissing: 'APP_SECRET_MISSING',
  internal: 'INTERNAL',
} as const;

/**
 * Settings as exposed by the API. Secret values are never returned —
 * encrypted settings surface only their key and metadata.
 */
export const settingSummarySchema = z.object({
  key: z.string(),
  encrypted: z.boolean(),
  /** Truncated plaintext for non-secret settings; null for encrypted ones. */
  preview: z.string().nullable(),
  updatedAt: z.string(),
});
export type SettingSummary = z.infer<typeof settingSummarySchema>;

export const upsertSettingBodySchema = z.object({
  value: z.string().min(1).max(100_000),
  encrypted: z.boolean().optional().default(false),
});
export type UpsertSettingBody = z.infer<typeof upsertSettingBodySchema>;
