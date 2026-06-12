import { z } from 'zod';

const envSchema = z.object({
  SERVER_PORT: z.coerce.number().int().positive().max(65535).default(8787),
  SERVER_HOST: z.string().min(1).default('127.0.0.1'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
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
