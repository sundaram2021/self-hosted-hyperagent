import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { makeTestDb, makeTestEnv } from '../test-utils.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(makeTestEnv(), {
    db: await makeTestDb(),
    // Deterministic env for key-source resolution: only Anthropic set via env.
    envSource: { ANTHROPIC_API_KEY: 'sk-ant-from-env' },
  });
});

afterAll(async () => {
  await app.close();
});

describe('provider key management', () => {
  it('lists all 11 curated providers with key sources', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/providers' });
    expect(response.statusCode).toBe(200);

    const providers = response.json();
    expect(providers).toHaveLength(11);

    const anthropic = providers.find((p: { id: string }) => p.id === 'anthropic');
    expect(anthropic.keySource).toBe('env');

    const openai = providers.find((p: { id: string }) => p.id === 'openai');
    expect(openai.keySource).toBe('none');
  });

  it('stores, reflects, and deletes a database key', async () => {
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/providers/openai/key',
      payload: { apiKey: 'sk-openai-test-key' },
    });
    expect(saved.statusCode).toBe(204);

    let providers = (await app.inject({ method: 'GET', url: '/api/providers' })).json();
    expect(providers.find((p: { id: string }) => p.id === 'openai').keySource).toBe('database');

    // The stored value is encrypted at rest and masked in the settings list.
    const settingsList = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    const row = settingsList.find((s: { key: string }) => s.key === 'provider:openai:api_key');
    expect(row.encrypted).toBe(true);
    expect(row.preview).toBeNull();

    const removed = await app.inject({ method: 'DELETE', url: '/api/providers/openai/key' });
    expect(removed.statusCode).toBe(204);

    providers = (await app.inject({ method: 'GET', url: '/api/providers' })).json();
    expect(providers.find((p: { id: string }) => p.id === 'openai').keySource).toBe('none');
  });

  it('env keys take precedence over database keys', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/providers/anthropic/key',
      payload: { apiKey: 'sk-ant-from-db' },
    });

    const providers = (await app.inject({ method: 'GET', url: '/api/providers' })).json();
    expect(providers.find((p: { id: string }) => p.id === 'anthropic').keySource).toBe('env');
  });

  it('rejects unknown provider ids', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/providers/llamacorp/key',
      payload: { apiKey: 'whatever-key' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns a clear error when APP_SECRET is missing', async () => {
    const bare = await buildApp(makeTestEnv({ APP_SECRET: undefined }), {
      db: await makeTestDb(),
      envSource: {},
    });

    const response = await bare.inject({
      method: 'PUT',
      url: '/api/providers/openai/key',
      payload: { apiKey: 'sk-openai-test-key' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('APP_SECRET_MISSING');
    expect(response.json().error.message).toContain('openssl rand -hex 32');

    await bare.close();
  });
});
