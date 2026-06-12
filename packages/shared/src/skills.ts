import { z } from 'zod';

/** Skill summary as listed by the API. */
export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  source: z.string(),
  enabled: z.boolean(),
  fileCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Skill = z.infer<typeof skillSchema>;

export const skillFileInfoSchema = z.object({
  path: z.string(),
  size: z.number(),
});

export const skillDetailSchema = skillSchema.extend({
  content: z.string(),
  files: z.array(skillFileInfoSchema),
});
export type SkillDetail = z.infer<typeof skillDetailSchema>;

/**
 * Install from a public GitHub repo (or a folder within one) that contains a
 * SKILL.md — the open Agent Skills format used by anthropics/skills and the
 * skills.sh registry.
 */
export const installSkillBodySchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://github.com/'), {
      message:
        'Only public GitHub URLs are supported (https://github.com/owner/repo[/tree/branch/path])',
    }),
});
export type InstallSkillBody = z.infer<typeof installSkillBodySchema>;

export const updateSkillBodySchema = z.object({
  enabled: z.boolean(),
});
export type UpdateSkillBody = z.infer<typeof updateSkillBodySchema>;
