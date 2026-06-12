import { z } from 'zod';

const envSchema = z.object({
  SERVER_PORT: z.coerce.number().int().positive().max(65535).default(8787),
  SERVER_HOST: z.string().min(1).default('127.0.0.1'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://hyperagent:hyperagent@localhost:5432/hyperagent'),
  /**
   * Encrypts secrets (provider API keys) at rest. Optional: without it the
   * app runs, but storing keys via the UI returns a clear error. Generate
   * with: openssl rand -hex 32
   */
  APP_SECRET: z.string().min(16).optional(),
  /** Apply pending database migrations on boot (recommended for self-hosting). */
  MIGRATE_ON_START: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** Sandbox execution service (apps/sandbox). */
  SANDBOX_URL: z.string().url().default('http://localhost:8788'),
  /** Per-execution wall clock limit forwarded to the sandbox. */
  SANDBOX_EXECUTE_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),
  /** Maximum model steps (tool-call rounds) per agent turn. */
  AGENT_MAX_STEPS: z.coerce.number().int().positive().max(32).default(8),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables. Exits the process with a readable
 * error report when configuration is invalid — failing fast beats limping along
 * with a broken config.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  return parsed.data;
}
