import { z } from 'zod';

/**
 * Service identifiers for the three deployable apps in the monorepo.
 */
export const SERVICES = {
  web: 'web',
  server: 'server',
  sandbox: 'sandbox',
} as const;

export type ServiceName = (typeof SERVICES)[keyof typeof SERVICES];

/**
 * Well-known API paths shared between services and the web client.
 */
export const API_PATHS = {
  health: '/health',
  threads: '/api/threads',
  settings: '/api/settings',
  providers: '/api/providers',
} as const;

/**
 * Health check response contract. Every service (Node server, Python sandbox)
 * returns this shape from GET /health so the web UI and orchestration tooling
 * can treat them uniformly.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.enum([SERVICES.web, SERVICES.server, SERVICES.sandbox]),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
