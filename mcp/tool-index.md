# MCP tool ownership index

Each public tool has one primary use-case document. A tool may be referenced by
several workflows, but its input/output contract has one obvious owner.

| Tool                                             | Primary use case                                | Availability       |
| ------------------------------------------------ | ----------------------------------------------- | ------------------ |
| `lumenclip_workspace_get`                        | [Workspace](workspace/README.md)                | Proposed v1        |
| `lumenclip_templates_list`                       | [Templates](templates/README.md)                | Proposed v1        |
| `lumenclip_template_get`                         | [Templates](templates/README.md)                | Proposed v1        |
| `lumenclip_automations_list`                     | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_templates_list`            | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_create`                    | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_get`                       | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_schema_update`             | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_delete`                    | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_hooks_get`                 | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_hooks_update`              | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_hook_upsert`               | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_hook_set_enabled`          | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_hook_delete`               | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_hook_performance`                     | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_run_plan_get`                         | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_preview`                   | [Automations](automations/README.md)            | Proposed v1        |
| `lumenclip_automation_create_from_template`      | [Automations](automations/README.md)            | Proposed v1        |
| `lumenclip_automation_save`                      | [Automations](automations/README.md)            | Proposed v1        |
| `lumenclip_automation_update`                    | [Automations](automations/README.md)            | Implemented        |
| `lumenclip_automation_run`                       | [Automations](automations/README.md)            | Implemented        |
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
| `lumenclip_output_delete`                        | [Outputs and operations](outputs/README.md)     | Implemented        |
| `lumenclip_operations_list`                      | [Outputs and operations](outputs/README.md)     | Implemented        |
| `lumenclip_operation_get`                        | [Outputs and operations](outputs/README.md)     | Implemented        |
| `lumenclip_accounts_list`                        | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_workspace_members_list`               | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_output_publish`                       | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_output_mark_published`                | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_tiktok_import_start`                  | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_tiktok_import_preview`                | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_tiktok_publications_link`             | [Accounts and publishing](publishing/README.md) | Implemented        |
| `lumenclip_schedule_get`                         | [Scheduling](scheduling/README.md)              | Implemented        |
| `lumenclip_analytics_report`                     | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_tiktok_studio_analytics_import_start` | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_tiktok_studio_analytics_report`       | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_tiktok_studio_analytics_batch_start`  | [Analytics](analytics/README.md)                | Implemented        |
| `lumenclip_export_create`                        | [Exports](exports/README.md)                    | Deferred beyond v1 |

Video and social generation intentionally reuse the automation tools rather
than defining provider-specific MCP tools. Scheduling likewise reuses
automation configuration and publishing; see [Scheduling](scheduling/README.md).
