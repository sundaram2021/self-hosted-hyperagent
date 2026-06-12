import type { Db } from '@hyperagent/db';
import { settings } from '@hyperagent/db';
import type { SettingSummary } from '@hyperagent/shared';
import { eq } from 'drizzle-orm';

import { decryptSecret, encryptSecret } from '../crypto.js';
import { AppSecretMissingError } from '../errors.js';

const PREVIEW_LENGTH = 24;

export class SettingsService {
  constructor(
    private readonly db: Db,
    private readonly appSecret: string | undefined,
  ) {}

  async upsert(key: string, value: string, encrypted: boolean): Promise<void> {
    let storedValue = value;

    if (encrypted) {
      if (!this.appSecret) throw new AppSecretMissingError();
      storedValue = encryptSecret(value, this.appSecret);
    }

    await this.db
      .insert(settings)
      .values({ key, value: storedValue, encrypted, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: storedValue, encrypted, updatedAt: new Date() },
      });
  }

  /** Returns the decrypted value, or null when the key does not exist. */
  async getValue(key: string): Promise<string | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key)).limit(1);
    if (!row) return null;

    if (!row.encrypted) return row.value;

    if (!this.appSecret) throw new AppSecretMissingError();
    return decryptSecret(row.value, this.appSecret);
  }

  async has(key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    return row !== undefined;
  }

  /** Secret values are never exposed here — encrypted settings get a null preview. */
  async list(): Promise<SettingSummary[]> {
    const rows = await this.db.select().from(settings).orderBy(settings.key);
    return rows.map((row) => ({
      key: row.key,
      encrypted: row.encrypted,
      preview: row.encrypted
        ? null
        : row.value.length > PREVIEW_LENGTH
          ? `${row.value.slice(0, PREVIEW_LENGTH)}…`
          : row.value,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await this.db
      .delete(settings)
      .where(eq(settings.key, key))
      .returning({ key: settings.key });
    return deleted.length > 0;
  }
}
