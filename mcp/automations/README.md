# Automation MCP tools

> Discovery, templates, creation/deletion, complete schema reads/replacement,
> granular formatting and hook management, run-plan inspection, safe updates,
> and manual runs are implemented. Diff preview remains proposed.

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

Output: `automation` containing the complete normalized editor `schema`,
normalized schedule, publishing policy, linked
collections, safe linked-account summaries, last-run state, manual-run support,
the canonical `hookPool`, and resource URI. The hook pool includes its enabled
state and duplicate analysis; provider tokens, owner IDs, and raw Appwrite rows
are not returned. X/Threads records expose their full safe `configuration`
(brief, excluded topics, proof bank, output/generation/media/discovery policy,
benchmarks, schedule, usage, and operations).

### `lumenclip_automation_templates_list`

Read-only template discovery with optional `query`, `kind`, `includeSchema`,
and `limit`. Each result includes its kind, curated hook count, timestamps, and
optionally its complete normalized runtime schema.

### `lumenclip_automation_create`

Creates a paused or live slideshow/video/UGC automation, optionally cloned from
`templateId`. Required `requestId` is persisted as the retry key, so repeating
the call returns the same record. `name` is required and an optional `kind`
must agree with the selected template.

### `lumenclip_automation_schema_update`

Complete schema replacement with required `automationId`,
`expectedUpdatedAt`, and normalized `schema`. Callers must read
`automation_get` first and preserve desired fields. The backend normalizes the
replacement before persistence.

Prefer the two patch tools below for formatting changes. They mutate one
addressable object and do not normalize or rewrite unrelated schema fields.

### `lumenclip_automation_formatting_update`

Patches exactly one stable formatting block (`hook`, `body`, or `cta`) with a
required optimistic-lock `expectedUpdatedAt`. Omitted fields remain unchanged.
The patch supports:

- slide count, mode, minimum, and maximum (`dynamic` is accepted as an alias
  for the stored `varying` mode);
- aspect ratio, image grid/mode, text visibility, overlay, and AI image
  selection;
- CTA position and overlay-image configuration; and
- complete replacement of that block's functional `slideOverrides` or
  `imageOverrides` array.

`slideOverrides` changes the first text item's content direction on an indexed
slide. `imageOverrides` changes that indexed slide's collection. Both are
consumed by local and scheduled cloud generation; they are not vestigial.

### `lumenclip_automation_text_item_update`

Patches one existing `textItemId` inside one stable formatting block, also with
required `expectedUpdatedAt`. It supports font/style/placement/width/alignment,
anchors, word-length bounds, content direction, text mode, and static text.
The tool returns the updated item. Text-item create/delete is intentionally not
exposed: no current generation case requires it, while changing renderer item
cardinality has a wider compatibility surface.

### `lumenclip_automation_hooks_get`

Read-only and idempotent.

Input: required `automationId`.

Output: the authoritative `hooks` array plus `total`, enabled/disabled counts,
`uniqueSuggested`, `duplicateSlotCount`, and exact or near
`duplicateGroups`. Each group includes its similarity score, hook IDs and
texts, and a suggested hook to keep. Agents no longer need to inspect a past
slideshow's rendered prompt to recover an automation's hook pool.

### `lumenclip_automation_hooks_update`

Destructive replacement mutation because omitted hooks are pruned.

Input: required `automationId` and the complete desired `hooks` array; optional
`expectedUpdatedAt` optimistic lock and `deduplicateNearMatches`. Existing IDs
should be preserved when editing or toggling hooks. New hooks may omit `id`.
When near-match deduplication is enabled, the first hook in each detected group
is kept.

Output: the updated canonical pool and a fresh duplicate analysis. This surface
supports adding, editing, enabling, disabling, pruning, and deduplicating hooks
without changing the rest of the automation schema.

`automation_hooks_update` and `automation_hook_upsert` validate every submitted
`[[TOKEN]]` against owner variable collections and runtime variables before
writing. Unknown and legacy single-bracket placeholders are rejected with a
close-match suggestion when available. A free `[[NUMBER]]` draw is accepted
with a warning recommending `[[SLIDE_COUNT]]` when the hook's promised count
must equal the generated body count.

Prefer the granular tools when full replacement is unnecessary:

- `lumenclip_automation_hook_upsert` adds or edits hooks by stable ID.
- `lumenclip_automation_hook_set_enabled` toggles hooks without deleting them.
- `lumenclip_automation_hook_delete` permanently prunes confirmed hook IDs
  while historical run plans retain attribution.

### Hook attribution and run plans

`lumenclip_hook_performance(automationId, days)` joins confirmed publications
to stable hook IDs. Every canonical hook receives publish count, views, shares,
saves, share rate, and mean slide-1-to-2 retention when Studio captured it;
historically published deleted hooks remain visible.

`lumenclip_run_plan_get(runId)` returns the persisted generation decision:
hook ID/template/substitutions, media selections, complete slides, strategy,
and reuse warnings. Debug prompt payloads are omitted unless
`includeDebug: true`.

### Hook variables and slide-count behavior

`[[SLIDE_COUNT]]` is a runtime variable resolved from the body count selected
for that run. It has no backing word collection. Body blocks persist
`slideCountMode: "varying"` plus `slideCountMin`/`slideCountMax`; the MCP
formatting patch also accepts the clearer input alias `"dynamic"`.

Repeated uses of one variable in a hook are distinct by default. The normalized
schema exposes `distinct_variable_draws: true`; for example,
`[[ZODIAC]] versus [[ZODIAC]]` cannot resolve both positions to the same sign.
The older `hook_no_duplicate_slots` field remains a compatibility alias.

The canonical hook source is `schema.hooks[]`. `prompt_formatting.narrative` is
generation guidance only and is never silently promoted into the pool. Use the
granular hook tools to promote a narrative phrase into an enabled hook.

`automation.status` is the lifecycle state. `schema.schedule.paused` is its
scheduler gate, while `posting_mode` controls what happens after generation
(`manual`, `review`, or `auto`). The top-level `schedule` returned by
`automation_get` is a camelCase view derived from `schema.schedule`, not a
second persisted schedule.

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

### `lumenclip_automation_create_from_template` (superseded)

Mutation, scope `lumenclip:write`.

Input: required `template_id`, `template_version`, `name`, `overrides`, and
`idempotency_key`; optional approved `preview_id`.

Output: paused user-owned `automation`, `version`, `source_template`,
`resource_uri`, `applied_overrides`, and `warnings`.

### `lumenclip_automation_save` (superseded)

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
ID, name, kind, status, `updatedAt`, and schedule. Generation configuration is
changed through `lumenclip_automation_schema_update`; common
lifecycle/schedule changes remain on this smaller tool.

### `lumenclip_automation_delete`

Permanent, explicitly confirmed deletion for standard automations. Required
`requestId` and `confirmDelete: true`; the cascade removes generated
slideshows, run history, queue jobs, and draft publication rows. Repeating an
already-completed delete returns `alreadyDeleted: true`.

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
