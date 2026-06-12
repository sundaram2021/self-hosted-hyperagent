import type { Db, SkillRow } from '@hyperagent/db';
import { skills } from '@hyperagent/db';
import type { ToolSet } from 'ai';
import { tool } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

export async function listEnabledSkills(db: Db): Promise<SkillRow[]> {
  return db.select().from(skills).where(eq(skills.enabled, true));
}

/**
 * Progressive disclosure: the system prompt carries only names+descriptions;
 * the model loads full instructions and bundled files on demand.
 */
export function createSkillTools(db: Db): ToolSet {
  return {
    read_skill: tool({
      description:
        'Load the full instructions (SKILL.md) for an installed skill, plus the list of ' +
        'bundled file paths. Call this before using a skill.',
      inputSchema: z.object({
        name: z.string().describe('The skill name exactly as listed in the system prompt'),
      }),
      execute: async ({ name }) => {
        const [row] = await db.select().from(skills).where(eq(skills.name, name)).limit(1);
        if (!row || !row.enabled) {
          return { error: `No enabled skill named "${name}"` };
        }
        return {
          name: row.name,
          instructions: row.content,
          files: row.files.map((file) => file.path),
        };
      },
    }),
    read_skill_file: tool({
      description:
        'Read a bundled file from an installed skill (scripts, references, templates). ' +
        'Use the paths returned by read_skill. To run a script, pass its content to execute_code.',
      inputSchema: z.object({
        name: z.string().describe('The skill name'),
        path: z.string().describe('The bundled file path as returned by read_skill'),
      }),
      execute: async ({ name, path }) => {
        const [row] = await db.select().from(skills).where(eq(skills.name, name)).limit(1);
        if (!row || !row.enabled) {
          return { error: `No enabled skill named "${name}"` };
        }
        const file = row.files.find((candidate) => candidate.path === path);
        if (!file) {
          return {
            error: `No file "${path}" in skill "${name}"`,
            available: row.files.map((candidate) => candidate.path),
          };
        }
        return { path: file.path, content: file.content };
      },
    }),
  };
}
