# Shared MCP contracts

This file owns cross-cutting wire shapes used by more than one category.
Start with the app use-case map in [README.md](README.md) or the exhaustive
[tool ownership index](tool-index.md); category references link here instead of
redefining pagination, operation, resource, and error shapes incompatibly.

> Implementation note: the callable 1.2 server uses camelCase field names and
> bounded list responses (`items`, `total`, `hasMore`). The deployed HTTP route
> is currently public and owner-scoped by `LUMENCLIP_MCP_OWNER_ID` or
> `LUMENCLIP_SYSTEM_OWNER_ID`; OAuth scopes, cursor pagination, durable generic
> operations, and full MCP resources are planned. The exact current wire shapes
> are documented on each use-case page; the broader contracts below remain the
> target where a category page does not explicitly mark a tool implemented.

## Conventions

### Pagination input

List tools accept `cursor?: string | null` and `limit?: integer` (`1..100`,
default `20`). A list result returns `items`, `next_cursor`, and `has_more`.

### Common mutation fields

All mutation and billable-generation tools accept:

| Field             | Type   | Required | Meaning                                                                                                                               |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `idempotency_key` | string | yes      | Stable caller key. Reuse with identical input returns the original result; reuse with different input returns `IDEMPOTENCY_CONFLICT`. |
| `workspace_id`    | string | no       | Explicit workspace when the principal has access to more than one; otherwise the current workspace is used.                           |

### Common object summary

Public objects use `id`, `created_at`, `updated_at`, and `resource_uri`.
`owner_id`, credentials, internal table names, provider payloads, and storage
identifiers are omitted.

## Discovery and inspection

### `lumenclip_workspace_get`

Read-only and idempotent. Scope: `lumenclip:read`.

Input: `{}` or `{ "workspace_id": "ws_123" }`.

Output:

```json
{
  "workspace": {
    "id": "ws_123",
    "name": "Studio",
    "timezone": "Asia/Singapore",
    "locale": "en-SG",
    "defaults": { "language": "en", "aspect_ratio": "9:16" },
    "limits": { "concurrent_generations": 3 },
    "capabilities": {
      "slideshow_generation": true,
      "video_automation": true,
      "publishing": ["x", "threads", "tiktok"],
      "analytics_reports": false
    },
    "resource_uri": "lumenclip://workspace/current"
  }
}
```

### `lumenclip_templates_list`

Read-only and idempotent. Scope: `lumenclip:read`.

Input fields:

| Field             | Type                           | Required | Description                                   |
| ----------------- | ------------------------------ | -------- | --------------------------------------------- |
| `query`           | string                         | no       | Name, tag, niche, or capability search.       |
| `automation_kind` | `slideshow \| video \| social` | no       | Restrict the template family.                 |
| `platform`        | string                         | no       | For example `tiktok`, `x`, or `threads`.      |
| `format`          | string                         | no       | Output format or aspect ratio such as `9:16`. |
| `tags`            | string[]                       | no       | All requested tags must match.                |
| `capabilities`    | string[]                       | no       | Required workspace/template capabilities.     |
| `cursor`, `limit` | pagination                     | no       | Cursor pagination.                            |

Output: paginated `items`, each containing `id`, `name`, `automation_kind`,
`output_types`, `platforms`, `tags`, `version`, `required_capabilities`,
`resource_uri`, and `examples_resource_uri`.

### `lumenclip_template_get`

Read-only and idempotent. Scope: `lumenclip:read`.

Input: `template_id` (required string) and optional `version`. Output:

```json
{
  "template": {
    "id": "astro-editorial",
    "version": "3",
    "name": "Astrology Editorial",
    "automation_kind": "slideshow",
    "configuration": {},
    "required_capabilities": ["slideshow_generation"],
    "allowed_overrides_schema": {},
    "resource_uri": "lumenclip://templates/astro-editorial",
    "examples_resource_uri": "lumenclip://templates/astro-editorial/examples"
  }
}
```

Errors: `NOT_FOUND`, `TEMPLATE_VERSION_UNAVAILABLE`.

### `lumenclip_automations_list`

Read-only and idempotent. Scope: `lumenclip:read`.

Input: optional `query`, `automation_kind`, `status`, `platform`,
`collection_id`, `cursor`, and `limit`.

Output: paginated summaries with `id`, `name`, `automation_kind`, `status`,
`platforms`, `collection_ids`, `last_run`, `version`, and `resource_uri`.

### `lumenclip_automation_get`

Read-only and idempotent. Scope: `lumenclip:read`.

Input: `{ "automation_id": "auto_123" }`.

Output: `automation` containing the complete normalized editor `schema`,
`schedule`, `publishing_policy`, `linked_collections`, safe `linked_accounts`,
canonical `hookPool`, `last_run`, and `resource_uri`. Returns `NOT_FOUND` for
inaccessible IDs. X/Threads automations instead include their safe complete
policy `configuration`.

Complete standard schemas are replaced with
`lumenclip_automation_schema_update` using optimistic `expectedUpdatedAt`;
granular lifecycle/schedule changes remain on `automation_update`.

### `lumenclip_collections_list`

Read-only and idempotent. Scope: `lumenclip:read`.

Input: optional `query`, `media_type` (`image`, `video`, `word`, `product`),
`tags`, `minimum_item_count`, `compatible_automation_kind`, `cursor`, `limit`.

Output: paginated summaries with `id`, `name`, `media_type`, `item_count`,
`tags`, `caption_coverage`, `version`, and `resource_uri`.

`lumenclip_product_collection_get` returns all typed product items for one
collection. `lumenclip_assets_list` discovers uploaded/generated AssetRecords
and library music/avatar/demo/greenscreen/CTA entries.

### `lumenclip_variable_get`

Read-only and idempotent. Scope: `lumenclip:read`.

Input: required `variableId`, accepting a stable variable ID or exact name.

Output: `variable` with CRUD `id`, expansion `variableName`, exact `token`,
display `name`, optional `description`, complete `values[]`, `valueCount`,
`source`, timestamps, and `resourceUri`.

### `lumenclip_variable_save`

Scope: `lumenclip:write`.

Input: optional `variableId` for update; optional `name`, `description`,
complete replacement `values[]`, and `source`; required `requestId`. `name` is
required when creating. Omitted fields are preserved for updates.

Output: `requestId`, `created`, and the complete saved `variable`. Values are
trimmed and deduplicated case-insensitively by the backend.

### `lumenclip_variable_delete`

Destructive, non-idempotent mutation. Scope: `lumenclip:write`.

Input: required `variableId`, `requestId`, and literal `confirmDelete: true`.
Output: `deleted: true` and the deleted variable snapshot. The delete is
permanent and may invalidate automation hook-variable references.

### `lumenclip_outputs_list`

Read-only and idempotent. Scope: `lumenclip:read`.

Input: optional `automation_id`, `output_type`, `status`, `publication_state`,
`platform`, `account_id`, `created_from`, `created_to`, `cursor`, `limit`.

Output: paginated output summaries containing `id`, `output_type`,
`automation_id`, `status`, `publication_state`, `platforms`, `preview_uri`,
`created_at`, `resource_uri`, and `analytics`. The analytics summary states
whether metrics exist, aggregates the latest snapshot per publication, reports
followers gained, and names the appropriate detailed report tool.
`publication_state=published_unlinked` means the output carries a manual
published timestamp without a canonical publication record.

### `lumenclip_operations_list`

Read-only and idempotent. Input accepts optional `status`, exact `type`, and
`limit`. Output combines queue jobs and standard/social/video generation runs;
queue rows retain attempts, payload/result, timestamps, and errors.

### `lumenclip_accounts_list`

Read-only, idempotent, and open-world. Scope: `lumenclip:read`.

Input: optional `provider`, `platform`, `connected_only` (default `true`),
`cursor`, and `limit`.

Output: paginated safe account metadata: `id`, `provider`, `platform`,
`display_name`, `profile`, `connected`, and `capabilities` such as
`publish_single`, `publish_gallery`, `publish_video`, `schedule`, and
`reply_chain`. Tokens are never returned.

`lumenclip_workspace_members_list` returns safe pending/accepted membership
metadata only; team credentials are excluded.

### `lumenclip_operation_get`

Read-only and idempotent. Scope: `lumenclip:read`.

Input: `{ "operation_id": "op_123" }`.

Output:

```json
{
  "operation": {
    "id": "op_123",
    "kind": "slideshow.generate",
    "status": "running",
    "progress": 45,
    "stage": "rendering",
    "warnings": [],
    "estimated_credits": 4,
    "actual_credits": null,
    "next_poll_after_ms": 5000,
    "created_at": "2026-07-16T10:00:00.000Z",
    "updated_at": "2026-07-16T10:00:05.000Z",
    "resource_uri": "lumenclip://operations/op_123"
  },
  "outputs": [],
  "errors": []
}
```

Terminal success includes output resource URIs. Terminal failure includes a
stable error object. This lightweight tool never returns media or full logs.

## Automation configuration

### `lumenclip_automation_preview`

Read-only, idempotent, and free of generation charges. Scope:
`lumenclip:read`.

Input accepts exactly one source:

- `source.template_id`, optional `source.template_version`, plus `overrides`;
- `source.brief` containing a normalized automation brief; or
- `source.automation_id`, `source.expected_version`, `update_mask`, and `patch`.

Output: `valid`, `preview_id`, `base_version`, field-level `diff`,
`effective_automation`, `validation_issues`, and `warnings`. No state is saved.

### `lumenclip_automation_create_from_template`

Scope: `lumenclip:write`. Creates a paused, user-owned copy; never edits the
catalog template.

Input: required `template_id`, `template_version`, `name`, `overrides`, and
`idempotency_key`; optional approved `preview_id`.

Output: `automation` with `id`, `status: "paused"`, `version`,
`source_template`, and `resource_uri`, plus `applied_overrides` and `warnings`.

### `lumenclip_automation_save`

Scope: `lumenclip:write`.

Input: required normalized `brief`, `name`, and `idempotency_key`; optional
`preview_id`. The brief contains `automation_kind`, niche/topic, audience,
platforms, output settings, hooks, section directions, collection IDs, media
policy, schedule, and publishing policy where supported.

Output: a paused `automation`, its `version`, `resource_uri`, applied defaults,
and `warnings`.

### `lumenclip_automation_update`

Implemented safe subset. Granular `lumenclip:write` scope enforcement remains
planned; the current transport runs as the configured MCP/system owner.

Current input: required `automationId`; optional `expectedUpdatedAt`,
`action: pause | resume`, `name`, `favorite`, and a schedule patch containing
timezone, posting rows, or jitter. At least one change is required.

Current output: normalized safe automation metadata and schedule. Omitted
fields are preserved. A mismatched `expectedUpdatedAt` rejects stale writes.
The broader preview/update-mask/idempotency contract remains the target for
arbitrary configuration edits.

## Collections and assets

### `lumenclip_collection_save`

Scope: `lumenclip:write`.

Input: optional `collection_id` for update; required `name`, `media_type`, and
`idempotency_key`; optional `description`, `tags`, and `expected_version`.
Omitted assets are never deleted.

Output: `collection` with `id`, metadata, `item_count`, `version`, and
`resource_uri`, plus `created` and `warnings`.

### `lumenclip_collection_add_assets`

Scope: `lumenclip:write` in version one; intended to move to
`lumenclip:import`.

Input: required `collection_id`, `assets[]`, and `idempotency_key`; optional
`expected_version`, `generate_captions`, and `deduplicate` (default `true`).
Each asset contains exactly one of `resource_uri`, `output_uri`, `upload_uri`,
or validated `https_url`, plus optional caption and attribution.

Output: for small synchronous imports, updated `collection`, `added`,
`duplicates`, and per-item `failures`. Larger or AI-captioned imports return the
standard operation envelope.

### `lumenclip_collection_delete`

Input: required `collectionId`, `requestId`, and literal
`confirmDelete: true`; optional `allowReferenced` defaults to `false`. Output:
soft-deleted collection ID, the 30-day deletion window, idempotency state, and
affected automation dependencies.

### `lumenclip_output_delete`

Input: required `outputId`, `requestId`, and literal `confirmDelete: true`.
Output: deleted output ID/type and `recoverable: false`. Running, scheduled, or
published outputs are rejected without mutation.

### Deferred collection tools

`lumenclip_external_assets_search` input: required approved `provider` and
`query`; optional media type, orientation, count, cursor, and provider-safe
filters. Output: previews with source URL, preview URL, dimensions, MIME,
license metadata, provider caption, and a short-lived `selection_token`.

`lumenclip_collection_merge_preview` input: source/destination IDs and expected
versions. Output: `preview_id`, duplicates, caption conflicts, attribution,
dependencies, and final counts; it performs no mutation.

`lumenclip_collection_merge` input: approved `preview_id`, expected versions,
`delete_source` (default `false`), `confirm_merge`, and `idempotency_key`.
Output: operation or merged collection, counts, retained conflicts, and source
state.

## Generation and publication

### `lumenclip_automation_run`

Billable. Scope: `lumenclip:generate`.

Input: required `automation_id` and `idempotency_key`; optional `topic`,
`source_output_uri`, `count` (default `1`), and supported per-run overrides.

Output: standard operation envelope with kind `automation.run`. The resulting
draft is always unscheduled and `not_published`, even when the automation is
live.

### `lumenclip_output_publish`

External side effect. Scope: `lumenclip:publish`.

Input fields:

| Field             | Type           | Required | Description                                                                               |
| ----------------- | -------------- | -------- | ----------------------------------------------------------------------------------------- |
| `output_id`       | string         | yes      | Ready, caller-owned output.                                                               |
| `targets`         | object[]       | yes      | Each target has `account_id`, `mode: now \| schedule`, and `scheduled_at` when scheduled. |
| `caption`         | string         | no       | Explicit approved caption override.                                                       |
| `confirm_publish` | literal `true` | yes      | Mandatory confirmation.                                                                   |
| `idempotency_key` | string         | yes      | Duplicate-publish protection.                                                             |

Output: publish operation envelope, resolved safe target names, and warnings.
Success produces provider post IDs and public URLs on the operation/output
resource. Errors include `OUTPUT_NOT_READY` and
`PUBLISH_CONFIRMATION_REQUIRED`.

### `lumenclip_output_mark_published`

Does not send content to a provider. Scope: `lumenclip:publish`. Idempotent.

Input: required `output_id`, `platform`, `published_url`, `published_at`, and
`idempotency_key`; optional `provider_post_id` and `account_id`.

Output: updated output publication evidence with `publication_state:
"published"`, normalized URL, provider ID, timestamp, and resource URI.

## Standard asynchronous output

```json
{
  "operation": {
    "id": "op_01J...",
    "kind": "automation.run",
    "status": "queued",
    "progress": 0,
    "created_at": "2026-07-16T10:00:00.000Z",
    "next_poll_after_ms": 5000,
    "resource_uri": "lumenclip://operations/op_01J..."
  },
  "outputs": [],
  "warnings": []
}
```

## Standard error output

```json
{
  "error": {
    "code": "COLLECTION_TOO_SMALL",
    "message": "The selected collection has 4 usable images; this template requires 7.",
    "retryable": false,
    "details": { "collection_id": "col_123", "required": 7, "usable": 4 }
  }
}
```

Stable codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`,
`INVALID_RESOURCE_URI`, `UNSUPPORTED_CAPABILITY`, `QUOTA_EXCEEDED`,
`RATE_LIMITED`, `CONCURRENCY_LIMIT`, `COLLECTION_EMPTY`,
`COLLECTION_TOO_SMALL`, `MEDIA_UNAVAILABLE`, `OUTPUT_NOT_READY`,
`PUBLISH_CONFIRMATION_REQUIRED`, `IDEMPOTENCY_CONFLICT`,
`PROVIDER_UNAVAILABLE`, `OPERATION_FAILED`, `TEMPLATE_VERSION_UNAVAILABLE`,
`OVERRIDE_NOT_ALLOWED`, and `VERSION_CONFLICT`.
