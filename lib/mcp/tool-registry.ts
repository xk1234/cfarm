export const LUMENCLIP_MCP_TOOL_CATEGORIES = [
  "slideshows",
  "collections",
  "outputs",
  "publishing",
  "scheduling",
] as const

export type LumenClipMcpToolCategory = (typeof LUMENCLIP_MCP_TOOL_CATEGORIES)[number]

export const LUMENCLIP_MCP_TOOLS = [
  { name: "lumenclip_spec_schema_get", category: "slideshows" },
  { name: "lumenclip_spec_validate", category: "slideshows" },
  { name: "lumenclip_fonts_list", category: "slideshows" },
  { name: "lumenclip_templates_list", category: "slideshows" },
  { name: "lumenclip_slideshow_render", category: "slideshows" },
  { name: "lumenclip_render_get", category: "slideshows" },
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
  { name: "lumenclip_schedule_get", category: "scheduling" },
] as const satisfies readonly { name: string; category: LumenClipMcpToolCategory }[]

export type LumenClipMcpToolName = (typeof LUMENCLIP_MCP_TOOLS)[number]["name"]

export const LUMENCLIP_MCP_TOOL_NAMES: LumenClipMcpToolName[] = LUMENCLIP_MCP_TOOLS.map((tool) => tool.name)
