import type { ApiKeyScope } from "@/lib/data/types"

export const LUMENCLIP_MCP_TOOL_CATEGORIES = [
  "slideshows",
  "collections",
  "outputs",
  "publishing",
  "scheduling",
  "batches",
] as const

export type LumenClipMcpToolCategory = (typeof LUMENCLIP_MCP_TOOL_CATEGORIES)[number]

export const LUMENCLIP_MCP_TOOLS = [
  { name: "lumenclip_spec_schema_get", category: "slideshows", scope: null },
  { name: "lumenclip_spec_validate", category: "slideshows", scope: null },
  { name: "lumenclip_fonts_list", category: "slideshows", scope: null },
  { name: "lumenclip_templates_list", category: "slideshows", scope: "templates:read" },
  { name: "lumenclip_slideshow_render", category: "slideshows", scope: "renders:write" },
  { name: "lumenclip_render_get", category: "slideshows", scope: "renders:read" },
  { name: "lumenclip_collections_list", category: "collections", scope: "media:read" },
  { name: "lumenclip_assets_list", category: "collections", scope: "media:read" },
  { name: "lumenclip_collection_save", category: "collections", scope: "media:write" },
  { name: "lumenclip_collection_add_assets", category: "collections", scope: "media:write" },
  { name: "lumenclip_collection_delete", category: "collections", scope: "media:write" },
  { name: "lumenclip_outputs_list", category: "outputs", scope: "renders:read" },
  { name: "lumenclip_output_get", category: "outputs", scope: "renders:read" },
  { name: "lumenclip_output_delete", category: "outputs", scope: "renders:write" },
  { name: "lumenclip_operations_list", category: "outputs", scope: "renders:read" },
  { name: "lumenclip_operation_get", category: "outputs", scope: "renders:read" },
  { name: "lumenclip_accounts_list", category: "publishing", scope: "posts:read" },
  { name: "lumenclip_output_publish", category: "publishing", scope: "posts:write" },
  { name: "lumenclip_output_mark_published", category: "publishing", scope: "posts:write" },
  { name: "lumenclip_schedule_get", category: "scheduling", scope: "posts:read" },
  { name: "lumenclip_batch_preview", category: "batches", scope: "batches:read" },
  { name: "lumenclip_batch_create", category: "batches", scope: "batches:write" },
  { name: "lumenclip_batch_get", category: "batches", scope: "batches:read" },
  { name: "lumenclip_batches_list", category: "batches", scope: "batches:read" },
  { name: "lumenclip_batch_retry", category: "batches", scope: "batches:write" },
  { name: "lumenclip_batch_cancel", category: "batches", scope: "batches:write" },
] as const satisfies readonly {
  name: string
  category: LumenClipMcpToolCategory
  /** API key scope a session needs to call the tool; null = any authenticated key. */
  scope: ApiKeyScope | null
}[]

export type LumenClipMcpToolName = (typeof LUMENCLIP_MCP_TOOLS)[number]["name"]

export const LUMENCLIP_MCP_TOOL_NAMES: LumenClipMcpToolName[] = LUMENCLIP_MCP_TOOLS.map((tool) => tool.name)

/** Tool names an API key holding `scopes` may not call (mirrors the /api/v1 route scopes). */
export function mcpToolNamesOutsideScopes(scopes: readonly ApiKeyScope[]): LumenClipMcpToolName[] {
  return LUMENCLIP_MCP_TOOLS.filter((tool) => tool.scope !== null && !scopes.includes(tool.scope)).map(
    (tool) => tool.name
  )
}
