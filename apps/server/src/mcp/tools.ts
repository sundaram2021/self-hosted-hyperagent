import type { ToolSet } from 'ai';
import { jsonSchema, tool } from 'ai';

import type { McpManager, McpServerConfig, McpToolDescriptor } from './manager.js';

/** Provider tool-name limits are ~64 chars, [a-zA-Z0-9_-]. */
export function mcpToolName(serverName: string, toolName: string): string {
  const sanitized = `${serverName}__${toolName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized.slice(0, 64);
}

/** Adapt discovered MCP tools into AI SDK tools, namespaced per server. */
export function mcpToolsToToolSet(
  manager: McpManager,
  config: McpServerConfig,
  tools: McpToolDescriptor[],
): ToolSet {
  const toolSet: ToolSet = {};

  for (const descriptor of tools) {
    toolSet[mcpToolName(config.name, descriptor.name)] = tool({
      description:
        descriptor.description ?? `Tool "${descriptor.name}" from MCP server "${config.name}"`,
      inputSchema: jsonSchema(descriptor.inputSchema),
      execute: async (input) => {
        const result = await manager.callTool(config, descriptor.name, input);
        if (result.isError) {
          throw new Error(result.content || `MCP tool ${descriptor.name} failed`);
        }
        return result.content;
      },
    });
  }

  return toolSet;
}
