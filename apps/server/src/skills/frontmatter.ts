/**
 * Minimal YAML-frontmatter parser for SKILL.md files.
 *
 * Supports the flat `key: value` subset used by the Agent Skills format
 * (name, description, license, allowed-tools as a comma string…). Nested
 * structures are ignored rather than mis-parsed.
 */
export interface SkillFrontmatter {
  name: string | null;
  description: string | null;
  body: string;
}

export function parseSkillMd(content: string): SkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) {
    return { name: null, description: null, body: content };
  }

  const fields = new Map<string, string>();
  for (const line of match[1]!.split(/\r?\n/)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;
    if (/^\s/.test(line)) continue; // nested/indented — skip

    const key = line.slice(0, colonIndex).trim().toLowerCase();
    let value = line.slice(colonIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) fields.set(key, value);
  }

  return {
    name: fields.get('name') ?? null,
    description: fields.get('description') ?? null,
    body: content.slice(match[0].length),
  };
}
