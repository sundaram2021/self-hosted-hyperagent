/**
 * Base system prompt for the agent loop. Memory recall (Phase 8) extends
 * this further.
 */
export interface SystemPromptOptions {
  toolsAvailable: string[];
  skills?: Array<{ name: string; description: string }>;
  /** Hybrid-recall results injected each turn (Phase 8). */
  memories?: Array<{ content: string; category: string }>;
}

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const lines = [
    "You are Hyperagent, a self-hosted AI assistant running on the user's own machine.",
    'Be direct, accurate, and concise. Use Markdown formatting when it helps readability.',
  ];

  if (options.toolsAvailable.length > 0) {
    lines.push(
      '',
      `Available tools: ${options.toolsAvailable.join(', ')}.`,
      'Use tools when they materially improve the answer (calculations, running code,',
      'searching the web, inspecting data). Do not call tools for questions you can',
      'answer directly. When you use web search results, cite source URLs.',
    );
  }

  const memories = options.memories ?? [];
  if (memories.length > 0) {
    lines.push(
      '',
      'Relevant long-term memories about the user (from previous conversations):',
      ...memories.map((memory) => `- [${memory.category}] ${memory.content}`),
      'Use them naturally when relevant; save new durable facts with memory_save.',
    );
  }

  const skills = options.skills ?? [];
  if (skills.length > 0) {
    lines.push(
      '',
      'Installed skills (specialized instructions you can load on demand):',
      ...skills.map((skill) => `- ${skill.name}: ${skill.description || 'no description'}`),
      'Before using a skill, call read_skill to load its full instructions.',
      'Skill files (scripts, templates) are available via read_skill_file; run scripts',
      'by passing their content to execute_code.',
    );
  }

  return lines.join('\n');
}
