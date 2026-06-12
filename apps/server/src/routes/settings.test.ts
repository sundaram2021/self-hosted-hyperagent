import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { makeTestDb, makeTestEnv } from '../test-utils.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(makeTestEnv(), { db: await makeTestDb() });
});

afterAll(async () => {
  await app.close();
});

describe('settings API', () => {
  it('upserts and lists plaintext settings with previews', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/settings/ui.theme',
      payload: { value: 'dark' },
    });
    expect(put.statusCode).toBe(204);

    const list = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    const theme = list.find((s: { key: string }) => s.key === 'ui.theme');
    expect(theme.encrypted).toBe(false);
    expect(theme.preview).toBe('dark');
  });

  it('truncates long previews', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/settings/long.value',
      payload: { value: 'x'.repeat(100) },
    });

    const list = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    const row = list.find((s: { key: string }) => s.key === 'long.value');
    expect(row.preview.length).toBeLessThan(30);
    expect(row.preview.endsWith('…')).toBe(true);
  });

  it('overwrites on repeated upsert', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/settings/ui.theme',
      payload: { value: 'light' },
    });

    const list = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    const theme = list.find((s: { key: string }) => s.key === 'ui.theme');
    expect(theme.preview).toBe('light');
  });

  it('deletes settings and 404s on unknown keys', async () => {
    const deleted = await app.inject({ method: 'DELETE', url: '/api/settings/ui.theme' });
    expect(deleted.statusCode).toBe(204);

    const again = await app.inject({ method: 'DELETE', url: '/api/settings/ui.theme' });
    expect(again.statusCode).toBe(404);
  });
});
