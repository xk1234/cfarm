export const LUMENCLIP_MCP_TOOLS = [
  { name: "lumenclip_schedule_get", category: "scheduling" },
  { name: "lumenclip_collections_list", category: "collections" },
  { name: "lumenclip_assets_list", category: "collections" },
  { name: "lumenclip_collection_save", category: "collections" },
  { name: "lumenclip_collection_add_assets", category: "collections" },
  { name: "lumenclip_collection_delete", category: "collections" },
  { name: "lumenclip_outputs_list", category: "outputs" },
  { name: "lumenclip_output_get", category: "outputs" },
  { name: "lumenclip_output_delete", category: "outputs" },
  { name: "lumenclip_operations_list", category: "outputs" },
  { name: "lumenclip_operation_get", category: "outputs" },
  { name: "lumenclip_accounts_list", category: "publishing" },
  { name: "lumenclip_output_publish", category: "publishing" },
  { name: "lumenclip_output_mark_published", category: "publishing" },
] as const

export const LUMENCLIP_MCP_TOOL_NAMES = LUMENCLIP_MCP_TOOLS.map(
  (tool) => tool.name
)
