import { tool } from 'ai';
import { z } from 'zod';

export const executeCodeResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().nullable(),
  duration_ms: z.number(),
  timed_out: z.boolean(),
  stdout_truncated: z.boolean(),
  stderr_truncated: z.boolean(),
});
export type ExecuteCodeResult = z.infer<typeof executeCodeResultSchema>;

export interface ExecuteCodeToolOptions {
  sandboxUrl: string;
  timeoutMs: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * The `execute_code` tool — runs Python or Bash in the isolated sandbox
 * service (apps/sandbox). The sandbox enforces per-execution temp dirs,
 * CPU/memory/output limits, and wall-clock timeouts.
 */
export function createExecuteCodeTool(options: ExecuteCodeToolOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return tool({
    description:
      'Execute code in an isolated sandbox and return stdout/stderr. ' +
      'Supports python (3.12) and bash. Use for calculations, data ' +
      'transformations, and quick scripts. No network access; state does not ' +
      'persist between calls.',
    inputSchema: z.object({
      language: z.enum(['python', 'bash']).describe('Interpreter to use'),
      code: z.string().min(1).max(50_000).describe('The code to execute'),
    }),
    execute: async ({ language, code }, { abortSignal }) => {
      let response: Response;
      try {
        response = await fetchImpl(`${options.sandboxUrl}/execute`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ language, code, timeout_ms: options.timeoutMs }),
          signal: abortSignal ?? null,
        });
      } catch (error) {
        throw new Error(
          `Sandbox unreachable at ${options.sandboxUrl} — is apps/sandbox running? ` +
            `(${error instanceof Error ? error.message : String(error)})`,
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Sandbox returned ${response.status}: ${body.slice(0, 500)}`);
      }

      return executeCodeResultSchema.parse(await response.json());
    },
  });
}
