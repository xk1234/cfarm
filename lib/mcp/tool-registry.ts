export const LUMENCLIP_MCP_TOOLS = [
  { name: "lumenclip_automations_list", category: "automations" },
  { name: "lumenclip_automation_get", category: "automations" },
  { name: "lumenclip_automation_run", category: "automations" },
  { name: "lumenclip_schedule_get", category: "scheduling" },
  { name: "lumenclip_slideshow_generate", category: "slideshows" },
  { name: "lumenclip_ugc_estimate", category: "videos" },
  { name: "lumenclip_ugc_generate", category: "videos" },
  { name: "lumenclip_automation_update", category: "automations" },
  { name: "lumenclip_collections_list", category: "collections" },
  { name: "lumenclip_collection_save", category: "collections" },
  { name: "lumenclip_collection_add_assets", category: "collections" },
  { name: "lumenclip_collection_delete", category: "collections" },
  { name: "lumenclip_outputs_list", category: "outputs" },
  { name: "lumenclip_output_delete", category: "outputs" },
  { name: "lumenclip_operation_get", category: "outputs" },
  { name: "lumenclip_accounts_list", category: "publishing" },
  { name: "lumenclip_output_publish", category: "publishing" },
  { name: "lumenclip_output_mark_published", category: "publishing" },
  { name: "lumenclip_analytics_report", category: "analytics" },
  { name: "lumenclip_tiktok_import_start", category: "publishing" },
  { name: "lumenclip_tiktok_import_preview", category: "publishing" },
  { name: "lumenclip_tiktok_publications_link", category: "publishing" },
] as const

export const LUMENCLIP_MCP_TOOL_NAMES = LUMENCLIP_MCP_TOOLS.map(
  (tool) => tool.name
)
