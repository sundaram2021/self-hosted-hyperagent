import { z } from 'zod';

export const mcpTransportSchema = z.enum(['stdio', 'http', 'sse']);
export type McpTransport = z.infer<typeof mcpTransportSchema>;

/**
 * MCP server as exposed by the API. Secret-bearing fields (env, headers) are
 * never returned — only their key names, so the UI can show what's configured.
 */
export const mcpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: mcpTransportSchema,
  command: z.string().nullable(),
  args: z.array(z.string()).nullable(),
  envKeys: z.array(z.string()),
  url: z.string().nullable(),
  headerKeys: z.array(z.string()),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type McpServer = z.infer<typeof mcpServerSchema>;

const baseMcpBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'letters, digits, dash and underscore only'),
  transport: mcpTransportSchema,
  command: z.string().min(1).max(500).optional(),
  args: z.array(z.string().max(500)).max(32).optional(),
  env: z.record(z.string().max(4096)).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string().max(4096)).optional(),
  enabled: z.boolean().optional(),
});

export const createMcpServerBodySchema = baseMcpBody.superRefine((value, ctx) => {
  if (value.transport === 'stdio' && !value.command) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['command'],
      message: 'stdio servers require a command (e.g. "npx")',
    });
  }
  if ((value.transport === 'http' || value.transport === 'sse') && !value.url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['url'],
      message: 'http/sse servers require a url',
    });
  }
});
export type CreateMcpServerBody = z.infer<typeof createMcpServerBodySchema>;

export const updateMcpServerBodySchema = baseMcpBody.partial();
export type UpdateMcpServerBody = z.infer<typeof updateMcpServerBodySchema>;

export const mcpToolInfoSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
});
export type McpToolInfo = z.infer<typeof mcpToolInfoSchema>;

export const mcpTestResultSchema = z.object({
  ok: z.boolean(),
  tools: z.array(mcpToolInfoSchema),
  error: z.string().nullable(),
});
export type McpTestResult = z.infer<typeof mcpTestResultSchema>;
