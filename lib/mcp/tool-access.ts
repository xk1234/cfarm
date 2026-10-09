import "server-only"

import {
  getUserPreferences,
  updateUserPreferences,
  type LumenClipUserPreferences,
} from "@/lib/auth"
import { clean, isRecord } from "@/lib/guards"
import {
  LUMENCLIP_MCP_TOOLS,
  LUMENCLIP_MCP_TOOL_NAMES,
} from "@/lib/mcp/tool-registry"

const knownToolNames = new Set<string>(LUMENCLIP_MCP_TOOL_NAMES)

export type McpToolSetting = (typeof LUMENCLIP_MCP_TOOLS)[number] & {
  enabled: boolean
}

export function disabledMcpToolNames(preferences: unknown) {
  if (
    !isRecord(preferences) ||
    !Array.isArray(preferences.disabledMcpToolNames)
  ) {
    return []
  }
  return preferences.disabledMcpToolNames
    .map(clean)
    .filter((name): name is string => Boolean(name) && knownToolNames.has(name))
}

export function mcpToolSettings(preferences: unknown): McpToolSetting[] {
  const disabled = new Set(disabledMcpToolNames(preferences))
  return LUMENCLIP_MCP_TOOLS.map((tool) => ({
    ...tool,
    enabled: !disabled.has(tool.name),
  }))
}

export async function getDisabledMcpToolNames(userId: string) {
  return disabledMcpToolNames(await getUserPreferences(userId))
}

export async function setMcpToolEnabled(
  userId: string,
  toolName: string,
  enabled: boolean
) {
  if (!knownToolNames.has(toolName)) throw new Error("Unknown MCP API")
  const preferences = await getUserPreferences(userId)
  const disabled = new Set(disabledMcpToolNames(preferences))
  if (enabled) disabled.delete(toolName)
  else disabled.add(toolName)
  const next: Partial<LumenClipUserPreferences> = {
    disabledMcpToolNames: [...disabled].sort(),
  }
  await updateUserPreferences(userId, next)
  return mcpToolSettings({ ...preferences, ...next })
}
