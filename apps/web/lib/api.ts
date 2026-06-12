import type { z } from 'zod';
import {
  apiErrorSchema,
  integrationStatusSchema,
  mcpServerSchema,
  mcpTestResultSchema,
  messageSchema,
  providerModelsSchema,
  providerStatusSchema,
  skillDetailSchema,
  skillSchema,
  streamEventSchema,
  threadSchema,
  type AgentStreamEvent,
  type CreateMcpServerBody,
  type IntegrationStatus,
  type McpServer,
  type McpTestResult,
  type Message,
  type ProviderModels,
  type ProviderStatus,
  type Skill,
  type SkillDetail,
  type StreamRequest,
  type TextPart,
  type Thread,
  type UpdateMcpServerBody,
} from '@hyperagent/shared';

const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T> | null,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      `Cannot reach the agent server at ${BASE_URL}. Is it running? (pnpm dev)`,
      0,
    );
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const parsed = apiErrorSchema.parse(await response.json());
      message = parsed.error.message;
      code = parsed.error.code;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(message, response.status, code);
  }

  if (schema === null) {
    return undefined as T;
  }

  return schema.parse(await response.json());
}

// --- Threads ---

export function listThreads(): Promise<Thread[]> {
  return request('/api/threads', threadSchema.array());
}

export function createThread(title?: string): Promise<Thread> {
  return request('/api/threads', threadSchema, {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
}

export function getThread(id: string): Promise<Thread> {
  return request(`/api/threads/${id}`, threadSchema);
}

export function renameThread(id: string, title: string): Promise<Thread> {
  return request(`/api/threads/${id}`, threadSchema, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function deleteThread(id: string): Promise<void> {
  return request(`/api/threads/${id}`, null, { method: 'DELETE' });
}

// --- Messages ---

export function listMessages(threadId: string): Promise<Message[]> {
  return request(`/api/threads/${threadId}/messages`, messageSchema.array());
}

export function sendUserMessage(threadId: string, text: string): Promise<Message> {
  const parts: TextPart[] = [{ type: 'text', text }];
  return request(`/api/threads/${threadId}/messages`, messageSchema, {
    method: 'POST',
    body: JSON.stringify({ role: 'user', parts }),
  });
}

// --- Streaming chat ---

/**
 * Send a user message and stream the agent's turn as parsed SSE events.
 * Unknown event shapes are skipped (forward compatibility with later phases).
 */
export async function* streamChat(
  threadId: string,
  body: StreamRequest,
  signal?: AbortSignal,
): AsyncGenerator<AgentStreamEvent> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/threads/${threadId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: signal ?? null,
    });
  } catch {
    if (signal?.aborted) return;
    throw new ApiError(
      `Cannot reach the agent server at ${BASE_URL}. Is it running? (pnpm dev)`,
      0,
    );
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const parsed = apiErrorSchema.parse(await response.json());
      message = parsed.error.message;
      code = parsed.error.code;
    } catch {
      // keep generic message
    }
    throw new ApiError(message, response.status, code);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('Streaming not supported by this browser', 0);

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf('\n\n');

        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
        if (!dataLine) continue;

        try {
          const parsed = streamEventSchema.safeParse(JSON.parse(dataLine.slice(6)));
          if (parsed.success) yield parsed.data;
        } catch {
          // Skip malformed frames rather than killing the stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Models & providers ---

export function listModels(): Promise<ProviderModels[]> {
  return request('/api/models', providerModelsSchema.array());
}

export function listProviders(): Promise<ProviderStatus[]> {
  return request('/api/providers', providerStatusSchema.array());
}

export function saveProviderKey(id: string, apiKey: string): Promise<void> {
  return request(`/api/providers/${id}/key`, null, {
    method: 'PUT',
    body: JSON.stringify({ apiKey }),
  });
}

export function deleteProviderKey(id: string): Promise<void> {
  return request(`/api/providers/${id}/key`, null, { method: 'DELETE' });
}

// --- MCP servers ---

export function listMcpServers(): Promise<McpServer[]> {
  return request('/api/mcp-servers', mcpServerSchema.array());
}

export function createMcpServer(body: CreateMcpServerBody): Promise<McpServer> {
  return request('/api/mcp-servers', mcpServerSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateMcpServer(id: string, body: UpdateMcpServerBody): Promise<McpServer> {
  return request(`/api/mcp-servers/${id}`, mcpServerSchema, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteMcpServer(id: string): Promise<void> {
  return request(`/api/mcp-servers/${id}`, null, { method: 'DELETE' });
}

export function testMcpServer(id: string): Promise<McpTestResult> {
  return request(`/api/mcp-servers/${id}/test`, mcpTestResultSchema, { method: 'POST' });
}

// --- Skills ---

export function listSkills(): Promise<Skill[]> {
  return request('/api/skills', skillSchema.array());
}

export function getSkill(id: string): Promise<SkillDetail> {
  return request(`/api/skills/${id}`, skillDetailSchema);
}

export function installSkill(url: string): Promise<Skill> {
  return request('/api/skills', skillSchema, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function updateSkill(id: string, enabled: boolean): Promise<Skill> {
  return request(`/api/skills/${id}`, skillSchema, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function deleteSkill(id: string): Promise<void> {
  return request(`/api/skills/${id}`, null, { method: 'DELETE' });
}

// --- Integrations (Exa) ---

export function listIntegrations(): Promise<IntegrationStatus[]> {
  return request('/api/integrations', integrationStatusSchema.array());
}

export function saveIntegrationKey(id: string, apiKey: string): Promise<void> {
  return request(`/api/integrations/${id}/key`, null, {
    method: 'PUT',
    body: JSON.stringify({ apiKey }),
  });
}

export function deleteIntegrationKey(id: string): Promise<void> {
  return request(`/api/integrations/${id}/key`, null, { method: 'DELETE' });
}

/** Cross-component refresh signal for the sidebar thread list. */
export const THREADS_CHANGED_EVENT = 'hyperagent:threads-changed';

export function emitThreadsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THREADS_CHANGED_EVENT));
  }
}
