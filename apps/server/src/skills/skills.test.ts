import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { makeTestDb, makeTestEnv } from '../test-utils.js';
import { parseSkillMd } from './frontmatter.js';
import { createSkillTools } from './tools.js';

const SKILL_MD = `---
name: pdf-tools
description: Work with PDF files — extract text, merge, and split.
license: MIT
---

# PDF Tools

Use scripts/extract.py to extract text.
`;

const EXTRACT_PY = 'import sys\nprint("extracting", sys.argv[1])\n';

/** Mock of the GitHub contents API + raw downloads for one skill folder. */
function githubFetchMock(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);

    // Order matters: the scripts/ listing must match before the folder root.
    if (url.startsWith('https://api.github.com/repos/acme/skills/contents/pdf-tools/scripts')) {
      return Response.json([
        {
          type: 'file',
          name: 'extract.py',
          path: 'pdf-tools/scripts/extract.py',
          size: EXTRACT_PY.length,
          download_url: 'https://raw.test/pdf-tools/scripts/extract.py',
        },
      ]);
    }
    if (url.startsWith('https://api.github.com/repos/acme/skills/contents/pdf-tools')) {
      return Response.json([
        {
          type: 'file',
          name: 'SKILL.md',
          path: 'pdf-tools/SKILL.md',
          size: SKILL_MD.length,
          download_url: 'https://raw.test/pdf-tools/SKILL.md',
        },
        {
          type: 'dir',
          name: 'scripts',
          path: 'pdf-tools/scripts',
          size: 0,
          download_url: null,
        },
      ]);
    }
    if (url === 'https://raw.test/pdf-tools/SKILL.md') {
      return new Response(SKILL_MD);
    }
    if (url === 'https://raw.test/pdf-tools/scripts/extract.py') {
      return new Response(EXTRACT_PY);
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('parseSkillMd', () => {
  it('parses frontmatter name and description', () => {
    const parsed = parseSkillMd(SKILL_MD);
    expect(parsed.name).toBe('pdf-tools');
    expect(parsed.description).toContain('PDF files');
    expect(parsed.body).toContain('# PDF Tools');
  });

  it('handles quoted values and missing frontmatter', () => {
    expect(parseSkillMd('---\nname: "quoted"\n---\nbody').name).toBe('quoted');
    const none = parseSkillMd('# Just markdown');
    expect(none.name).toBeNull();
    expect(none.body).toBe('# Just markdown');
  });
});

describe('skill install + management API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let db: Awaited<ReturnType<typeof makeTestDb>>;

  beforeAll(async () => {
    db = await makeTestDb();
    app = await buildApp(makeTestEnv(), {
      db,
      envSource: {},
      skillFetchImpl: githubFetchMock(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('installs a skill from a GitHub folder URL with bundled files', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/skills',
      payload: { url: 'https://github.com/acme/skills/tree/main/pdf-tools' },
    });
    expect(response.statusCode).toBe(201);

    const skill = response.json();
    expect(skill.name).toBe('pdf-tools');
    expect(skill.fileCount).toBe(1);

    const detail = (await app.inject({ method: 'GET', url: `/api/skills/${skill.id}` })).json();
    expect(detail.content).toContain('# PDF Tools');
    expect(detail.files).toEqual([{ path: 'scripts/extract.py', size: EXTRACT_PY.length }]);
  });

  it('re-installing the same skill updates it instead of duplicating', async () => {
    const again = await app.inject({
      method: 'POST',
      url: '/api/skills',
      payload: { url: 'https://github.com/acme/skills/tree/main/pdf-tools' },
    });
    expect([200, 201]).toContain(again.statusCode);

    const list = (await app.inject({ method: 'GET', url: '/api/skills' })).json();
    expect(list).toHaveLength(1);
  });

  it('rejects non-GitHub URLs and folders without SKILL.md', async () => {
    const notGithub = await app.inject({
      method: 'POST',
      url: '/api/skills',
      payload: { url: 'https://example.com/foo' },
    });
    expect(notGithub.statusCode).toBe(400);

    const noSkill = await app.inject({
      method: 'POST',
      url: '/api/skills',
      payload: { url: 'https://github.com/acme/skills/tree/main/unknown' },
    });
    expect(noSkill.statusCode).toBe(422);
    expect(noSkill.json().error.code).toBe('SKILL_INSTALL_FAILED');
  });

  it('toggles and exposes skills to the agent via read_skill tools', async () => {
    const [skill] = (await app.inject({ method: 'GET', url: '/api/skills' })).json();

    const tools = createSkillTools(db);
    const loaded = (await tools.read_skill!.execute!(
      { name: 'pdf-tools' },
      { toolCallId: 't1', messages: [] },
    )) as { instructions: string; files: string[] };
    expect(loaded.instructions).toContain('# PDF Tools');
    expect(loaded.files).toEqual(['scripts/extract.py']);

    const file = (await tools.read_skill_file!.execute!(
      { name: 'pdf-tools', path: 'scripts/extract.py' },
      { toolCallId: 't2', messages: [] },
    )) as { content: string };
    expect(file.content).toBe(EXTRACT_PY);

    // Disabled skills are not readable.
    await app.inject({
      method: 'PATCH',
      url: `/api/skills/${skill.id}`,
      payload: { enabled: false },
    });
    const denied = (await tools.read_skill!.execute!(
      { name: 'pdf-tools' },
      { toolCallId: 't3', messages: [] },
    )) as { error?: string };
    expect(denied.error).toContain('No enabled skill');
  });
});
