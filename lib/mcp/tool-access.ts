import "server-only"

import { getRepositories, type Repositories, type WorkspaceId } from "@/lib/data"
import { LUMENCLIP_MCP_TOOLS, LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"

const knownToolNames = new Set<string>(LUMENCLIP_MCP_TOOL_NAMES)

export type McpToolSetting = (typeof LUMENCLIP_MCP_TOOLS)[number] & {
  enabled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * Disabled tool names from workspace settings (`mcpDisabledTools`) or the
 * legacy preferences shape (`disabledMcpToolNames`). Unknown names are dropped.
 */
export function disabledMcpToolNames(settings: unknown): string[] {
  if (!isRecord(settings)) return []
  const raw = Array.isArray(settings.mcpDisabledTools)
    ? settings.mcpDisabledTools
    : Array.isArray(settings.disabledMcpToolNames)
      ? settings.disabledMcpToolNames
      : []
  return raw
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter((name) => Boolean(name) && knownToolNames.has(name))
}

export function mcpToolSettings(settings: unknown): McpToolSetting[] {
  const disabled = new Set(disabledMcpToolNames(settings))
  return LUMENCLIP_MCP_TOOLS.map((tool) => ({ ...tool, enabled: !disabled.has(tool.name) }))
}

export async function getMcpToolSettings(
  workspaceId: WorkspaceId,
  repos: Repositories = getRepositories()
): Promise<McpToolSetting[]> {
  return mcpToolSettings(await repos.settings.get(workspaceId))
}

export async function getDisabledMcpToolNames(
  workspaceId: WorkspaceId,
  repos: Repositories = getRepositories()
): Promise<string[]> {
  return disabledMcpToolNames(await repos.settings.get(workspaceId))
}

export async function setMcpToolEnabled(
  workspaceId: WorkspaceId,
  toolName: string,
  enabled: boolean,
  repos: Repositories = getRepositories()
): Promise<McpToolSetting[]> {
  if (!knownToolNames.has(toolName)) throw new Error("Unknown MCP API")
  const disabled = new Set(await getDisabledMcpToolNames(workspaceId, repos))
  if (enabled) disabled.delete(toolName)
  else disabled.add(toolName)
  const settings = await repos.settings.patch(workspaceId, { mcpDisabledTools: [...disabled].sort() })
  return mcpToolSettings(settings)
}
