import { skills as skillsTable } from '@hyperagent/db';
import { describe, expect, it } from 'vitest';

import { McpManager } from '../mcp/manager.js';
import { McpServerService } from '../services/mcp-servers.js';
import { SettingsService } from '../services/settings.js';
import { makeTestDb, makeTestEnv } from '../test-utils.js';
import { buildRunTools } from './build-tools.js';

async function makeDeps(envSource: NodeJS.ProcessEnv = {}) {
  const db = await makeTestDb();
  const env = makeTestEnv();
  const settings = new SettingsService(db, env.APP_SECRET);
  const mcpService = new McpServerService(db, env.APP_SECRET);
  const mcpManager = new McpManager(() => {
    throw new Error('no MCP servers in this test');
  });
  return { db, env, envSource, settings, mcpService, mcpManager };
}

describe('buildRunTools', () => {
  it('always includes execute_code; Exa and skills tools only when configured', async () => {
    const deps = await makeDeps();
    const { tools, skills } = await buildRunTools(deps);

    expect(Object.keys(tools)).toEqual(['execute_code']);
    expect(skills).toEqual([]);
  });

  it('adds Exa tools when EXA_API_KEY is in the environment', async () => {
    const deps = await makeDeps({ EXA_API_KEY: 'exa-env-key' });
    const { tools } = await buildRunTools(deps);

    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(['execute_code', 'web_search', 'get_page_contents', 'find_similar']),
    );
  });

  it('adds Exa tools when the key is stored encrypted in settings', async () => {
    const deps = await makeDeps();
    await deps.settings.upsert('integration:exa:api_key', 'exa-db-key', true);

    const { tools } = await buildRunTools(deps);
    expect(Object.keys(tools)).toContain('web_search');
  });

  it('adds skill tools and prompt entries when skills are enabled', async () => {
    const deps = await makeDeps();
    await deps.db.insert(skillsTable).values({
      name: 'pdf-tools',
      description: 'PDF helpers',
      source: 'https://github.com/acme/skills/tree/main/pdf-tools',
      content: '# PDF',
      files: [],
    });

    const { tools, skills } = await buildRunTools(deps);
    expect(Object.keys(tools)).toEqual(expect.arrayContaining(['read_skill', 'read_skill_file']));
    expect(skills).toEqual([{ name: 'pdf-tools', description: 'PDF helpers' }]);
  });

  it('skips failing MCP servers instead of failing the run', async () => {
    const deps = await makeDeps();
    await deps.mcpService.create({
      name: 'broken',
      transport: 'http',
      url: 'http://nowhere.test',
    });

    const { tools } = await buildRunTools(deps);
    expect(Object.keys(tools)).toEqual(['execute_code']);
  });
});
