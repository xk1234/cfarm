# LumenClip MCP tool reference

> Status: partially implemented. Sixty tools are callable through the
> public `/mcp` Streamable HTTP route and local stdio transport. The
> tool index is the source of truth for which contracts are implemented,
> proposed, or deferred.

The public MCP vocabulary is organized by app use case. Every proposed tool has
one primary owner in [the tool ownership index](tool-index.md); category pages
may link to a shared tool but do not invent a second incompatible schema.

| App use case            | Reference                                        | What it covers                                                                                                               |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Workflows               | [workflows/README.md](workflows/README.md)       | Named production generation pipelines and independently callable deterministic, provider, and storage stages.                |
| Workspace               | [workspace/README.md](workspace/README.md)       | Workspace defaults, limits, locale, and capabilities.                                                                        |
| Templates               | [templates/README.md](templates/README.md)       | Active and hidden template discovery, creation, editing, hook management, and manual generation runs.                        |
| Collections             | [collections/README.md](collections/README.md)   | Image, video, word, and product collections; imports, search, merge, and deletion policy.                                    |
| Slideshows              | [slideshow/README.md](slideshow/README.md)       | Template discovery, slideshow templates, direct slideshow creation, rendering, review, and publication.                      |
| Videos                  | [videos/README.md](videos/README.md)             | Video-template discovery and video-template generation through the common template contract.                                 |
| Other social media      | [social-media/README.md](social-media/README.md) | X, Threads, LinkedIn, account capability discovery, draft generation, and approval-gated publishing.                         |
| Outputs and operations  | [outputs/README.md](outputs/README.md)           | Generated draft discovery and long-running operation status.                                                                 |
| Accounts and publishing | [publishing/README.md](publishing/README.md)     | Safe account discovery, publishing, scheduling a ready output, and manual publication linking.                               |
| Scheduling              | [scheduling/README.md](scheduling/README.md)     | Recurring template schedules and one-output scheduling through shared tools.                                                 |
| Analytics               | [analytics/README.md](analytics/README.md)       | Attributed reports with metric-availability and provenance rules.                                                            |
| Exports                 | [exports/README.md](exports/README.md)           | Controlled JSON, CSV, and manifest-backed media exports.                                                                     |
| Shared contracts        | [shared-contracts.md](shared-contracts.md)       | Complete input/output schemas for tools reused by two or more categories, pagination, operations, errors, and resource URIs. |

## Callable tools

<!-- BEGIN:callable-tools -->
- `lumenclip_pipeline_catalog`
- `lumenclip_pipeline_stage_run`
- `lumenclip_pipeline_run`
- `lumenclip_templates_list`
- `lumenclip_template_create`
- `lumenclip_template_clone`
- `lumenclip_template_get`
- `lumenclip_template_variable_bindings_get`
- `lumenclip_template_experiment_dimensions`
- `lumenclip_template_experiment_run`
- `lumenclip_template_schema_update`
- `lumenclip_template_slide_design_update`
- `lumenclip_template_slide_text_item_update`
- `lumenclip_template_delete`
- `lumenclip_template_hooks_get`
- `lumenclip_template_hooks_update`
- `lumenclip_template_hook_upsert`
- `lumenclip_template_hook_set_enabled`
- `lumenclip_template_hook_delete`
- `lumenclip_hook_performance`
- `lumenclip_hook_variants_generate`
- `lumenclip_hook_variant_select`
- `lumenclip_run_plan_get`
- `lumenclip_template_run`
- `lumenclip_slideshow_generate`
- `lumenclip_slideshow_analyze`
- `lumenclip_ugc_estimate`
- `lumenclip_ugc_generate`
- `lumenclip_template_update`
- `lumenclip_collections_list`
- `lumenclip_product_collection_get`
- `lumenclip_assets_list`
- `lumenclip_variable_get`
- `lumenclip_variable_save`
- `lumenclip_variable_delete`
- `lumenclip_collection_save`
- `lumenclip_collection_add_assets`
- `lumenclip_collection_delete`
- `lumenclip_outputs_list`
- `lumenclip_output_get`
- `lumenclip_workflow_trace_get`
- `lumenclip_workflow_stage_get`
- `lumenclip_output_validate`
- `lumenclip_output_slide_text_update`
- `lumenclip_output_delete`
- `lumenclip_operations_list`
- `lumenclip_operation_get`
- `lumenclip_accounts_list`
- `lumenclip_workspace_members_list`
- `lumenclip_output_publish`
- `lumenclip_output_mark_published`
- `lumenclip_analytics_report`
- `lumenclip_tiktok_studio_analytics_import_start`
- `lumenclip_tiktok_studio_analytics_report`
- `lumenclip_tiktok_studio_analytics_batch_start`
- `lumenclip_tiktok_comments_collect_start`
- `lumenclip_tiktok_comments_list`
- `lumenclip_tiktok_comment_replies_draft`
- `lumenclip_tiktok_comment_replies_approve`
- `lumenclip_tiktok_comment_replies_send`
<!-- END:callable-tools -->

The remaining names in this reference describe the intended general MCP
surface and are not callable until marked **Implemented** in the tool index.

## Transports

- Streamable HTTP: public app route `GET|POST|DELETE /mcp`, scoped to
  `LUMENCLIP_MCP_OWNER_ID` or `LUMENCLIP_SYSTEM_OWNER_ID`.
- Local stdio: `pnpm mcp`, scoped to `LUMENCLIP_MCP_OWNER_ID`. When Appwrite
  points to localhost this explicit local ID is mandatory; the cloud system
  owner is never used as a fallback.

## Naming and availability

- Raw tool names use the `lumenclip_` prefix.
- Direct X-, Threads-, LinkedIn-, provider-, model-, and video-generator tools
  are intentionally not defined. Stable workflows use the common
  `Template`, `Output`, and `Operation` objects.
- Manual generation always creates an unpublished, unscheduled draft.
- Publishing is a separate, explicitly confirmed tool call.
- Normal tool results contain metadata and resource links, never media bytes,
  credentials, Appwrite rows, bucket IDs, or PostFast tokens.

## Documentation rules

- Start at the app use-case page, then follow links to shared envelopes only
  when implementing a client or server adapter.
- Every tool page states status, scope, input, output, side effects, and relevant
  errors.
- [tool-index.md](tool-index.md) is the completeness checklist and prevents
  tools from becoming orphaned or being documented under unrelated features.
- `shared-contracts.md` owns cross-cutting pagination, idempotency, operation,
  resource URI, and error shapes; use-case pages own workflow meaning.

The architectural source remains
[docs/roadmap/lumenclip-mcp-server.md](../docs/roadmap/lumenclip-mcp-server.md).
