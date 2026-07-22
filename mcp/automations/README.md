# Automation MCP tools

> Discovery, detail reads, safe updates, and manual runs are implemented.
> Preview and create/save contracts remain proposed.

These tools correspond to the Automations area in the app. They use one
normalized automation contract across slideshows, videos, AI UGC, X, Threads, and other
supported social formats. Manual runs create drafts; scheduling and publishing
remain separate concerns.

## Discovery

### `lumenclip_automations_list`

Read-only, idempotent, scope `lumenclip:read`.

Current input: optional `query`, `kind` (`slideshow`, `video`, `ugc`, `x`, or
`threads`), `status`, and `limit` (`1..100`, default `20`).

Output: summaries with `id`, `name`, `kind`, `status`, `platforms`,
`collectionIds`, `manualRunSupported`, `lastRun`, and `resourceUri`, plus
`total` and `hasMore`.

### `lumenclip_automation_get`

Read-only, idempotent, scope `lumenclip:read`.

Input: required `automationId`.

Output: `automation` containing normalized schedule, publishing policy, linked
collections, safe linked-account summaries, last-run state, manual-run support,
and resource URI. Prompt bodies, provider tokens, owner IDs, and raw Appwrite
rows are not returned.

## Preview and save

### `lumenclip_automation_preview`

Read-only, idempotent, and free of generation charges. Scope
`lumenclip:read`.

Input accepts exactly one source:

- `source.template_id` plus optional `source.template_version` and `overrides`;
- `source.brief` containing a normalized automation brief; or
- `source.automation_id`, `source.expected_version`, `update_mask`, and `patch`.

Output: `valid`, `preview_id`, `base_version`, field-level `diff`,
`effective_automation`, `validation_issues`, and `warnings`. It saves nothing.

### `lumenclip_automation_create_from_template`

Mutation, scope `lumenclip:write`.

Input: required `template_id`, `template_version`, `name`, `overrides`, and
`idempotency_key`; optional approved `preview_id`.

Output: paused user-owned `automation`, `version`, `source_template`,
`resource_uri`, `applied_overrides`, and `warnings`.

### `lumenclip_automation_save`

Mutation, scope `lumenclip:write`.

Input: required normalized `brief`, `name`, and `idempotency_key`; optional
approved `preview_id`. The brief may include niche/topic, audience, platforms,
output settings, hooks, section directions, collection IDs, media policy,
schedule, and publishing policy.

Output: paused automation, resolved defaults, version, resource URI, and
warnings.

### `lumenclip_automation_update`

Implemented mutation. It supports slideshow, video, AI UGC, X, and Threads automations.
The current session/owner boundary supplies authorization; granular
`lumenclip:write` scopes remain planned.

Input:

| Field                    | Type              | Required | Description                                                                        |
| ------------------------ | ----------------- | -------- | ---------------------------------------------------------------------------------- |
| `automationId`           | string            | yes      | Caller-owned automation ID.                                                        |
| `expectedUpdatedAt`      | ISO-8601 datetime | no       | Rejects the update if the saved record changed.                                    |
| `action`                 | `pause \| resume` | no       | Stops or restarts scheduled runs and keeps lifecycle/schedule pause state aligned. |
| `name`                   | string            | no       | New automation name.                                                               |
| `favorite`               | boolean           | no       | Supported for slideshow/video/UGC automations; X/Threads reject it.                |
| `schedule.timezone`      | IANA timezone     | no       | New timezone.                                                                      |
| `schedule.postingTimes`  | object[]          | no       | One or more `{time, days, enabled?}` rows.                                         |
| `schedule.jitterMinutes` | integer           | no       | Random schedule offset from 0 to 720 minutes.                                      |

At least one change is required. The output is a normalized safe summary with
ID, name, kind, status, `updatedAt`, and schedule. Generation prompts,
collections, publishing accounts, and raw internal schemas are intentionally
not accepted by this first update surface.

## `lumenclip_automation_run`

Implemented and billable. Slideshow and social runs return a terminal operation
today. UGC runs enqueue asynchronously and return a queue operation immediately;
poll it with `lumenclip_operation_get`.

### Input

| Field          | Type   | Required | Description                                                            |
| -------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `automationId` | string | yes      | Caller-owned automation to run.                                        |
| `topic`        | string | no       | Per-run topic for X or Threads.                                        |
| `requestId`    | string | yes      | Retry key. Reuse returns the existing run instead of generating twice. |

### Output

Returns an operation plus output resource links. Successful outputs are always
`not_published` and unscheduled, even when the saved automation is live.

Generation preconditions such as `no_images` are structured non-error tool
results: the operation has `status: "failed"`, `stage: "precondition"`, no
outputs, a `skipped` entry, and a stable error such as `COLLECTION_EMPTY`. This
matches `lumenclip_slideshow_generate`, which also reports `no_images` in
`skipped` without setting MCP `isError`.

Saved slideshow, AI UGC, X, and Threads automations support manual runs. AI UGC
runs are always queued with `draftOnly: true`, so a live automation's saved
auto-publish configuration cannot bypass explicit MCP publication confirmation.
Saved non-UGC video
automations are visible and editable, but the app does not yet have a
server-side video-automation runner, so this tool returns an explicit
unsupported-capability error for them. LinkedIn generation is currently
stateless in the app and is not represented as a saved automation ID.
