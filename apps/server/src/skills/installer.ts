import { parseSkillMd } from './frontmatter.js';

const MAX_FILES = 25;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_DEPTH = 3;

export interface InstalledSkillData {
  name: string;
  description: string;
  source: string;
  content: string;
  files: Array<{ path: string; content: string }>;
}

export class SkillInstallError extends Error {}

interface GitHubLocation {
  owner: string;
  repo: string;
  ref: string | null;
  path: string;
}

/** Accepts https://github.com/owner/repo and …/tree/<ref>/<sub/path>. */
export function parseGitHubUrl(url: string): GitHubLocation {
  const parsed = new URL(url);
  if (parsed.hostname !== 'github.com') {
    throw new SkillInstallError('Only github.com URLs are supported');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new SkillInstallError('Expected https://github.com/owner/repo[/tree/branch/path]');
  }

  const [owner, repo, ...rest] = segments;
  if (rest.length === 0) {
    return { owner: owner!, repo: repo!.replace(/\.git$/, ''), ref: null, path: '' };
  }

  if (rest[0] !== 'tree' || rest.length < 2) {
    throw new SkillInstallError(
      'Folder URLs must use the /tree/<branch>/<path> form (copy it from the GitHub UI)',
    );
  }

  return {
    owner: owner!,
    repo: repo!.replace(/\.git$/, ''),
    ref: rest[1]!,
    path: rest.slice(2).join('/'),
  };
}

interface GitHubEntry {
  type: 'file' | 'dir' | string;
  name: string;
  path: string;
  size: number;
  download_url: string | null;
}

async function githubJson(
  url: string,
  fetchImpl: typeof fetch,
  githubToken?: string,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'self-hosted-hyperagent',
      ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
    },
  });
  if (response.status === 404) {
    throw new SkillInstallError(`Not found on GitHub: ${url}`);
  }
  if (response.status === 403) {
    throw new SkillInstallError(
      'GitHub API rate limit reached. Set GITHUB_TOKEN in the server environment and retry.',
    );
  }
  if (!response.ok) {
    throw new SkillInstallError(`GitHub API error ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchRaw(url: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'self-hosted-hyperagent' },
  });
  if (!response.ok) {
    throw new SkillInstallError(`Failed to download ${url} (${response.status})`);
  }
  return response.text();
}

/**
 * Install a skill from a public GitHub repo or folder containing SKILL.md.
 * Bundled files are collected recursively with size/count/depth caps.
 */
export async function installSkillFromGitHub(
  url: string,
  fetchImpl: typeof fetch = fetch,
  githubToken?: string,
): Promise<InstalledSkillData> {
  const location = parseGitHubUrl(url);
  const refQuery = location.ref ? `?ref=${encodeURIComponent(location.ref)}` : '';

  const listDir = async (dirPath: string): Promise<GitHubEntry[]> => {
    const api = `https://api.github.com/repos/${location.owner}/${location.repo}/contents/${dirPath}${refQuery}`;
    const entries = await githubJson(api, fetchImpl, githubToken);
    if (!Array.isArray(entries)) {
      throw new SkillInstallError('Expected a folder, found a single file');
    }
    return entries as GitHubEntry[];
  };

  const rootEntries = await listDir(location.path);
  const skillEntry = rootEntries.find(
    (entry) => entry.type === 'file' && entry.name.toLowerCase() === 'skill.md',
  );
  if (!skillEntry?.download_url) {
    throw new SkillInstallError(
      'No SKILL.md found at that location. Point at a folder that contains one ' +
        '(e.g. https://github.com/anthropics/skills/tree/main/document-skills/pdf).',
    );
  }

  const content = await fetchRaw(skillEntry.download_url, fetchImpl);
  const frontmatter = parseSkillMd(content);
  const fallbackName = location.path.split('/').filter(Boolean).pop() ?? location.repo;

  const files: Array<{ path: string; content: string }> = [];

  const collect = async (entries: GitHubEntry[], base: string, depth: number): Promise<void> => {
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const relative = base ? `${base}/${entry.name}` : entry.name;

      if (entry.type === 'dir' && depth < MAX_DEPTH) {
        await collect(await listDir(entry.path), relative, depth + 1);
        continue;
      }
      if (entry.type !== 'file') continue;
      if (entry.name.toLowerCase() === 'skill.md' && base === '') continue;
      if (entry.size > MAX_FILE_BYTES || !entry.download_url) continue;

      files.push({ path: relative, content: await fetchRaw(entry.download_url, fetchImpl) });
    }
  };

  await collect(rootEntries, '', 0);

  return {
    name: (frontmatter.name ?? fallbackName).trim().slice(0, 100),
    description: (frontmatter.description ?? '').trim().slice(0, 1000),
    source: url,
    content,
    files,
  };
}
