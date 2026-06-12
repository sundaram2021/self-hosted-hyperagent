'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Skill, SkillDetail } from '@hyperagent/shared';

import { Markdown } from '@/components/markdown';
import { deleteSkill, getSkill, installSkill, listSkills, updateSkill } from '@/lib/api';

function SkillCard({
  skill,
  onChanged,
  onError,
}: {
  skill: Skill;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [open, setOpen] = useState(false);

  async function onToggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try {
        setDetail(await getSkill(skill.id));
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to load skill');
      }
    }
  }

  async function onToggleEnabled() {
    try {
      await updateSkill(skill.id, !skill.enabled);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update skill');
    }
  }

  async function onDelete() {
    if (!window.confirm(`Remove skill "${skill.name}"?`)) return;
    try {
      await deleteSkill(skill.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete skill');
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => void onToggleOpen()}
            className="font-mono text-sm text-zinc-200 hover:text-white"
          >
            {skill.name} {open ? '▾' : '▸'}
          </button>
          {skill.enabled ? (
            <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[11px] text-emerald-400">
              enabled
            </span>
          ) : (
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-500">
              disabled
            </span>
          )}
          {skill.fileCount > 0 ? (
            <span className="text-[11px] text-zinc-600">
              {skill.fileCount} file{skill.fileCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onToggleEnabled()}
            className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:text-zinc-100"
          >
            {skill.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => void onDelete()}
            className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-400">{skill.description || 'No description'}</p>
      <a
        href={skill.source}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-[11px] text-zinc-600 hover:text-emerald-400"
      >
        {skill.source}
      </a>

      {open && detail ? (
        <div className="mt-1 flex flex-col gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 p-3">
          {detail.files.length > 0 ? (
            <p className="font-mono text-[11px] text-zinc-500">
              files: {detail.files.map((file) => file.path).join(', ')}
            </p>
          ) : null}
          <div className="max-h-80 overflow-y-auto">
            <Markdown>{detail.content}</Markdown>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [url, setUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSkills(await listSkills());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load skills');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onInstall() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setInstalling(true);
    setError(null);
    try {
      await installSkill(trimmed);
      setUrl('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
        <p className="text-sm text-zinc-400">
          Install any public Agent Skill (SKILL.md format) from GitHub — including everything on{' '}
          <a
            href="https://skills.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline"
          >
            skills.sh
          </a>{' '}
          and{' '}
          <a
            href="https://github.com/anthropics/skills"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline"
          >
            anthropics/skills
          </a>
          . Enabled skills are offered to the agent, which loads their instructions on demand.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onInstall();
          }}
          placeholder="https://github.com/anthropics/skills/tree/main/document-skills/pdf"
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
        />
        <button
          onClick={() => void onInstall()}
          disabled={installing || !url.trim()}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {installing ? 'Installing…' : 'Install'}
        </button>
      </div>

      <section className="flex flex-col gap-3">
        {skills === null ? (
          <p className="text-sm text-zinc-600">Loading…</p>
        ) : skills.length === 0 ? (
          <p className="text-sm text-zinc-600">No skills installed yet.</p>
        ) : (
          skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onChanged={() => void refresh()}
              onError={setError}
            />
          ))
        )}
      </section>
    </div>
  );
}
