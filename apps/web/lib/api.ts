import type { z } from 'zod';
import {
  apiErrorSchema,
  messageSchema,
  providerStatusSchema,
  threadSchema,
  type Message,
  type ProviderStatus,
  type TextPart,
  type Thread,
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

// --- Providers ---

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

/** Cross-component refresh signal for the sidebar thread list. */
export const THREADS_CHANGED_EVENT = 'hyperagent:threads-changed';

export function emitThreadsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THREADS_CHANGED_EVENT));
  }
}
