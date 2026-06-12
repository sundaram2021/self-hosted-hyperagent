import type { Db } from '@hyperagent/db';
import { integrationKeySettingKey } from '@hyperagent/shared';
import type { ToolSet } from 'ai';
import type { FastifyBaseLogger } from 'fastify';

import type { Env } from '../env.js';
import type { McpManager } from '../mcp/manager.js';
import { mcpToolsToToolSet } from '../mcp/tools.js';
import type { McpServerService } from '../services/mcp-servers.js';
import type { SettingsService } from '../services/settings.js';
import { createSkillTools, listEnabledSkills } from '../skills/tools.js';
import { createExecuteCodeTool } from './tools/execute-code.js';
import { createExaTools } from './tools/exa.js';

export interface BuildToolsDeps {
  db: Db;
  env: Env;
  envSource: NodeJS.ProcessEnv;
  settings: SettingsService;
  mcpService: McpServerService;
  mcpManager: McpManager;
  logger?: FastifyBaseLogger;
  fetchImpl?: typeof fetch;
}

export interface BuiltTools {
  tools: ToolSet;
  /** Enabled skills for the system prompt (names + descriptions). */
  skills: Array<{ name: string; description: string }>;
}

/**
 * Assemble the toolset for one agent run:
 * built-ins (execute_code) + Exa (when a key exists) + skill tools (when any
 * skill is enabled) + tools from every enabled MCP server.
 *
 * MCP connection failures degrade gracefully: the failing server is skipped
 * (and logged) rather than failing the whole run.
 */
export async function buildRunTools(deps: BuildToolsDeps): Promise<BuiltTools> {
  const tools: ToolSet = {
    execute_code: createExecuteCodeTool({
      sandboxUrl: deps.env.SANDBOX_URL,
      timeoutMs: deps.env.SANDBOX_EXECUTE_TIMEOUT_MS,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    }),
  };

  // Exa — env first, then encrypted DB key.
  const exaKey =
    deps.envSource.EXA_API_KEY ?? (await deps.settings.getValue(integrationKeySettingKey('exa')));
  if (exaKey) {
    Object.assign(
      tools,
      createExaTools({
        apiKey: exaKey,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      }),
    );
  }

  // Skills — progressive disclosure tools only when something is enabled.
  const enabledSkills = await listEnabledSkills(deps.db);
  if (enabledSkills.length > 0) {
    Object.assign(tools, createSkillTools(deps.db));
  }

  // MCP servers.
  for (const row of await deps.mcpService.listEnabled()) {
    try {
      const config = deps.mcpService.toConfig(row);
      const connection = await deps.mcpManager.getConnection(config);
      Object.assign(tools, mcpToolsToToolSet(deps.mcpManager, config, connection.tools));
    } catch (error) {
      deps.logger?.warn(
        { mcpServer: row.name, err: error },
        'skipping MCP server (connection failed)',
      );
    }
  }

  return {
    tools,
    skills: enabledSkills.map((skill) => ({ name: skill.name, description: skill.description })),
  };
}
