/** Domain errors mapped to HTTP responses by the global error handler in app.ts. */

export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
  }
}

export class AppSecretMissingError extends Error {
  constructor() {
    super(
      'APP_SECRET is not configured. Set APP_SECRET in your environment ' +
        '(generate one with: openssl rand -hex 32) to store encrypted secrets.',
    );
  }
}

export class ProviderKeyMissingError extends Error {
  constructor(providerLabel: string, keyEnvVar: string) {
    super(
      `No API key configured for ${providerLabel}. ` +
        `Set ${keyEnvVar} in the environment or save a key in Settings.`,
    );
  }
}
