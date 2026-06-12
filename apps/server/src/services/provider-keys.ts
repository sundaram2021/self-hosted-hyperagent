import type { KeySource, ProviderId, ProviderInfo } from '@hyperagent/shared';
import { PROVIDERS, providerKeySettingKey } from '@hyperagent/shared';

import { ProviderKeyMissingError } from '../errors.js';
import type { SettingsService } from './settings.js';

export function providerInfo(providerId: ProviderId): ProviderInfo {
  // PROVIDERS is exhaustive over ProviderId by construction (tested in shared).
  return PROVIDERS.find((p) => p.id === providerId)!;
}

/** Where a provider's key comes from: env beats database beats nothing. */
export async function resolveKeySource(
  provider: ProviderInfo,
  envSource: NodeJS.ProcessEnv,
  settings: SettingsService,
): Promise<KeySource> {
  if (envSource[provider.keyEnvVar]) return 'env';
  if (await settings.has(providerKeySettingKey(provider.id))) return 'database';
  return 'none';
}

/** Resolve the actual API key for a provider, or throw a typed 400. */
export async function resolveProviderKey(
  providerId: ProviderId,
  envSource: NodeJS.ProcessEnv,
  settings: SettingsService,
): Promise<string> {
  const provider = providerInfo(providerId);

  const fromEnv = envSource[provider.keyEnvVar];
  if (fromEnv) return fromEnv;

  const fromDb = await settings.getValue(providerKeySettingKey(providerId));
  if (fromDb) return fromDb;

  throw new ProviderKeyMissingError(provider.label, provider.keyEnvVar);
}
