import type { Db, McpServerRow } from '@hyperagent/db';
import { mcpServers } from '@hyperagent/db';
import type { CreateMcpServerBody, McpServer, UpdateMcpServerBody } from '@hyperagent/shared';
import { eq } from 'drizzle-orm';

import { decryptSecret, encryptSecret, isEncryptedPayload } from '../crypto.js';
import { AppSecretMissingError, NotFoundError } from '../errors.js';
import type { McpServerConfig } from '../mcp/manager.js';

/**
 * env/headers may contain secrets. With APP_SECRET configured they are stored
 * as enc:v1 payloads; without it, as plain JSON (self-hosted fallback, same
 * trust model as .env files on disk).
 */
function serializeSecretMap(
  map: Record<string, string> | undefined,
  appSecret: string | undefined,
): string | null {
  if (!map || Object.keys(map).length === 0) return null;
  const json = JSON.stringify(map);
  return appSecret ? encryptSecret(json, appSecret) : json;
}

function deserializeSecretMap(
  raw: string | null,
  appSecret: string | undefined,
): Record<string, string> | null {
  if (!raw) return null;
  let json = raw;
  if (isEncryptedPayload(raw)) {
    if (!appSecret) throw new AppSecretMissingError();
    json = decryptSecret(raw, appSecret);
  }
  return JSON.parse(json) as Record<string, string>;
}

function secretMapKeys(raw: string | null, appSecret: string | undefined): string[] {
  try {
    return Object.keys(deserializeSecretMap(raw, appSecret) ?? {});
  } catch {
    return ['<unreadable: APP_SECRET changed?>'];
  }
}

export class McpServerService {
  constructor(
    private readonly db: Db,
    private readonly appSecret: string | undefined,
  ) {}

  serialize(row: McpServerRow): McpServer {
    return {
      id: row.id,
      name: row.name,
      transport: row.transport,
      command: row.command,
      args: row.args,
      envKeys: secretMapKeys(row.env, this.appSecret),
      url: row.url,
      headerKeys: secretMapKeys(row.headers, this.appSecret),
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Full decrypted config for connecting — server-internal, never serialized. */
  toConfig(row: McpServerRow): McpServerConfig {
    return {
      id: row.id,
      name: row.name,
      transport: row.transport,
      command: row.command,
      args: row.args,
      env: deserializeSecretMap(row.env, this.appSecret),
      url: row.url,
      headers: deserializeSecretMap(row.headers, this.appSecret),
    };
  }

  async list(): Promise<McpServerRow[]> {
    return this.db.select().from(mcpServers).orderBy(mcpServers.name);
  }

  async listEnabled(): Promise<McpServerRow[]> {
    return this.db.select().from(mcpServers).where(eq(mcpServers.enabled, true));
  }

  async get(id: string): Promise<McpServerRow> {
    const [row] = await this.db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
    if (!row) throw new NotFoundError('MCP server', id);
    return row;
  }

  async create(body: CreateMcpServerBody): Promise<McpServerRow> {
    const [row] = await this.db
      .insert(mcpServers)
      .values({
        name: body.name,
        transport: body.transport,
        command: body.command ?? null,
        args: body.args ?? null,
        env: serializeSecretMap(body.env, this.appSecret),
        url: body.url ?? null,
        headers: serializeSecretMap(body.headers, this.appSecret),
        enabled: body.enabled ?? true,
      })
      .returning();
    return row!;
  }

  async update(id: string, body: UpdateMcpServerBody): Promise<McpServerRow> {
    const existing = await this.get(id);

    const [row] = await this.db
      .update(mcpServers)
      .set({
        name: body.name ?? existing.name,
        transport: body.transport ?? existing.transport,
        command: body.command !== undefined ? body.command : existing.command,
        args: body.args !== undefined ? body.args : existing.args,
        env: body.env !== undefined ? serializeSecretMap(body.env, this.appSecret) : existing.env,
        url: body.url !== undefined ? body.url : existing.url,
        headers:
          body.headers !== undefined
            ? serializeSecretMap(body.headers, this.appSecret)
            : existing.headers,
        enabled: body.enabled ?? existing.enabled,
        updatedAt: new Date(),
      })
      .where(eq(mcpServers.id, id))
      .returning();
    return row!;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.db
      .delete(mcpServers)
      .where(eq(mcpServers.id, id))
      .returning({ id: mcpServers.id });
    if (deleted.length === 0) throw new NotFoundError('MCP server', id);
  }
}
