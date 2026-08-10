# Template MCP tools

> Discovery, templates, creation/deletion, patch-or-replace schema writes with
> returned diffs, granular formatting and hook management, run-plan inspection,
> safe updates, and manual runs are implemented.

These tools correspond to the Templates area in the app. They use one
normalized template contract across slideshows, videos, AI UGC, X, Threads, and other
supported social formats. Manual runs create drafts; scheduling and publishing
remain separate concerns.

## Discovery

### `lumenclip_templates_list`

Read-only, idempotent, scope `lumenclip:read`.

Current input: optional `query`, `kind` (`slideshow`, `video`, `ugc`, `x`, or
`threads`), `status`, `visibility` (`active`, `hidden`, or `all`; default
`active`), and `limit` (`1..100`, default `20`). Built-in starters use the same
template record and appear under `visibility: "hidden"` by default.

Output: summaries with `id`, `name`, `hidden`, `kind`, `status`, `platforms`,
`collectionIds`, `manualRunSupported`, `lastRun`, and `resourceUri`, plus
`total` and `hasMore`.

### `lumenclip_template_get`

Read-only, idempotent, scope `lumenclip:read`.

Input: required `templateId`.

Output: `template` containing the complete normalized editor `schema`,
normalized schedule, publishing policy, linked
collections, safe linked-account summaries, last-run state, manual-run support,
the canonical `hookPool`, and resource URI. The hook pool includes its enabled
state and duplicate analysis; provider tokens, owner IDs, and raw Appwrite rows
are not returned. X/Threads records expose their full safe `configuration`
(brief, excluded topics, proof bank, output/generation/media/discovery policy,
benchmarks, schedule, usage, and operations).

The result also includes `configurationWarnings` and machine-readable
`nextSteps` when a legacy hook catalog is duplicated in
`prompt_formatting.narrative` or the hook text item's `contentDirection`, when
explicit variable overrides are no longer used, when paragraph-length body
copy has collapsed into a heading while its paragraph layer is inert, or when
structural style contains voice rules owned by tone. Each repair step contains
resolved tool arguments and can be applied without reconstructing the schema.
Media collection references are resolved on read, including per-slide image
overrides, overlay collections, and video-segment collections. Missing IDs are
returned in `unresolvedCollectionReferences` with a required `nextSteps` entry
that blocks `lumenclip_template_run` until replacements are selected.

### `lumenclip_template_create`

Creates a paused or live slideshow/video/UGC template, optionally copied from
any active or hidden `templateId`. Required `requestId` is persisted as the retry key, so repeating
the call returns the same record. `name` is required and an optional `kind`
must agree with the selected template.
When the caller already owns templates, the result recommends
`lumenclip_template_clone` with a recent source template and resolved
arguments so callers do not accidentally rebuild a complete schema by hand.

### `lumenclip_template_schema_update`

Patch-or-replace schema mutation with required `templateId`,
`expectedUpdatedAt`, and normalized `schema`. `mode: "patch"` is the default:
nested objects merge, supplied arrays replace only their array field, and
omitted fields remain unchanged. `mode: "replace"` is explicit full
replacement. The result returns `schemaDiff.added`, `schemaDiff.changed`, and
`schemaDiff.removed` entries with dotted paths and before/after values.

Prefer the two patch tools below for formatting changes. They mutate one
addressable object and do not normalize or rewrite unrelated schema fields.

`tone.value` owns voice: register, diction, sentence rhythm, and casing.
`prompt_formatting.style` owns structure and format: heading shape, paragraph
organization, ordering, and other content-layout rules. Generation labels the
style block as structural and explicitly prevents it from overriding tone.
`template_get` validates that boundary and returns
`STYLE_CONTAINS_VOICE_RULES` plus a patch-ready repair when voice rules leak
into `style`.

Prompt-mode captions use `tiktok_post_settings.caption.resolution`. `"hook"`
means the exact resolved hook is the canonical caption; `"generated"` lets the
model write one. Legacy prose asking for the first text item is normalized to
`resolution: "hook"` and removed, so the metadata schema, prompt, and
deterministic resolution no longer give conflicting instructions.

### `lumenclip_template_slide_design_update`

Patches exactly one stable slide design selected by `designId`, with a required
optimistic-lock `expectedUpdatedAt`. Omitted fields and every other design stay
unchanged. The patch supports:

- display name and text-agent instructions;
- image collection, aspect ratio, image grid/mode, text visibility, overlay,
  and AI image selection;
- overlay-image configuration; and
- an optional visual preset ID.

### `lumenclip_template_slide_text_item_update`

Patches one existing `textItemId` inside one `designId`, also with required
`expectedUpdatedAt`. It supports font/style/placement/width/alignment,
anchors, word-length bounds, content direction, text mode, and static text.
The tool returns the updated item. Text-item create/delete is intentionally not
exposed: no current generation case requires it, while changing renderer item
cardinality has a wider compatibility surface.

### `lumenclip_template_hooks_get`

Read-only and idempotent.

Input: required `templateId`.

Output: the authoritative `hooks` array plus `total`, enabled/disabled counts,
`uniqueSuggested`, `duplicateSlotCount`, and exact or near
`duplicateGroups`. Each group includes its similarity score, hook IDs and
texts, and a suggested hook to keep. Agents no longer need to inspect a past
slideshow's rendered prompt to recover an template's hook pool.

### `lumenclip_template_hooks_update`

Destructive replacement mutation because omitted hooks are pruned.

Input: required `templateId` and the complete desired `hooks` array; optional
`expectedUpdatedAt` optimistic lock and `deduplicateNearMatches`. Existing IDs
should be preserved when editing or toggling hooks. New hooks may omit `id`.
When near-match deduplication is enabled, the first hook in each detected group
is kept.

Output: the updated canonical pool and a fresh duplicate analysis. This surface
supports adding, editing, enabling, disabling, pruning, and deduplicating hooks
without changing the rest of the template schema.

`template_hooks_update` and `template_hook_upsert` validate every enabled
`[[TOKEN]]` against owner variable collections and runtime variables before
writing. Unknown and legacy single-bracket placeholders are rejected with a
close-match suggestion when available. A free `[[NUMBER]]` draw is accepted
with a warning that it is unrelated to the template's fixed slide count.
Hooks using `[[SLIDE_COUNT]]` or `bodySlideCount` cannot be added or enabled.
Published historical hooks may remain disabled for attribution.

Prefer the granular tools when full replacement is unnecessary:

- `lumenclip_template_hook_upsert` adds or edits hooks by stable ID.
- `lumenclip_template_hook_set_enabled` toggles hooks without deleting them.
- `lumenclip_template_hook_delete` permanently prunes confirmed hook IDs
  while historical run plans retain attribution.

### Hook attribution and run plans

`lumenclip_hook_performance(templateId, days)` joins confirmed publications
to stable hook IDs. Every canonical hook receives publish count, views, shares,
saves, share rate, and mean slide-1-to-2 retention when Studio captured it;
historically published deleted hooks remain visible with
`historicalOnly: true` instead of becoming unattributed.

Template reads also return `variableBindings`. Enabled hook tokens are
resolved automatically against collection `variableName`; explicit persisted
`hook_slots` are overrides only. In `lumenclip_template_get`,
`schema.hook_slots` is the generated read-only map and
`schema.hook_slot_overrides` preserves the explicit stored values for
debugging. Registered date and zodiac runtime tokens appear as runtime bindings
and never require a collection. The dedicated
`lumenclip_template_variable_bindings_get` read tool returns both bindings for
enabled hook tokens and the full registered runtime-variable catalog.

`lumenclip_run_plan_get(runId)` returns the persisted generation decision:
hook ID/template/substitutions, media selections, complete slides, strategy,
and reuse warnings. Debug prompt payloads are omitted unless
`includeDebug: true`.

### Hook variables and slide-count behavior

Each slideshow template uses `prompt_formatting.num_of_slides` as its single
fixed count. The model may order and reuse slide designs, but cannot change the
count. `[[SLIDE_COUNT]]`, per-hook `bodySlideCount`, varying count modes, and
minimum/maximum ranges are no longer accepted for enabled hooks or generation.

Repeated uses of one variable in a hook are distinct by default. The normalized
schema exposes `distinct_variable_draws: true`; for example,
`[[ZODIAC]] versus [[ZODIAC]]` cannot resolve both positions to the same sign.
The older `hook_no_duplicate_slots` field remains a compatibility alias.

The canonical hook source is `schema.hooks[]`.
`prompt_formatting.narrative` is no longer a generation input. A hook text
item's `contentDirection` may still carry concise casing/length guidance, but
must not contain a second hook catalog. Hook mutations preserve real prose
guidance but clear a legacy multi-line narrative that merely duplicates the
hook catalog. Use the granular hook tools to promote a narrative phrase into
an enabled hook.

`template.status` is the lifecycle state. `schema.schedule.paused` is its
scheduler gate, while `posting_mode` controls what happens after generation
(`manual`, `review`, or `auto`). The top-level `schedule` returned by
`template_get` is a camelCase view derived from `schema.schedule`, not a
second persisted schedule.

## Update and delete

### `lumenclip_template_update`

Implemented mutation. It supports slideshow, video, AI UGC, X, and Threads templates.
The current session/owner boundary supplies authorization; granular
`lumenclip:write` scopes remain planned.

Input:

| Field                    | Type              | Required | Description                                                                        |
| ------------------------ | ----------------- | -------- | ---------------------------------------------------------------------------------- |
| `templateId`             | string            | yes      | Caller-owned template ID.                                                          |
| `expectedUpdatedAt`      | ISO-8601 datetime | no       | Rejects the update if the saved record changed.                                    |
| `action`                 | `pause \| resume` | no       | Stops or restarts scheduled runs and keeps lifecycle/schedule pause state aligned. |
| `name`                   | string            | no       | New template name.                                                                 |
| `favorite`               | boolean           | no       | Supported for slideshow/video/UGC templates; X/Threads reject it.                  |
| `hidden`                 | boolean           | no       | `true` moves the template to Hidden; `false` moves it to Active.                   |
| `schedule.timezone`      | IANA timezone     | no       | New timezone.                                                                      |
| `schedule.postingTimes`  | object[]          | no       | One or more `{time, days, enabled?}` rows.                                         |
| `schedule.jitterMinutes` | integer           | no       | Random schedule offset from 0 to 720 minutes.                                      |

At least one change is required. The output is a normalized safe summary with
ID, name, kind, status, `updatedAt`, and schedule. Generation configuration is
changed through `lumenclip_template_schema_update`; common
lifecycle/schedule changes remain on this smaller tool.

### `lumenclip_template_delete`

Permanent, explicitly confirmed deletion for standard templates. Required
`requestId` and `confirmDelete: true`; the cascade removes generated
slideshows, run history, queue jobs, and draft publication rows. Repeating an
already-completed delete returns `alreadyDeleted: true`.

## `lumenclip_template_run`

Implemented and billable. Slideshow and social runs return a terminal operation
today. UGC runs enqueue asynchronously and return a queue operation immediately;
poll it with `lumenclip_operation_get`.

### Input

| Field        | Type   | Required | Description                                                            |
| ------------ | ------ | -------- | ---------------------------------------------------------------------- |
| `templateId` | string | yes      | Caller-owned template to run.                                          |
| `topic`      | string | no       | Per-run topic for X or Threads.                                        |
| `requestId`  | string | yes      | Retry key. Reuse returns the existing run instead of generating twice. |

### Output

Returns an operation plus output resource links. Successful outputs are always
`not_published` and unscheduled, even when the saved template is live.
The operation exposes `qaValid`, `qaFindings`, `generationPasses`, and
machine-readable `nextSteps`. A QA failure produces a required regeneration
step that blocks `lumenclip_output_publish` unless the caller later supplies an
explicit reasoned QA override. Scheduled runs never auto-publish a QA-invalid
deck.

Configured word maxima get one model repair attempt. If the repaired response
still exceeds a maximum, the text is truncated to the configured cap and the
exact before/after value is reported as the `word_cap_fallback` generation
pass. Below-minimum text remains a visible QA finding.

Generation preconditions such as `no_images` are structured non-error tool
results: the operation has `status: "failed"`, `stage: "precondition"`, no
outputs, a `skipped` entry, and a stable error such as `COLLECTION_EMPTY`. This
matches `lumenclip_slideshow_generate`, which also reports `no_images` in
`skipped` without setting MCP `isError`.

Saved slideshow, AI UGC, X, and Threads templates support manual runs. AI UGC
runs are always queued with `draftOnly: true`, so a live template's saved
auto-publish configuration cannot bypass explicit MCP publication confirmation.
Saved non-UGC video
templates are visible and editable, but the app does not yet have a
server-side video-template runner, so this tool returns an explicit
unsupported-capability error for them. LinkedIn generation is currently
stateless in the app and is not represented as a saved template ID.
