export const LUMENCLIP_MCP_TOOLS = [
  { name: "lumenclip_collections_list", category: "collections" },
  { name: "lumenclip_assets_list", category: "collections" },
  { name: "lumenclip_collection_save", category: "collections" },
  { name: "lumenclip_collection_add_assets", category: "collections" },
  { name: "lumenclip_collection_delete", category: "collections" },
] as const

export const LUMENCLIP_MCP_TOOL_NAMES = LUMENCLIP_MCP_TOOLS.map(
  (tool) => tool.name
)
