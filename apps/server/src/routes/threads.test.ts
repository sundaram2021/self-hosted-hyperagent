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

describe('thread CRUD', () => {
  it('creates, lists, reads, renames, and deletes threads', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/threads',
      payload: { title: 'My research' },
    });
    expect(created.statusCode).toBe(201);
    const thread = created.json();
    expect(thread.title).toBe('My research');

    const list = await app.inject({ method: 'GET', url: '/api/threads' });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((t: { id: string }) => t.id === thread.id)).toBe(true);

    const read = await app.inject({ method: 'GET', url: `/api/threads/${thread.id}` });
    expect(read.statusCode).toBe(200);

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/threads/${thread.id}`,
      payload: { title: 'Renamed' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().title).toBe('Renamed');

    const deleted = await app.inject({ method: 'DELETE', url: `/api/threads/${thread.id}` });
    expect(deleted.statusCode).toBe(204);

    const gone = await app.inject({ method: 'GET', url: `/api/threads/${thread.id}` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error.code).toBe('NOT_FOUND');
  });

  it('uses a default title when none is provided', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/threads', payload: {} });
    expect(created.statusCode).toBe(201);
    expect(created.json().title).toBe('New thread');
  });

  it('rejects invalid titles with a validation error', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/threads',
      payload: { title: '' },
    });
    expect(created.statusCode).toBe(400);
    expect(created.json().error.code).toBe('VALIDATION');
  });
});

describe('messages', () => {
  it('appends user messages and lists them in order', async () => {
    const thread = (await app.inject({ method: 'POST', url: '/api/threads', payload: {} })).json();

    const first = await app.inject({
      method: 'POST',
      url: `/api/threads/${thread.id}/messages`,
      payload: { role: 'user', parts: [{ type: 'text', text: 'first' }] },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/api/threads/${thread.id}/messages`,
      payload: { role: 'user', parts: [{ type: 'text', text: 'second' }] },
    });
    expect(second.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/api/threads/${thread.id}/messages`,
    });
    expect(list.statusCode).toBe(200);
    const bodies = list.json();
    expect(bodies).toHaveLength(2);
    expect(bodies[0].parts[0].text).toBe('first');
    expect(bodies[1].parts[0].text).toBe('second');
  });

  it('rejects assistant-authored messages until Phase 3', async () => {
    const thread = (await app.inject({ method: 'POST', url: '/api/threads', payload: {} })).json();

    const response = await app.inject({
      method: 'POST',
      url: `/api/threads/${thread.id}/messages`,
      payload: { role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('404s for messages on unknown threads', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/threads/does-not-exist/messages',
    });
    expect(response.statusCode).toBe(404);
  });
});
