import { PROVIDERS } from '@hyperagent/shared';
import { describe, expect, it } from 'vitest';

import { defaultModelFor, findModelPricing, MODEL_CATALOG } from './catalog.js';

describe('MODEL_CATALOG', () => {
  it('covers every curated provider with at least one model', () => {
    for (const provider of PROVIDERS) {
      const models = MODEL_CATALOG[provider.id];
      expect(models, `catalog missing for ${provider.id}`).toBeDefined();
      expect(models.length).toBeGreaterThan(0);
      expect(defaultModelFor(provider.id)).toBe(models[0]!.id);
    }
  });

  it('has unique model ids per provider and sane pricing', () => {
    for (const provider of PROVIDERS) {
      const models = MODEL_CATALOG[provider.id];
      expect(new Set(models.map((m) => m.id)).size).toBe(models.length);
      for (const model of models) {
        if (model.pricing) {
          expect(model.pricing.inputPerMTok).toBeGreaterThan(0);
          expect(model.pricing.outputPerMTok).toBeGreaterThan(0);
        }
      }
    }
  });

  it('returns pricing for known models and null for unknown ones', () => {
    expect(findModelPricing('anthropic', 'claude-sonnet-4-5')).toEqual({
      inputPerMTok: 3,
      outputPerMTok: 15,
    });
    expect(findModelPricing('anthropic', 'some-future-model')).toBeNull();
    expect(findModelPricing('kimi', 'kimi-k2-turbo-preview')).toBeNull();
  });
});
