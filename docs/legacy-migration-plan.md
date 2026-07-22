# Legacy persisted-shape migration plan

Scope: `feat/integration`, Next.js 16 / Appwrite TablesDB database `cfarm`. This is an implementation plan only; no Appwrite state was inspected or changed. Therefore every population claim below is a code-derived expectation that the dry-run must measure in local and cloud.

## Decision summary

Use one migration command, proposed as `scripts/migrate-legacy-persisted-shapes.ts`, with independent `--store=automation_templates|automations|x_automations|x_automation_runs|results|image_collections|all` selectors. Migrate the two audit-blocking stores first (`automation_template`, `automations`). Treat X automation/run, result-index, and image-collection alias cleanup as discovered follow-up phases: they are genuine persisted-shape compatibility boundaries, but should not enlarge the first deployment's blast radius unless their measured populations are small and tests are complete.

Do not rename the physical tables or `source_key`s in this migration. The `data/.../*.json` arguments are logical route identifiers, not files: they resolve to TablesDB routes (`lib/appwrite-stores.ts:13-18,117-133`), and an unmapped route is a hard error (`lib/json-store.ts:237-252`). Renaming these identifiers would be a storage-layout migration, not removal of old payload shapes.

## Inventory and route map

| Boundary | Physical rows | Current behavior | Old persisted shape | Canonical target |
|---|---|---|---|---|
| Template DTO | `permanent_assets`, `source_key=automation_template`, public rows (`lib/appwrite-stores.ts:40-44`) | **Reads old, writes old.** Reads normalize the compact DTO (`lib/automation-templates.ts:151-160,553-593`); POST/import converts runtime schema back to it (`lib/automation-templates.ts:368-399`). | Top-level metadata plus `template.created_at`, stringified `template.image_collection_ids`, `template.format.{hook,content,cta}` with snake-case section/text fields, `hooks`, `web_search_enabled`, `video_format` (`lib/automation-templates.ts:42-119`). | Same top-level metadata plus `schema`, stored in the runtime field names described below. No `template` object. |
| Standard automation summary aliases | `automations`, owner-scoped (`lib/appwrite-stores.ts:31-32,92-103`) | **Dual-write.** Top-level `name/status` are copied to nested `schema.title/status` on normalize and patch (`lib/automations.ts:169-192,329-380`); readers/runners consume both. Other top-level summaries are also duplicated/derived from schema. | `AutomationRecord` has `name,status,account,handle,times` beside schema title/status, integrations, and schedule (`lib/automations.ts:28-44`). | Top-level metadata remains authoritative: `name,status,favorite,theme`; delete nested `schema.title/status` and stored derived `account,handle,times`. Derive display summary from `schema.social_integrations` and `schema.schedule` (`lib/automations.ts:265-287,383-400`). |
| Standard automation schema fallbacks | Same `automations` rows | **Reads old, writes new when row is next saved.** `normalizeAutomationSchema` removes retired knowledge keys, converts schedule interval, `_tone`, narrative/formatting hooks, and other aliases/defaults (`lib/realfarm-automation.ts:634-735,1467-1505,1873-1886`). Normalized reads alone do not persist. | Possible `knowledge_context_enabled`, `knowledge_base_ids`, `schedule.interval`, formatting item `id="_tone"`, hook text only in `prompt_formatting.narrative`/formatting, and legacy snake-case override members. | Materialize the complete normalized schema, then remove the specifically detected retired keys and aliases. Preserve explicit empty hook catalogs (logic at `lib/realfarm-automation.ts:687-697`). This normalization is part of the `automations` row rewrite, not a second pass. |
| X/Threads automation normalization | `x_automations`, owner-scoped (`lib/appwrite-stores.ts:33,92-103`) | **Reads old, writes canonical on the next upsert.** Reads call the normalizer; upserts explicitly save its result (`lib/x-automation-store.ts:20-35,58-68`). | Niche brief in `niche.audience/promise/pillars/keywords/painPoints`; excluded topics in `niche`; prompt fragments and `voice` in `generation`; `output.platforms` instead of flags (`lib/x-automation.ts:495-559,804-829`). Because the result spreads `...value` (`lib/x-automation.ts:566-574`), old fields can survive beside new fields. | `brief`, root `excludedTopics`, `generation.voiceOverride`, and `output.platformFlags`; delete migrated niche brief/excluded fields, legacy prompt keys/`voice`, and `output.platforms`. |
| X run platform alias | `outputs`, `source_key=x_automation_run`, owner-scoped/shareable (`lib/appwrite-stores.ts:34-39`) | **Reads old; bulk run writes may rewrite canonical.** | `platforms[]` without scalar `platform`. | Scalar `platform`; delete `platforms` (`lib/x-automation-store.ts:149-184`). |
| Legacy slideshow result identity/index | `outputs`, `source_key=result`, owner-scoped/shareable (`lib/appwrite-stores.ts:50-55`) | **Reads both.** First queries denormalized `source_entity_id`; fallback queries result id equal to slideshow id (`lib/slideshows.ts:412-430`). | Result id doubles as slideshow id; `artifacts.slideshowId` and/or physical `source_entity_id` absent. Compatibility imports may also use `compat-automation-*` / `compat-run-*` (`lib/slideshows.ts:188-189,440-447`). | Every slideshow result has `artifacts.slideshowId`; physical `source_entity_id` is recomputed consistently from canonical data. Retain synthetic automation/run ids unless a trustworthy mapping exists; do not guess. |
| Image collection id aliases / positional row ids | `permanent_assets`, `source_key=image_collection`, owner-scoped (`lib/appwrite-stores.ts:21-25`) | **Reads old IDs and preserves old physical row IDs.** Alias generation accepts date-derived and path-derived IDs (`lib/realfarm-collections.ts:170-217,230-246`); writes reuse positional legacy row ids by name (`lib/json-store.ts:430-438`). | Collections/references may lack a stable id or use `collection-<name-date>`, `community_collection_*`, or `user_collection_*`; physical row id may be positional. | Stable `StoredImageCollection.id = slugify(name)` and references rewritten to it; then physical rows may be re-keyed in a separate, backup-protected migration. This is higher risk because templates and automations contain collection references. |
| Browser-only legacy keys | Browser `localStorage`, not Appwrite | `realfarm:calendar-filters:v1` is current read/write (`components/realfarm/content-calendar/content-calendar-view.tsx:82,129-142`); `reelfarm:pinterest-recent` is current read/write (`components/realfarm/pinterest-collection-search.tsx:126-127,537-538`). | Brand/typo key names; payloads are local UI preferences. No evidence of both old and new keys. | Out of scope for TablesDB script. Either retain harmless keys or add client-side read-old/write-new/delete-old migration in a later release. |

`automation_template_example` rows are routed to `permanent_assets` (`lib/appwrite-stores.ts:45-49`) but are not part of the template DTO migration: their camel-case record shape is separately normalized (`lib/automation-templates.ts:595-625`). The names `realfarm-*` on modules/assets and `images/realfarm` upload paths are naming residue, not demonstrated legacy payload compatibility. No `realfarm:` key was found; the two exact browser keys above are the only colon-prefixed matches.

Tables store the domain object in JSON string column `data`; indexed columns are denormalized alongside it (`lib/consolidated-records.ts:21-35`). An affected row can therefore carry old and new information both inside `data` and in physical columns. Any payload rewrite must also regenerate relevant denormalized fields using `canonicalRowFields`, not update `data` alone.

## Canonical payloads and field transformations

### `permanent_assets/automation_template`

Persist:

```ts
type StoredAutomationTemplate = {
  id: string
  automationKind: "slideshow" | "video" | "ugc"
  sourceAutomationId?: string
  sourceUrl?: string
  name: string
  theme: string
  createdAt: string
  updatedAt: string
  schema: Omit<AutomationSchema, "title" | "status" | "schedule" | "social_integrations">
}
```

`schema.created_at` must be an ISO string in JSON and be converted to `Date` only at the runtime boundary. Templates are not lifecycle records, so continue omitting synthesized `title`, `status`, `schedule`, and `social_integrations`; the current converter invents those values (`lib/automation-templates.ts:272-320`). Preserve all actual reusable runtime fields, including `automationKind`, `aspect_ratio`, `font`, `image_fit`, `language`, `prompt_formatting`, `hooks`, object-valued `image_collection_ids`, `tone`, camel-case `formatting`/`textItems`, `tiktok_post_settings`, `web_search_enabled`, `video_format`, and `ugc` where applicable (the intended reusable set is documented by `RuntimeAutomationTemplate` at `lib/realfarm-automation.ts:153-172`).

Drop `template` entirely. Mappings include: `created_at -> schema.created_at`; JSON-decode `image_collection_ids -> schema.image_collection_ids`; `format.*.aspect_ratio -> formatting[].aspect_ratio`; `image_grid -> imageGrid`; `display_text -> !noText`; `ai_image_selection -> aiImageSelection`; `slide_count* -> slideCount*`; `overlay_image.{collection_id,height} -> overlayImage.{collectionId,padding}`; `image_mode -> imageMode`; and every text item `font_size/text_style/text_position/text_item_width/word_length_min/word_length_max/content_direction/text_mode/static_text/text_align/text_anchor/text_vertical_anchor -> fontSize/textStyle/textPosition/textItemWidth/wordLengthMin/wordLengthMax/contentDirection/textMode/staticText/textAlign/textAnchor/textVerticalAnchor` (`lib/automation-templates.ts:401-551`). `template.hooks` becomes canonical hook items using the same deterministic normalization as `normalizeAutomationSchema`; do not merely copy strings.

### `automations`

Persist `id, ownerId?, sourceAutomationId?, sourceUrl?, name, status, favorite, theme, importedAt?, updatedAt, schema, raw?`. Drop top-level `account`, `handle`, and `times`; drop nested `schema.title` and `schema.status`. Keep `name/status` top-level because APIs, list views, runner selection, and lifecycle mutations use them directly. `schema` is the normalized configuration from `normalizeAutomationSchema`, minus the two nested summary aliases and all detected legacy keys. This also prevents the current read normalizer from silently returning a shape different from stored `data`.

Before deleting derived fields, replace the `automationRecordToSummary` fallback `scheduleTimes.length > 0 ? scheduleTimes : record.times` (`lib/automations.ts:268-279`) with schema-only derivation. Rows with no valid posting times must receive canonical defaults during migration, never recover from `times` after removal.

## Migration script design

Follow the explicit environment and Appwrite-client conventions in `scripts/migrate-consolidated-data.ts`: require `--env-file`, parse it without mutating process env, require endpoint/project/key, use `node-appwrite` `TablesDB`, default to preview, and paginate with `Query.limit(100)` plus `Query.cursorAfter` (`scripts/migrate-consolidated-data.ts:38-63,195-210,248-255`). Add a package script such as `appwrite:migrate-legacy-shapes: "tsx scripts/migrate-legacy-persisted-shapes.ts"`, matching existing `appwrite:*` naming.

Required CLI:

- `--env-file=<path>` and `--store=<selector>` are mandatory; `--owner=<id>` is mandatory for private stores unless `--all-owners` is explicitly supplied. Public template rows use no owner filter.
- No `--apply` means read-only dry-run. `--apply` is the only mutation gate. Reject unknown flags and reject simultaneous local/cloud ambiguity; print endpoint, project, database, selected stores, owner scope, and mode before work.
- Dry-run and apply print one JSON diff per changed row: table, source key, `$id`, `rid`, owner, detected legacy markers, RFC-6902-like changed paths, and before/after hashes. Never print secrets; optionally truncate large values while retaining paths and hashes.
- Paginate by physical rows with `Query.equal("source_key", ...)` for consolidated tables and `Query.equal("owner_id", ...)` for private stores, matching runtime scoping (`lib/json-store.ts:283-318,349-357`). Process bounded batches (100 read, at most 3 concurrent writes, matching `lib/json-store.ts:453-470`). Do not hydrate through current normalizers: parse raw `row.data` so the audit can see old fields.

Idempotence:

1. Parse and classify each raw payload as legacy, canonical, mixed, invalid, or ambiguous.
2. Canonical rows whose recomputed JSON and denormalized fields match are `already_migrated` and receive no write.
3. Legacy rows transform once. Mixed rows require precedence rules: authoritative canonical values win only when semantically equivalent; a conflict is `blocked_conflict`, never silently overwritten.
4. Use stable JSON serialization/order for comparison and hashes. Preserve `$id`, `rid`, `ord`, `owner_id`, permissions, and unrelated physical metadata. Use `tables.updateRow`, not delete/create or whole-store writes.
5. Add an explicit marker inside payload, e.g. `dataVersion: 2`, and use it only with structural validation; a marker alone must not suppress repair. If adding this field is rejected during implementation, structural equality remains the idempotence test.

Backup-first behavior:

- Every run creates `backups/legacy-shapes/<project>-<database>-<UTC timestamp>/<table>-<source_key>.ndjson` plus `manifest.json`. On `--apply`, write and `fsync` the complete selected-row backup before the first update; abort if backup creation or row-count/hash validation fails. Dry-run may write a clearly labeled preview backup, but never Appwrite.
- Each NDJSON line contains the complete original physical row necessary for restore: `$id`, permissions, all columns including exact `data`, and capture timestamp. Manifest records endpoint/project/database, filters, counts, per-file SHA-256, script/git revision, and migration version. Restrict file mode because private user data is included.
- Re-read every row just before update and compare `$updatedAt`/hash with the backed-up version. Abort that row on concurrent modification. Never use bulk `writeJsonArrayStore`, whose reconciliation can delete rows (`lib/json-store.ts:397-470`).

Verification:

- Pre/post counts must match per `(table, source_key, owner_id)`; `$id`, `rid`, `ord`, owner and permissions sets must be identical.
- Report totals: scanned, legacy, mixed, already canonical, changed, unchanged, invalid JSON, blocked conflicts, write failures, and verification failures.
- Re-read every changed row (or all rows for the two audit-blocking stores), validate canonical structure and absence of forbidden paths, recompute denormalized columns with `canonicalRowFields`, and compare before/after semantic projections.
- Print deterministic samples from each classification, not random samples. Apply exits nonzero on invalid/ambiguous rows or any mismatch. A second dry-run must report zero changes before legacy readers are removed.
- Local rehearsal uses `.env.local` only after `pnpm appwrite:local:setup`; cloud uses explicit `.env`. Setup clones cloud schema and provisions consolidated tables (`scripts/setup-local-appwrite.mjs:91-107`) but is not itself the migration command. Never start the deprecated repo-local Appwrite stack.

## Code removal after successful migration

Template phase:

- Replace `AutomationTemplateTextItem`, `AutomationTemplateFormat`, and `AutomationTemplateDefinition` (`lib/automation-templates.ts:42-108`) with the canonical stored type.
- Delete `automationTemplateRecordToSchema`, `automationSchemaToTemplateRecord`, `automationSchemaToTemplateFormat`, `templateFormatToRuntime`, `textItemToTemplate`, `templateTextItemToRuntime`, `normalizeTemplateFormat`, string JSON parsers, and snake-case-only slide helpers (`lib/automation-templates.ts:269-323,368-551,627-698`). Retain only a small JSON-Date/runtime constructor if needed; it must not accept v1.
- Update callers: template API GET/POST (`app/api/automation-templates/route.ts:5-81`), testing-center generation (`app/api/temp/testing-center/generate/route.ts:8-63`), delete preview (`app/api/image-collections/delete-preview/route.ts:6-57`), workspace loader (`components/realfarm/routes/workspace-route.tsx:9-92`), docs assets (`components/docs/automation-template-assets.tsx:4-148`), debug page (`app/debug/page.tsx:6-21`), and `lib/temp-slide-testing.ts` imports/direct snake-case accesses (`lib/temp-slide-testing.ts:3-5,232-275,526-651`). Rewrite associated unit/live fixtures and data-object docs.

Automation phase:

- Remove `account`, `handle`, `times` from `AutomationRecord`; remove `title/status` from the persisted schema/config type. Delete synchronization in `patchAutomationRecord` and `normalizeAutomationRecord` (`lib/automations.ts:169-192,329-380`). Keep one display-summary adapter deriving account/handle/times.
- Update direct nested consumers: runner live checks/titles (`lib/automation-runner.ts:476,658,2712-2743`), MCP live check (`lib/mcp/lumenclip-server.ts:1216`), debug preview (`app/api/debug/automation-preview/route.ts:55`), video copy (`app/api/automations/video-copy/route.ts:55`), temp testing (`lib/temp-slide-testing.ts:295`), and schema lifecycle checks such as UGC validation (`lib/realfarm-automation.ts:780-781`) to accept record metadata separately.
- Once all rows are v2, delete only the proven old-shape branches in `normalizeAutomationSchema`: retired knowledge-field deletion, `schedule.interval`, `_tone`, and old hook/override aliases. Do not delete general validation/defaulting merely because it is called “normalize.” Remove `LegacyAutomationScheduleInterval` and interval handling from both `lib/realfarm-automation.ts:201-207,644-646,1467-1505` and scheduler input compatibility at `lib/automation-slots.ts:25-35` after deployed function copies are regenerated through `pnpm appwrite:sync-shared`.
- Follow-up phases delete `legacyPromptOverrides`/old X branches, `XAutomationRun.platforms`, result-id fallback, collection aliases, and positional-id reuse only after their own zero-diff verification.

## Ordering, compatibility window, and rollout

1. Implement pure v1 classifiers/converters plus fixtures; do not change production readers.
2. Implement CLI, backup/restore mode, dry-run diffs, owner scoping, pagination, conflict checks, and post-read verification. Add package script.
3. Run unit tests and a local `.env.local` dry-run; inspect every invalid/mixed row. Run local apply, verify, then run dry-run again expecting zero changes. Exercise template create/read/use and automation create/edit/run flows against migrated local rows.
4. Deploy a **bridge release** that reads v1 and v2 but writes v2 only. This release is necessary for templates: current code writes v1, so migrating under unchanged production code would allow new v1 rows to reappear. For automations, the bridge stops dual-writing schema aliases and emits v2 while retaining v1 reads.
5. Back up cloud selected rows, run cloud dry-run per owner/store, resolve blockers, run `--apply`, and verify. Temporarily quiesce template/automation writes or use optimistic per-row conflict checks plus repeat dry-runs until zero; a partially migrated store is safe only while the bridge is deployed.
6. Observe at least one full worker/scheduler cycle. Confirm no v1 writes via another dry-run.
7. Deploy the cleanup release removing v1 reads/converters and old callers. Regenerate/check Appwrite shared function sources where portable automation schema/scheduling code changed.
8. Execute discovered follow-up stores one at a time, collection references last.

Data cannot safely be migrated first under the current template code because it cannot read the proposed v2 shape and continues writing v1. Code and data therefore need the bridge release, not a single atomic cutover. Never deploy cleanup readers before all scoped owners are verified; that would make unmigrated rows disappear or default silently. Public templates are especially sensitive because one bad row affects every user.

## Rollback

Ship `--restore=<manifest.json> --apply` in the same script. It must verify manifest hashes and endpoint/project/database, re-read targets, show a reverse diff, and require an additional exact confirmation token containing the project id. Restore each original row with `updateRow` using its complete backed-up columns and original permissions; do not recreate unless the migration unexpectedly created a row (it should not). Verify restored hashes/counts and run the old-code semantic readers against samples.

If failure occurs while the bridge release is live: stop further applies, quiesce writes, restore changed rows, verify, and leave/redeploy the bridge because it reads both versions. If cleanup code has shipped, roll application/functions back to the bridge before restoring v1 data. Keep backups until the cleanup release has completed its observation period and a separate retention decision is approved.

## Risks and unknowns the dry-run must answer

- Actual local/cloud row populations and versions are unknown; this investigation deliberately did not query Appwrite.
- `created_at` is a `Date` at runtime but a string after JSON serialization; invalid dates currently receive defaults and could silently change. Block invalid source dates.
- Invalid/string/double-encoded `image_collection_ids`, missing format sections, unknown enum values, empty hook catalogs, or `null` legacy-only fields can turn into plausible defaults. Classify and stop instead of lossy normalization.
- Existing template conversion is not perfectly information-preserving: it synthesizes schedule/timezone/status, uses tone labels, and may derive slide counts. Compare semantic runtime output before/after, not only JSON.
- Mixed old/new fields may disagree. Never choose by truthiness; emit both paths/values as a blocked conflict.
- Public template rows have no owner; private tables may include owner in both column and payload. Column owner is authoritative, and disagreement is a blocker.
- Concurrent app/worker writes can reintroduce v1 or overwrite an applied row. Bridge release plus optimistic checks/quiescence is mandatory.
- Updating `data` without indexed columns (`name`, `status`, `created_raw`, `source_entity_id`, etc.) creates query-visible inconsistency (`lib/consolidated-records.ts:21-107`).
- Result media are split between `outputs.data` and `output_media`; do not run generic reserialization that extracts/deletes media fields unless the phase explicitly preserves/hydrates them (`lib/consolidated-records.ts:120-180`).
- Collection-id migration is graph-wide: templates, automations, overlays, and possibly historical rows refer to aliases. Build a reference report before rewriting.
- Cloud schema may still contain legacy source tables; the prior consolidation script maps `automation_templates` into `permanent_assets/automation_template` (`scripts/migrate-consolidated-data.ts:65-76`). Confirm no active writer still targets source tables before declaring migration complete.

## Concrete implementation build order

1. Define v2 stored types and forbidden-path validators in a pure module; add exhaustive v1/v2/mixed/invalid fixtures.
2. Implement lossless template v1-to-v2 conversion and semantic equivalence tests against current runtime conversion.
3. Implement automation v1-to-v2 canonicalization, summary derivation, and tests for invalid dates, interval schedules, `_tone`, hooks, empty catalogs, and conflicts.
4. Build shared raw TablesDB paginator, owner filters, stable hashing/diffing, and exact denormalized-column recomputation.
5. Build backup manifest/NDJSON writer and verified restore mode before mutation code.
6. Add dry-run reports and counts; prove no Appwrite write method is reachable without `--apply`.
7. Add optimistic batched apply, per-row re-read, verification, second-run idempotence tests, and package command.
8. Implement/deploy bridge readers and v2-only writers; update API contracts and function-shared artifacts.
9. Rehearse local backup/dry-run/apply/verify/restore/reapply and end-to-end flows.
10. Run owner-by-owner cloud rollout, observe, then remove template and automation compatibility code/callers.
11. Implement separate measured phases for X rows, results, and finally collection IDs; migrate browser keys only if product naming cleanup is desired.
