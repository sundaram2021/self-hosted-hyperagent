import { describe, expect, it } from 'vitest';

import { createMessageBodySchema, messagePartSchema } from './chat.js';
import { PROVIDERS, providerIdSchema, providerKeySettingKey } from './providers.js';

describe('messagePartSchema', () => {
  it('accepts text parts', () => {
    expect(messagePartSchema.parse({ type: 'text', text: 'hello' })).toEqual({
      type: 'text',
      text: 'hello',
    });
  });

  it('rejects malformed text parts instead of falling through to the generic schema', () => {
    expect(messagePartSchema.safeParse({ type: 'text' }).success).toBe(false);
    expect(messagePartSchema.safeParse({ type: 'text', text: '' }).success).toBe(false);
  });

  it('preserves unknown part types for forward compatibility', () => {
    const part = { type: 'tool-call', toolName: 'search', args: { q: 'x' } };
    expect(messagePartSchema.parse(part)).toEqual(part);
  });
});

describe('createMessageBodySchema', () => {
  it('only allows user text messages until the agent loop lands', () => {
    expect(
      createMessageBodySchema.safeParse({
        role: 'assistant',
        parts: [{ type: 'text', text: 'hi' }],
      }).success,
    ).toBe(false);

    expect(
      createMessageBodySchema.safeParse({
        role: 'user',
        parts: [{ type: 'text', text: 'hi' }],
      }).success,
    ).toBe(true);
  });
});

describe('provider catalog', () => {
  it('contains the 11 curated providers with unique ids and env vars', () => {
    expect(PROVIDERS).toHaveLength(11);
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(11);
    expect(new Set(PROVIDERS.map((p) => p.keyEnvVar)).size).toBe(11);
    for (const provider of PROVIDERS) {
      expect(providerIdSchema.parse(provider.id)).toBe(provider.id);
    }
  });

  it('derives settings keys for provider secrets', () => {
    expect(providerKeySettingKey('anthropic')).toBe('provider:anthropic:api_key');
  });
});
