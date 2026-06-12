import { describe, expect, it } from 'vitest';

import { API_PATHS, healthResponseSchema } from './index.js';

describe('healthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    const payload = {
      status: 'ok',
      service: 'server',
      version: '0.1.0',
      uptimeSeconds: 12.5,
      timestamp: new Date().toISOString(),
    };

    expect(healthResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects unknown services and bad statuses', () => {
    expect(
      healthResponseSchema.safeParse({
        status: 'degraded',
        service: 'server',
        version: '0.1.0',
        uptimeSeconds: 1,
        timestamp: new Date().toISOString(),
      }).success,
    ).toBe(false);

    expect(
      healthResponseSchema.safeParse({
        status: 'ok',
        service: 'database',
        version: '0.1.0',
        uptimeSeconds: 1,
        timestamp: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});

describe('API_PATHS', () => {
  it('exposes the health path', () => {
    expect(API_PATHS.health).toBe('/health');
  });
});
