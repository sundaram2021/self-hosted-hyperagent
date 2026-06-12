import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for secrets at rest (provider API keys).
 *
 * Payload format: `enc:v1:<iv b64>:<ciphertext b64>:<auth tag b64>`
 *
 * The key is derived as SHA-256(APP_SECRET). APP_SECRET is expected to be
 * high-entropy (README instructs `openssl rand -hex 32`), so a fast hash is an
 * appropriate KDF here — there is no low-entropy password to stretch.
 */
const PREFIX_MAJOR = 'enc';
const PREFIX_VERSION = 'v1';

export class SecretCryptoError extends Error {}

function deriveKey(appSecret: string): Buffer {
  return createHash('sha256').update(appSecret, 'utf8').digest();
}

export function encryptSecret(plaintext: string, appSecret: string): string {
  const key = deriveKey(appSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX_MAJOR,
    PREFIX_VERSION,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string, appSecret: string): string {
  const parts = payload.split(':');
  if (parts.length !== 5 || parts[0] !== PREFIX_MAJOR || parts[1] !== PREFIX_VERSION) {
    throw new SecretCryptoError('Unrecognized secret payload format');
  }

  const [, , ivB64, ciphertextB64, tagB64] = parts as [string, string, string, string, string];

  try {
    const key = deriveKey(appSecret);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    throw new SecretCryptoError('Failed to decrypt secret — wrong APP_SECRET or corrupted payload');
  }
}

export function isEncryptedPayload(value: string): boolean {
  return value.startsWith(`${PREFIX_MAJOR}:${PREFIX_VERSION}:`);
}
