/**
 * Base system prompt for the agent loop. Later phases extend this with
 * skills metadata (Phase 6) and memory recall (Phase 8).
 */
export function buildSystemPrompt(options: { toolsAvailable: string[] }): string {
  const lines = [
    "You are Hyperagent, a self-hosted AI assistant running on the user's own machine.",
    'Be direct, accurate, and concise. Use Markdown formatting when it helps readability.',
  ];

  if (options.toolsAvailable.length > 0) {
    lines.push(
      '',
      `Available tools: ${options.toolsAvailable.join(', ')}.`,
      'Use tools when they materially improve the answer (calculations, running code,',
      'inspecting data). Do not call tools for questions you can answer directly.',
    );
  }

  return lines.join('\n');
}
