import { describe, expect, it, vi } from 'vitest';

import { createExecuteCodeTool } from './execute-code.js';

const SANDBOX_RESPONSE = {
  stdout: '42\n',
  stderr: '',
  exit_code: 0,
  duration_ms: 12,
  timed_out: false,
  stdout_truncated: false,
  stderr_truncated: false,
};

describe('execute_code tool', () => {
  it('POSTs code to the sandbox and returns the parsed result', async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(SANDBOX_RESPONSE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const tool = createExecuteCodeTool({
      sandboxUrl: 'http://sandbox.test:8788',
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await tool.execute!(
      { language: 'python', code: 'print(42)' },
      { toolCallId: 'call-1', messages: [] },
    );

    expect(result).toEqual(SANDBOX_RESPONSE);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://sandbox.test:8788/execute',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(requestBody).toEqual({ language: 'python', code: 'print(42)', timeout_ms: 5000 });
  });

  it('throws a helpful error when the sandbox is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    const tool = createExecuteCodeTool({
      sandboxUrl: 'http://localhost:9999',
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      tool.execute!({ language: 'bash', code: 'echo hi' }, { toolCallId: 'call-1', messages: [] }),
    ).rejects.toThrow(/Sandbox unreachable/);
  });

  it('surfaces sandbox HTTP errors with status and body', async () => {
    const fetchImpl = vi.fn(async () => new Response('overloaded', { status: 503 }));

    const tool = createExecuteCodeTool({
      sandboxUrl: 'http://sandbox.test:8788',
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      tool.execute!(
        { language: 'python', code: 'print(1)' },
        { toolCallId: 'call-1', messages: [] },
      ),
    ).rejects.toThrow(/503/);
  });
});
