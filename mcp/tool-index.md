# MCP tool ownership index

Each public tool has one primary use-case document. A tool may be referenced by
several workflows, but its input/output contract has one obvious owner.

| Tool                                             | Primary use case                                | Availability       |
| ------------------------------------------------ | ----------------------------------------------- | ------------------ |
| `lumenclip_pipeline_catalog`                     | [Workflows](workflows/README.md)                | Implemented        |
| `lumenclip_pipeline_stage_run`                   | [Workflows](workflows/README.md)                | Implemented        |
| `lumenclip_pipeline_run`                         | [Workflows](workflows/README.md)                | Implemented        |
| `lumenclip_workspace_get`                        | [Workspace](workspace/README.md)                | Proposed v1        |
| `lumenclip_templates_list`                       | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_create`                      | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_clone`                       | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_get`                         | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_variable_bindings_get`       | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_experiment_dimensions`       | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_experiment_run`              | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_schema_update`               | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_slide_design_update`         | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_slide_text_item_update`      | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_delete`                      | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_hooks_get`                   | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_hooks_update`                | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_hook_upsert`                 | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_hook_set_enabled`            | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_hook_delete`                 | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_hook_variants_generate`               | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_hook_variant_select`                  | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_hook_performance`                     | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_run_plan_get`                         | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_update`                      | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_template_run`                         | [Templates](templates/README.md)                | Implemented        |
| `lumenclip_collections_list`                     | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_product_collection_get`               | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_assets_list`                          | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_variable_get`                         | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_variable_save`                        | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_variable_delete`                      | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_collection_save`                      | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_collection_add_assets`                | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_external_assets_search`               | [Collections](collections/README.md)            | Proposed, deferred |
| `lumenclip_collection_merge_preview`             | [Collections](collections/README.md)            | Proposed, deferred |
| `lumenclip_collection_merge`                     | [Collections](collections/README.md)            | Proposed, deferred |
| `lumenclip_collection_delete`                    | [Collections](collections/README.md)            | Implemented        |
| `lumenclip_slideshow_generate`                   | [Slideshows](slideshow/README.md)               | Implemented        |
| `lumenclip_ugc_estimate`                         | [Videos](videos/README.md)                      | Implemented        |
| `lumenclip_ugc_generate`                         | [Videos](videos/README.md)                      | Implemented        |
| `lumenclip_slideshow_create`                     | [Slideshows](slideshow/README.md)               | Proposed v1        |
| `lumenclip_outputs_list`                         | [Outputs and operations](outputs/README.md)     | Implemented        |
| `lumenclip_output_slide_text_update`             | [Outputs and operations](outputs/README.md)     | Implemented        |
| `lumenclip_output_delete`                        | [Outputs and operations](outputs/README.md)     | Implemented        |
| `lumenclip_operations_list`                      | [Outputs and operations](outputs/README.md)     | Implemented        |
| `lumenclip_operation_get`                        | [Outputs and operations](outputs/README.md)     | Implemented        |
| `lumenclip_accounts_list`                        | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_workspace_members_list`               | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_output_publish`                       | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_output_mark_published`                | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_analytics_report`                     | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_tiktok_studio_analytics_import_start` | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_tiktok_studio_analytics_report`       | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_tiktok_studio_analytics_batch_start`  | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_export_create`                        | [Exports](exports/README.md)                    | Deferred beyond v1 |

Video and social generation intentionally reuse the template tools rather
than defining provider-specific MCP tools. Scheduling likewise reuses
template configuration and publishing; see [Scheduling](scheduling/README.md).
