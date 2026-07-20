# LumenClip MCP tool reference

> Status: partially implemented. Twenty tools are callable through the
> authenticated `/mcp` Streamable HTTP route and local stdio transport. The
> tool index is the source of truth for which contracts are implemented,
> proposed, or deferred.

The public MCP vocabulary is organized by app use case. Every proposed tool has
one primary owner in [the tool ownership index](tool-index.md); category pages
may link to a shared tool but do not invent a second incompatible schema.

| App use case            | Reference                                        | What it covers                                                                                                               |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Workspace               | [workspace/README.md](workspace/README.md)       | Workspace defaults, limits, locale, and capabilities.                                                                        |
| Templates               | [templates/README.md](templates/README.md)       | Catalog search, template detail, versions, examples, and allowed overrides.                                                  |
| Automations             | [automations/README.md](automations/README.md)   | Automation discovery, preview, create, update, and manual generation runs.                                                   |
| Collections             | [collections/README.md](collections/README.md)   | Image, video, word, and product collections; imports, search, merge, and deletion policy.                                    |
| Slideshows              | [slideshow/README.md](slideshow/README.md)       | Template discovery, slideshow automations, direct slideshow creation, rendering, review, and publication.                    |
| Videos                  | [videos/README.md](videos/README.md)             | Video-template discovery and video-automation generation through the common automation contract.                             |
| Other social media      | [social-media/README.md](social-media/README.md) | X, Threads, LinkedIn, account capability discovery, draft generation, and approval-gated publishing.                         |
| Outputs and operations  | [outputs/README.md](outputs/README.md)           | Generated draft discovery and long-running operation status.                                                                 |
| Accounts and publishing | [publishing/README.md](publishing/README.md)     | Safe account discovery, publishing, scheduling a ready output, and manual publication linking.                               |
| Scheduling              | [scheduling/README.md](scheduling/README.md)     | Recurring automation schedules and one-output scheduling through shared tools.                                               |
| Analytics               | [analytics/README.md](analytics/README.md)       | Attributed reports with metric-availability and provenance rules.                                                            |
| Exports                 | [exports/README.md](exports/README.md)           | Controlled JSON, CSV, and manifest-backed media exports.                                                                     |
| Shared contracts        | [shared-contracts.md](shared-contracts.md)       | Complete input/output schemas for tools reused by two or more categories, pagination, operations, errors, and resource URIs. |

## Callable tools

- `lumenclip_automations_list`
- `lumenclip_automation_get`
- `lumenclip_automation_run`
- `lumenclip_schedule_get`
- `lumenclip_slideshow_generate`
- `lumenclip_automation_update`
- `lumenclip_collections_list`
- `lumenclip_collection_save`
- `lumenclip_collection_add_assets`
- `lumenclip_collection_delete`
- `lumenclip_outputs_list`
- `lumenclip_output_delete`
- `lumenclip_operation_get`
- `lumenclip_accounts_list`
- `lumenclip_output_publish`
- `lumenclip_output_mark_published`
- `lumenclip_analytics_report`
- `lumenclip_tiktok_import_start`
- `lumenclip_tiktok_import_preview`
- `lumenclip_tiktok_publications_link`

The remaining names in this reference describe the intended general MCP
surface and are not callable until marked **Implemented** in the tool index.

## Transports

- Streamable HTTP: authenticated app route `GET|POST|DELETE /mcp`.
- Local stdio: `pnpm mcp`, scoped to `LUMENCLIP_MCP_OWNER_ID`. When Appwrite
  points to localhost this explicit local ID is mandatory; the cloud system
  owner is never used as a fallback. The older `pnpm mcp:tiktok` command
  remains as a compatibility alias and exposes the same twenty-tool server.

## Naming and availability

- Raw tool names use the `lumenclip_` prefix.
- Direct X-, Threads-, LinkedIn-, provider-, model-, and video-generator tools
  are intentionally not defined. Stable workflows use the common
  `Automation`, `Output`, and `Operation` objects.
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
- `docs/workflows/mcp/` contains outcome-oriented agent workflows. It does not
  replace the tool contract reference in this folder.

The architectural source remains
[docs/roadmap/lumenclip-mcp-server.md](../docs/roadmap/lumenclip-mcp-server.md).
