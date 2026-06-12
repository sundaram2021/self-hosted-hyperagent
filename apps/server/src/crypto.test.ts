import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret, isEncryptedPayload, SecretCryptoError } from './crypto.js';

const SECRET = 'unit-test-app-secret-with-entropy';

describe('secret encryption', () => {
  it('round-trips plaintext', () => {
    const payload = encryptSecret('sk-ant-api-key-12345', SECRET);
    expect(isEncryptedPayload(payload)).toBe(true);
    expect(payload).not.toContain('sk-ant');
    expect(decryptSecret(payload, SECRET)).toBe('sk-ant-api-key-12345');
  });

  it('produces unique ciphertexts per call (random IV)', () => {
    const a = encryptSecret('same-input', SECRET);
    const b = encryptSecret('same-input', SECRET);
    expect(a).not.toBe(b);
  });

  it('rejects the wrong APP_SECRET', () => {
    const payload = encryptSecret('value', SECRET);
    expect(() => decryptSecret(payload, 'a-different-secret-entirely')).toThrow(SecretCryptoError);
  });

  it('rejects tampered ciphertext (GCM auth)', () => {
    const payload = encryptSecret('value', SECRET);
    const parts = payload.split(':');
    // Flip a character inside the ciphertext segment.
    const ct = parts[3]!;
    parts[3] = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    expect(() => decryptSecret(parts.join(':'), SECRET)).toThrow(SecretCryptoError);
  });

  it('rejects unrecognized payload formats', () => {
    expect(() => decryptSecret('not-an-encrypted-payload', SECRET)).toThrow(SecretCryptoError);
    expect(isEncryptedPayload('plaintext')).toBe(false);
  });

  it('handles unicode plaintext', () => {
    const payload = encryptSecret('密钥 🔐 clé', SECRET);
    expect(decryptSecret(payload, SECRET)).toBe('密钥 🔐 clé');
  });
});
