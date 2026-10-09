# 03 — Appwrite Cloud data layer (replaces Railway Postgres + bucket)

Status: design proposal for the rendering-engine refactor (branch `refactor/base`).
Scope: only the features that survive the refactor — slideshow/carousel specs,
renders, image collections and uploads, publishing (PostFast, including TikTok
through PostFast), scheduling/calendar, reminders/notifications, the public
render API (`/api/v1`) and MCP, and workspace membership. No data migration:
Appwrite Cloud starts empty.

Fixed constraints from the owner:

- Data and assets move to **Appwrite Cloud** (TablesDB and Storage).
- **Clerk stays the only auth/session boundary.** Appwrite Auth is not used and
  no Appwrite browser SDK is shipped.
- The Next app and its background worker **stay on Railway**.

---

## 1. What exists today (and what it tells us)

### 1.1 Current runtime data layer (Railway)

| Piece | File(s) | What it does | Fate |
|---|---|---|---|
| Postgres connection | `lib/railway/database.ts` (postgres.js + drizzle) | `DATABASE_URL` client | delete |
| Schema | `lib/railway/schema.ts`, `drizzle.config.ts`, `infra/railway/migrations/0001…0004` | 6 tables: `app_users`, `domain_records`, `object_manifest`, `jobs`, `output_media`, `migration_failures` | delete |
| Generic record store | `lib/railway/domain-record-store.ts` | Everything lives in one `domain_records(table_name,row_id,…,payload jsonb)` table, filtered with JSON paths | delete; replace with typed tables |
| JSON "file" facade | `lib/json-store.ts`, `lib/store-identity.ts`, `lib/consolidated-records.ts` | Features still address storage as `data/<file>.json` paths, mapped via `STORE_ROUTES` to `(table, sourceKey)`. `json-store` calls `getCurrentUser()` *inside* the storage layer. | delete. The path-addressing indirection is the main thing that makes the app hard to change. |
| Posts repository | `lib/post-repository*.ts` (`posts` + `post_identities`, dual-write states `pending/reconciled/repair_required`) | Canonical publication records with identity claims | rewrite with a much smaller `posts` table (section 3) |
| Job queue | `lib/queue.ts` (drizzle `jobs` table), `lib/railway/job-queue.ts` (pg-boss, unused by the worker) | `enqueueJob`, `send-notification`, generation retries | rewrite on Appwrite `jobs` + `job_leases` |
| Object storage | `lib/railway/object-storage.ts`, `lib/railway/storage-response.ts`, `lib/asset-storage.ts` | S3 client; key = `appwrite/<bucket>/<sha256(path)>` | delete; replace with Appwrite Storage adapter |
| Asset serving | `app/api/local-assets/[...assetPath]/route.ts` | Streams any `data/...` path from the bucket. **Does no ownership check.** File ids are `sha256(relativePath)`, so anyone who can guess a path can read the file. | replace with an owner-checked `/api/files/[id]` route (section 5) |
| Workspace sharing | `lib/workspace-members.ts`, `app/api/settings/team/*` | Custom email invites stored in `domain_records`; `sharedOwnerIdsFor` | replace with Clerk Organizations (recommended) or a small table (section 3.10) |
| Per-user prefs | `lib/auth.ts` → Clerk `privateMetadata` (`lumenclipPreferences`, `lumenclipOwnerId`) | PostFast disconnected integrations, disabled MCP tools | move to the `workspace_settings` table; drop the `lumenclipOwnerId` legacy mapping (it existed only to keep old Appwrite user ids) |
| API auth | `lib/openapi-app.ts` (only `/health`), `scripts/lumenclip-mcp.mts` (stdio, owner from `LUMENCLIP_MCP_OWNER_ID`) | **No API keys exist.** | new `api_keys` table |

The worker entrypoint (`pnpm railway:worker:once` in `railway.worker.json`) no
longer exists in `package.json`, so the Railway worker is broken on this branch.
The worker is effectively being rebuilt anyway.

### 1.2 Entities the kept features need

| Kept feature | Current storage | New table(s) |
|---|---|---|
| Slideshow specs/templates (JSON spec) | `outputs`/`permanent_assets` blobs, `automation_template` source keys | `specs` |
| Rendered slideshows | `outputs` (`sourceKey=result`) + `output_media` + bucket `slideshows` | `renders` (+ files in the `renders` bucket) |
| Image collections + images | `permanent_assets` (`image_collection`, with images as a JSON array) | `collections`, `media` |
| Uploaded assets / media library | `permanent_assets` (`uploaded_asset`, `media_library_asset`) | `media` (same table, `collection_id = null`) |
| Custom fonts (new; fits "more customizability") | repo `assets/fonts` only | `media` with `kind=font` |
| Scheduled posts / publications / calendar / queue | `posts`, `post_identities`, `outputs.publications` | `posts` |
| PostFast config | env `POSTFAST_API_KEY` (global) + Clerk metadata | `workspace_settings` |
| Reminder settings | `permanent_assets` (`reminder_settings`, which also holds `telegramBotToken`) | `workspace_settings.reminders` |
| Reminders/notifications | `jobs` of type `send-notification`, delivered to Telegram | `notifications` (+ `jobs`) |
| Team membership | `domain_records(workspace_members)` | Clerk Organizations (no table) or `workspace_members` |
| API keys for `/api/v1` + MCP | none | `api_keys` |
| Background renders/publishing | `jobs` | `jobs`, `job_leases` |

Dropped with the removed features (no Appwrite equivalent): `automations`,
`automation_runs`, `x_automations`, `usage_ledger`, `word_collections`,
`postfast_metric_snapshots`, `account_follower_snapshots`, every `tiktok_*`
analytics and comment store, `generated_video`, `product_collection`,
`generation_model_settings`, `brand_profile`, `object_manifest`,
`migration_failures`, `app_users`, `post_identities`, `output_media`.

The **usage ledger** exists only for LLM/provider cost accounting and for the
image `last_used_at` rotation, which served automation image matching. It goes.
If the owner wants API metering or billing, add a `usage_events` table later
(see open questions).

---

## 2. Recovered Appwrite implementation: what to reuse

The old Appwrite runtime was deleted in `b853662` (the refactor-base snapshot).
Recover any file with `git show b853662^:<path>`. Older deletions (for example
`lib/appwrite-storage-response.ts` and `scripts/setup-local-appwrite.mjs`) are
recovered with `git show eab6a0a^:<path>`.

| Old file | Verdict | Notes |
|---|---|---|
| `lib/appwrite.ts` (69 lines) | **Reuse the idea, rewrite.** | A server-only `Client` + `TablesDB` + `Storage` singleton. Drop all of the `RailwayTablesCompat` / `dataBackend()` switching. |
| `lib/appwrite-errors.ts` | **Reuse verbatim** as `lib/data/appwrite/errors.ts` | `isAppwriteQuotaError` / `toLumenClipDataError` already handle the Cloud 429 and quota cases this app hit before. Add `isConflict(e)` (code 409) and `isNotFound(e)` (404). |
| `lib/appwrite-stores.ts` | **Do not reuse.** | This is the same `STORE_ROUTES` / json-path facade that exists today, and it is what we are removing. Keep only the `ID_RE` rule (`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$`). |
| `lib/post-repository-appwrite.ts` (750 lines) | **Reuse patterns only.** | Good patterns: `cursorAfter` pagination (`PAGE=100`), owner-scoped `Query.equal("owner_id")`, and 409-based identity reservation (`reserveIdentity`). Drop the dual-write, repair-event, and identity-alias machinery. |
| `lib/railway/appwrite-compat.ts` | delete | It emulated Appwrite on Postgres. |
| `scripts/provision-consolidated-stores.mjs` (in the working tree) | **Reuse the mechanics.** | Its helpers (`createStringColumn` / `createMediumtextColumn` / `createLongtextColumn`, `waitForColumns`, `ignoreConflict`, index creation) are the right shape. Its schema (`permanent_assets`/`outputs` polymorphic blobs) is not. Replace the file with `scripts/appwrite-provision.mjs`. |
| `scripts/clone-appwrite-schema.mjs`, `prune-appwrite-schema.mjs` | delete | They clone and prune the old polymorphic schema. Drift checking moves into the provision script (`--check`). |
| `appwrite.json` | delete | It only declares the two Functions below. Schema lives in code. |
| `appwrite/functions/job-worker` | **Delete.** | It is a hand-synced copy of `lib/` (openrouter, langfuse, llm-slop, rendi, deepl…), mostly removed features. This is the "3-way prompt/code divergence" risk recorded in memory. Its claim logic (`updateRow` then `getRow` to compare `leased_by`) is **not atomic**, so two workers can both win a claim. The lease design in section 4 fixes this. |
| `appwrite/functions/template-scheduler` | delete | Enqueued automation runs, which are removed. |
| `appwrite/functions/deploy.mjs`, `scripts/sync-function-shared.mjs`, `scripts/run-railway-function.test.ts` | delete | |

Appwrite API notes for implementers. Memory and the shared local stack run
**1.9.x**:

- Use the **TablesDB** API (`tablesDB.createRow/getRow/listRows/updateRow/upsertRow/deleteRow`).
  Do not use Databases/documents. Rows carry system fields `$id`, `$createdAt`,
  `$updatedAt` and `$permissions`; do not duplicate created/updated columns.
- Row and file ids are at most 36 chars, `[a-zA-Z0-9._-]`, and must not start
  with a special char. Use `ID.unique()` (20 chars) unless a deterministic id is
  needed for idempotency.
- Text columns: `varchar`/string (indexable, sized), `text`, `mediumtext`, and
  `longtext` (not indexable). JSON goes into `longtext` as a string. There is no
  native JSON column, so no JSON-path queries. Anything you filter on must be a
  real column.
- `Query.select([...])` keeps the large `spec`/`output` longtexts out of list
  views. Use it on every list query, because reads and bandwidth are billed.
- There is no conditional (compare-and-set) update. Atomicity comes from
  **unique row ids or unique indexes**: `createRow` with a taken id, or a
  duplicate in a unique index, returns **409**.
- Check Cloud's server version (`GET /v1/health/version`) against the local
  1.9.5 stack before pinning `node-appwrite`. Cloud and local must expose the
  same TablesDB methods the code uses (`upsertRow`, `incrementRowColumn`,
  transactions if used).

---

## 3. Schema design

Database id: `lumenclip`. All tables use `rowSecurity: false` and **empty table
permissions**. Only the server API key can read or write. The browser never
talks to Appwrite. Every query the app issues includes `workspace_id`, taken
from the resolved Clerk/API-key context (section 6). Ownership is enforced in
the repository layer, never by Appwrite permissions.

Conventions:

- `workspace_id` (string 64) is the tenant key: the Clerk org id (`org_…`) or
  the Clerk user id (`user_…`) for a personal workspace. The old schema used
  size 36, which is too small for prefixed Clerk ids.
- `created_by` (string 64) is the Clerk user id, or `apikey:<api_keys.$id>`.
- Times are `datetime` columns (ISO 8601). Use real datetime columns, not the
  old `string(64)` dates, so range queries and ordering work.
- JSON is stored as `longtext` and validated with zod in the repository on both
  read and write.
- An "enum" column is a sized string validated in code. Appwrite enum columns
  are painful to evolve. Exception: small, stable status sets may use `enum`.
- "Soft delete" uses `deleted_at` plus `purge_after`, and a worker sweep
  hard-deletes rows and files afterwards. This is the existing 30-day
  collection trash behaviour.

### 3.1 `specs` — reusable slideshow specs ("templates")

| column | type | req | notes |
|---|---|---|---|
| workspace_id | string 64 | ✓ | |
| name | string 255 | ✓ | |
| spec | longtext | ✓ | JSON spec (layout + all elements; text and image slots may be unbound) |
| spec_version | integer | ✓ | schema version of the spec format |
| aspect_ratio | string 16 | ✓ | denormalised for filtering (`9:16`, `4:5`, `1:1`) |
| slide_count | integer | ✓ | |
| image_slot_count | integer | ✓ | number of image slots the picker must fill |
| thumbnail_file_id | string 36 | | preview render in the `renders` bucket |
| created_by | string 64 | ✓ | |
| archived_at | datetime | | |

Indexes: `ws_updated (workspace_id, $updatedAt desc)`, `ws_name (workspace_id, name)`.

### 3.2 `renders` — one requested render, with the frozen inputs and outputs

A render is immutable after it succeeds. Re-rendering creates a new row. This
matches the AGENTS.md "history is read-only" principle.

| column | type | req | notes |
|---|---|---|---|
| workspace_id | string 64 | ✓ | |
| spec_id | string 36 | | source spec, if any |
| spec | longtext | ✓ | **fully resolved** spec: text filled, every image slot bound to a `media` id |
| status | string 16 | ✓ | `queued` \| `rendering` \| `succeeded` \| `failed` |
| source | string 16 | ✓ | `ui` \| `api` \| `mcp` |
| api_key_id | string 36 | | |
| idempotency_key | string 128 | | from the `Idempotency-Key` header |
| title | string 512 | | |
| caption | mediumtext | | text input passed through to publishing |
| hashtags | text | | |
| slide_count | integer | ✓ | |
| width / height | integer | ✓ | output pixel size |
| output | longtext | | JSON `{ slides: [{ index, fileId, bytes, mime }], coverFileId }` |
| error | mediumtext | | |
| job_id | string 36 | | |
| completed_at | datetime | | |
| created_by | string 64 | ✓ | |
| deleted_at / purge_after | datetime | | |

Indexes: `ws_created (workspace_id, $createdAt desc)`,
`ws_status (workspace_id, status)`, `ws_spec (workspace_id, spec_id)`, and
**unique** `ws_idem (workspace_id, idempotency_key)` (nulls are allowed
multiple times).

Rendered slides are files in the `renders` bucket with id
`<renderId>-<NN>` (20 + 3 ≤ 36 chars). Download-all zips stay client-side
(`lib/slideshow-export.ts` already zips in the browser), so zips are not
stored.

### 3.3 `collections` — image collections

| column | type | req | notes |
|---|---|---|---|
| workspace_id | string 64 | ✓ | |
| name | string 255 | ✓ | |
| media_kind | string 16 | ✓ | `image` \| `video` |
| pinned | boolean | | |
| item_count | integer | ✓ | maintained with `incrementRowColumn` |
| cover_media_id | string 36 | | |
| created_by | string 64 | ✓ | |
| deleted_at / purge_after | datetime | | |

Indexes: `ws_name` **unique** `(workspace_id, name)`. Today collections are
keyed by `name + created_at`, so this simplifies to "names are unique per
workspace". Also `ws_updated (workspace_id, $updatedAt desc)`.

### 3.4 `media` — every user-supplied binary (uploads, collection images, fonts)

This merges today's `uploaded_asset`, `media_library_asset`, and the JSON
`images[]` array inside each collection. Collection membership becomes a
column, which removes the "rewrite the whole collection JSON to add one image"
pattern.

| column | type | req | notes |
|---|---|---|---|
| workspace_id | string 64 | ✓ | |
| collection_id | string 36 | | null means it lives in the uploads library only |
| kind | string 16 | ✓ | `image` \| `video` \| `font` |
| bucket_id | string 36 | ✓ | `media` |
| file_id | string 36 | ✓ | |
| mime_type | string 100 | ✓ | |
| size_bytes | integer | ✓ | |
| width / height | integer | | probed at ingest (needed for slot fitting in the picker) |
| sha256 | string 64 | ✓ | content hash for dedupe |
| name | string 255 | | original file name / font family |
| caption | text | | alt text / search |
| source | string 16 | ✓ | `upload` \| `pexels` \| `pinterest` \| `url` |
| source_url | text | | |
| attribution | text | | e.g. the Pexels photographer and link |
| position | integer | | ordering inside a collection |
| created_by | string 64 | ✓ | |
| deleted_at / purge_after | datetime | | |

Indexes: `ws_coll_pos (workspace_id, collection_id, position)`,
`ws_kind_created (workspace_id, kind, $createdAt desc)`,
**unique** `ws_coll_hash (workspace_id, collection_id, sha256)` for dedupe
inside a collection, and `ws_hash (workspace_id, sha256)` to reuse the same
stored file across collections. Rows may share one `file_id`, so deletion must
refcount by `sha256` before deleting the file.

Pexels and Pinterest picks are **copied into storage at pick time**. Remote
URLs expire (Pinterest), and a render must be reproducible from its frozen
spec.

### 3.5 `posts` — scheduled posts, publications, calendar and queue

This replaces `posts` + `post_identities` + `outputs.publications`. One row is
one rendered slideshow going to one destination account.

| column | type | req | notes |
|---|---|---|---|
| workspace_id | string 64 | ✓ | |
| render_id | string 36 | ✓ | |
| provider | string 32 | ✓ | `tiktok`, `instagram`, … (PostFast providers) |
| integration_id | string 128 | ✓ | PostFast integration id |
| status | string 16 | ✓ | `draft` \| `scheduled` \| `publishing` \| `published` \| `failed` \| `canceled` |
| publish_mode | string 16 | ✓ | `auto` \| `review` \| `manual` |
| scheduled_at | datetime | | |
| published_at | datetime | | |
| caption | mediumtext | | final caption (may differ from the render's) |
| hashtags | text | | |
| provider_options | longtext | | JSON (`postfast-provider-controls`: TikTok privacy, music, etc.) |
| postfast_post_id | string 128 | | |
| external_post_id | string 255 | | |
| release_url | text | | manual linking (`manual-publication`) |
| link_method | string 32 | | `postfast` \| `manual_url` |
| error | mediumtext | | |
| intent_key | string 128 | ✓ | `sha256(render_id:integration_id:slot)` for idempotency |
| created_by | string 64 | ✓ | |

Indexes: **unique** `ws_intent (workspace_id, intent_key)`,
`ws_sched (workspace_id, scheduled_at)` (calendar range queries),
`status_sched (status, scheduled_at)` (worker sweep),
`ws_render (workspace_id, render_id)`,
**unique** `pf_post (postfast_post_id)`.

### 3.6 `workspace_settings` — one row per workspace

Row id: `w` + `sha256(workspace_id)[:35]`, which is deterministic, so this is an
`upsertRow`.

| column | type | notes |
|---|---|---|
| workspace_id | string 64, unique index | |
| timezone | string 64 | calendar and reminders |
| postfast_api_key_enc | text | AES-256-GCM ciphertext (`LUMENCLIP_SECRETS_KEY`). Only used if PostFast becomes per-workspace (open question); otherwise keep the env key. |
| postfast_disabled_integration_ids | text | JSON array (moved from Clerk metadata) |
| reminders | longtext | JSON `ReminderSettings` minus Telegram fields |
| mcp_disabled_tools | text | JSON array (moved from Clerk metadata) |
| render_defaults | longtext | JSON: default font, aspect ratio, safe-area, watermark |

### 3.7 `notifications` — reminders / in-app inbox

| column | type | req | notes |
|---|---|---|---|
| workspace_id | string 64 | ✓ | |
| user_id | string 64 | | null means everyone in the workspace |
| event | string 48 | ✓ | `ReminderEvent` |
| post_id | string 36 | | |
| title | string 255 | ✓ | |
| body | text | | |
| deliver_at | datetime | ✓ | |
| channel | string 16 | ✓ | `in_app` (+ `email` later) |
| status | string 16 | ✓ | `pending` \| `delivered` \| `read` \| `canceled` |
| read_at | datetime | | |
| dedupe_key | string 128 | ✓ | |

Indexes: **unique** `ws_dedupe (workspace_id, dedupe_key)`,
`ws_user_status (workspace_id, user_id, status, deliver_at)`,
`due (status, deliver_at)`.

Telegram is removed, so in-app notifications are the delivery path. They show
in the app shell and calendar. The table is written ahead of time, and the
worker flips `pending` to `delivered` once `deliver_at` passes. Email or web
push can be added as a channel later.

### 3.8 `api_keys` — `/api/v1` and MCP credentials

| column | type | req | notes |
|---|---|---|---|
| workspace_id | string 64 | ✓ | |
| name | string 128 | ✓ | |
| prefix | string 16 | ✓ | shown in the UI, e.g. `lc_4f9a2b` |
| key_hash | string 64 | ✓ | `sha256(secret)`, hex. The plaintext is shown once. |
| scopes | string 64, **array** | ✓ | `renders:write`, `renders:read`, `media:write`, `posts:write`, … |
| created_by | string 64 | ✓ | |
| last_used_at | datetime | | updated at most once per minute per key |
| expires_at / revoked_at | datetime | | |

Indexes: **unique** `hash (key_hash)`, `ws (workspace_id)`.

Format: `lc_<prefix>_<32 random bytes base62>`. Lookup is by hash; reject the
key if it is revoked or expired. The MCP server (HTTP transport inside Next, or
stdio launched with `LUMENCLIP_API_KEY`) authenticates with the same key and
resolves the same workspace. This replaces `LUMENCLIP_MCP_OWNER_ID` and
`LUMENCLIP_SYSTEM_OWNER_ID`.

### 3.9 `jobs` + `job_leases` — durable background work (section 4)

`jobs`:

| column | type | req | notes |
|---|---|---|---|
| workspace_id | string 64 | | null for system sweeps |
| type | string 32 | ✓ | `render` \| `publish` \| `sync-post` \| `deliver-notifications` \| `purge` |
| status | string 16 | ✓ | `queued` \| `running` \| `succeeded` \| `failed` \| `dead` |
| payload | longtext | ✓ | JSON |
| result | longtext | | JSON |
| error | mediumtext | | |
| attempt | integer | ✓ | current attempt number (0 = never claimed) |
| max_attempts | integer | ✓ | |
| run_at | datetime | ✓ | earliest start (backoff / scheduling) |
| lease_expires_at | datetime | | |
| worker_id | string 64 | | |
| completed_at | datetime | | |

Row id: `ID.unique()`, or deterministic `j` + `sha256(workspace:dedupeKey)[:35]`
for dedupe. This is the existing `deterministicJobId`; a 409 means "already
enqueued".

Indexes: `claimable (status, run_at)`, `expired (status, lease_expires_at)`,
`ws_created (workspace_id, $createdAt desc)`.

`job_leases`: row id `<jobId>.<attempt>` (≤ 36 chars with a 20-char job id).
Columns: `job_id` (string 36), `worker_id` (string 64), `expires_at`
(datetime). No indexes needed. The worker purges lease rows older than 7 days.

### 3.10 Membership

**Recommended: Clerk Organizations, with no Appwrite table.** The workspace is
the active Clerk org (`auth().orgId`), or the user's personal workspace
(`userId`) when no org is active. Clerk's org invitations and roles
(`org:admin`, `org:member`) replace `lib/workspace-members.ts` and the custom
invite/accept routes. This keeps Clerk the only identity and membership
authority.

Fallback if the owner does not want Clerk orgs: `workspace_members`
(`workspace_id`, `user_id`, `email`, `role`, `status`, `invite_token_hash`,
unique `(workspace_id, email)`, index `(user_id)`), which ports the existing
code.

### 3.11 Not stored

- Public share links stay **stateless HMAC tokens** (`lib/slideshow-share.ts`,
  `SLIDESHOW_SHARE_SECRET`). There is no table.
- Built-in fonts stay in the repo (`assets/fonts`). Only user fonts go to
  storage.
- PostFast integrations (connected accounts) are fetched live from PostFast and
  cached in-process. PostFast is the source of truth.

---

## 4. Background work: Railway worker polling Appwrite (recommended)

**Recommendation: one Railway `worker` service (long-running Node process,
`pnpm worker`) that polls the Appwrite `jobs` table. Do not use Appwrite
Functions, and delete the `scheduler` service.**

Why not Appwrite Functions:

- The renderer needs node-canvas (native `canvas@3`), fabric, and the font
  files. Building native deps for Appwrite Function runtimes is fragile, and the
  existing `job-worker` copes by hand-copying `lib/` into the function. That is
  exactly the divergence problem.
- The owner wants compute on Railway, and the worker can import `lib/` directly.
  One renderer codebase serves web, API, and worker.
- Function limits (timeouts, cold starts, per-execution billing) add cost and
  failure modes without benefit.

Claim protocol. Appwrite has no compare-and-set, so the claim uses a
unique-id mutex:

1. Poll: `listRows(jobs, [equal(status,"queued"), lessThanEqual(run_at, now), orderAsc(run_at), limit(10), select([...no payload])])`,
   plus `equal(status,"running") & lessThan(lease_expires_at, now)` for stale
   leases.
2. Claim: `createRow(job_leases, "<jobId>.<attempt+1>", {...})`. A **409 means
   another worker won**; skip the job. This is atomic, unlike the old
   `updateRow`-then-`getRow` check.
3. `updateRow(jobs, id, {status:"running", attempt:attempt+1, worker_id, lease_expires_at: now+lease})`.
   Renew the lease while working on long renders.
4. Finish: `succeeded` with `result`, or on error either `queued` with
   exponential `run_at` backoff, or `dead` once `attempt >= max_attempts`.
   Handlers must be idempotent. A render writes files with deterministic ids
   `<renderId>-NN` and overwrites them on retry.

Polling cost. The memory notes record past Appwrite quota and read-limit pain.
To keep reads down:

- Use adaptive polling: drain while there is work, then back off from 1 s to a
  20 s idle interval. That is about 4.3k polls per idle day, roughly 260k reads
  a month at two queries per poll.
- Web requests that enqueue work can **wake** the worker, which removes most
  latency without polling faster. Use a Railway private-network HTTP `POST
  /wake` on the worker (no secret material; it only shortens the sleep).
- Small synchronous renders (`POST /api/v1/renders?wait=true`, ≤ N slides) can
  render inline in the web process and write the same `renders` row. The queue
  is for batches, publishing, and retries.

Periodic duties run in the same process (no `scheduler` service):

- Every minute, enqueue `deliver-notifications` and `sync-post` (poll PostFast
  status for `publishing` posts).
- Hourly, enqueue `purge` (hard-delete expired soft-deletes, orphan files, and
  old leases).
- Each sweep uses a deterministic job id such as `sweep-notify-<yyyymmddhhmm>`,
  so multiple worker replicas never double-run a tick: the second
  `createRow` returns 409.

Scheduling posts. PostFast's own `schedule` post type does the time-critical
posting. At schedule time the worker renders, if needed, uploads the media to
PostFast's signed upload URLs (`lib/postfast-media-upload.ts`, which pushes
bytes, so no public URL is required), and creates the PostFast post with
`scheduledAt`. Our worker therefore needs only minute-level precision, for
reminders and status sync.

---

## 5. Storage buckets and the media boundary

| bucket id | contents | max size | allowed extensions | settings |
|---|---|---|---|---|
| `media` | user uploads, collection images, user fonts | 25 MB | jpg, jpeg, png, webp, gif, avif, heic, mp4, mov, webm, otf, ttf, woff, woff2 | `fileSecurity:false`, permissions `[]`, encryption on, antivirus on, compression none |
| `renders` | rendered slides and spec thumbnails | 15 MB | png, jpg, jpeg, webp | `fileSecurity:false`, permissions `[]`, encryption on, compression none |

Two buckets are the minimum: input versus output, with different retention and
types. Free-tier bucket limits may apply. If the plan allows only one bucket,
collapse to a single `files` bucket. The tables already record `bucket_id`.

Public media boundary (unchanged principle: the buckets stay private):

- **`GET /api/files/[mediaOrRenderFileId]`** looks up the owning `media`/`renders`
  row, checks `workspace_id` against the caller's context, then streams
  `storage.getFileView`. It sets `Cache-Control: private` and a content-type
  from the row. This **fixes the current unauthenticated `local-assets`
  route**.
- **Thumbnails for the visual picker**: `GET /api/files/[id]/preview?w=480`
  uses `storage.getFilePreview` (Appwrite image transforms) with a long private
  cache. Check the Cloud plan's image-transformation quota.
- **Public share** (`/api/public/slideshows/[id]/slides/[index]`) verifies the
  HMAC share token, then streams the `renders` file. This is unchanged
  behaviour on a new backend.
- **Large or direct downloads** (optional): Appwrite **file tokens**
  (`tokens.createFileToken(bucketId, fileId, expire)`, about 15 min) give a
  short-lived direct URL without proxying bytes through Railway. Use them only
  if egress through the web service becomes a problem. They need the
  `tokens.write` scope. Confirm availability on the Cloud version.
- `node-appwrite` `getFileView`/`getFileDownload` return whole `ArrayBuffer`s
  and have no Range support. That is fine for images and fonts. Video Range
  streaming would need a raw `fetch` to the REST endpoint with the API key and
  a `Range` header. Videos are not a kept output type, so defer this.

---

## 6. Repository interface (storage-agnostic app code)

New module tree. Features import only `@/lib/data`.

```
lib/data/
  index.ts            # export getRepos(): Repos  (server-only)
  types.ts            # domain types + zod schemas (Spec, Render, Media, Post, …)
  context.ts          # WorkspaceContext = { workspaceId, actorId, via: "session"|"apikey", scopes }
  appwrite/
    client.ts         # Client/TablesDB/Storage singleton from env (reworked old lib/appwrite.ts)
    errors.ts         # old lib/appwrite-errors.ts + isConflict/isNotFound
    schema.mjs        # single declarative schema (tables, columns, indexes, buckets) — used by code AND provision script
    paginate.ts       # cursorAfter iterator, Query.select helpers
    specs.ts renders.ts media.ts collections.ts posts.ts notifications.ts
    settings.ts apiKeys.ts jobs.ts files.ts
  memory/             # in-memory implementation for unit tests (replaces railway mocks in lib/test-helpers.ts)
```

```ts
export interface Repos {
  specs: {
    list(ctx: Ctx, q?: { cursor?: string; limit?: number }): Promise<Page<SpecSummary>>
    get(ctx: Ctx, id: string): Promise<Spec | null>
    create(ctx: Ctx, input: NewSpec): Promise<Spec>
    update(ctx: Ctx, id: string, patch: SpecPatch): Promise<Spec>
    archive(ctx: Ctx, id: string): Promise<void>
  }
  renders: {
    create(ctx: Ctx, input: NewRender): Promise<Render>      // honours idempotency_key (409 → return existing)
    get(ctx: Ctx, id: string): Promise<Render | null>
    list(ctx: Ctx, q?: RenderQuery): Promise<Page<RenderSummary>>
    markRendering / markSucceeded(…, output) / markFailed(…, error)
    softDelete(ctx: Ctx, id: string): Promise<void>
  }
  media: {
    ingest(ctx: Ctx, input: { bytes: Buffer; mime: string; source: MediaSource; collectionId?: string; … }): Promise<Media>
    list(ctx: Ctx, q: { collectionId?: string | null; kind?: MediaKind; cursor?: string }): Promise<Page<Media>>
    get(ctx, id) / move(ctx, id, collectionId, position) / softDelete(ctx, id)
  }
  collections: { list, get, create, rename, pin, softDelete, restore }
  posts: { upsertIntent, get, listRange(ctx, from, to), listByRender, setStatus, cancel }
  notifications: { schedule, listForUser, markRead, cancelForPost }
  settings: { get(ctx), patch(ctx, patch) }
  apiKeys: { create(ctx, name, scopes) → { key, plaintext }, list, revoke, resolve(plaintext) → Ctx | null }
  jobs: { enqueue(input), get(ctx, id), claimBatch(workerId, n), renew, complete, fail }
  files: { put(bucket, fileId, bytes, mime), read(bucket, fileId), preview(...), remove(...) }
}
```

Rules:

- **Every method takes `ctx` explicitly.** The data layer never calls
  `getCurrentUser()`. This removes the hidden auth coupling in today's
  `json-store.ts`. `lib/auth.ts` gains `requireWorkspace()`, which reads Clerk
  `auth()` → `{ userId, orgId }`, and `resolveApiKey(req)`. Both return a
  `Ctx`.
- Only `lib/data/appwrite/*` imports `node-appwrite`. A lint rule
  (`no-restricted-imports`) enforces this.
- Rows are mapped to typed domain objects in the repository, and JSON columns
  are validated with zod on read. A bad row raises a typed error; it does not
  return `null` silently.
- The memory implementation is the default in `vitest.setup.ts`. A
  `test:live` suite runs the same contract tests against the local Appwrite
  project. This follows the standing instruction in memory to always run live
  tests.

---

## 7. Environment variables

New (all server-only; never `NEXT_PUBLIC_`):

| var | example | used by |
|---|---|---|
| `APPWRITE_ENDPOINT` | `https://<region>.cloud.appwrite.io/v1` (local: `http://localhost:9080/v1`) | web, worker, scripts |
| `APPWRITE_PROJECT_ID` | `lumenclip-prod` | web, worker, scripts |
| `APPWRITE_API_KEY` | (secret) | web, worker, scripts |
| `APPWRITE_DATABASE_ID` | `lumenclip` (default) | web, worker, scripts |
| `APPWRITE_BUCKET_MEDIA` | `media` (default) | web, worker |
| `APPWRITE_BUCKET_RENDERS` | `renders` (default) | web, worker |
| `LUMENCLIP_SECRETS_KEY` | 32-byte base64 | only if per-workspace PostFast keys |
| `WORKER_WAKE_URL` | `http://worker.railway.internal:8080/wake` | web (optional) |

Kept: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `POSTFAST_API_KEY`
(unless moved per workspace), `SLIDESHOW_SHARE_SECRET`, `PEXELS_API_KEY`,
and the Pinterest search vars.

Removed: `DATABASE_URL`, `PG_BOSS_SCHEMA`, `RAILWAY_BUCKET_NAME`,
`RAILWAY_BUCKET_ENDPOINT`, `RAILWAY_BUCKET_REGION`,
`RAILWAY_BUCKET_ACCESS_KEY_ID`, `RAILWAY_BUCKET_SECRET_ACCESS_KEY`, the generic
S3 fallbacks (`AWS_S3_BUCKET_NAME`, `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_S3_URL_STYLE`, `BUCKET`,
`ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`),
`LUMENCLIP_DATA_BACKEND`, `LUMENCLIP_ASSET_BACKEND`, `LUMENCLIP_SYSTEM_OWNER_ID`,
`LUMENCLIP_MCP_OWNER_ID`, and all Telegram, OpenRouter, Langfuse, FAL, KIE,
Rendi, ElevenLabs, and DeepL keys (owned by other refactor docs).

`lib/server-env.ts` (t3 env) declares the new vars as required on the server.
`scripts/check-env.mjs` checks them without printing values.

---

## 8. Provisioning script

Replace `scripts/provision-consolidated-stores.mjs` with
**`scripts/appwrite-provision.mjs`** (`pnpm appwrite:provision`). It reads the
single declarative `lib/data/appwrite/schema.mjs`.

Behaviour (idempotent and safe to re-run):

1. Load env from `--env-file` (default `.env.local`). Print the endpoint, the
   project id, and **never the key**.
2. `GET /health/version`. Warn if it differs from the version the code was
   tested on.
3. Get or create the database `lumenclip`.
4. For each table: get or create it with `rowSecurity:false` and permissions
   `[]`.
   - **Columns.** Create missing columns. For existing ones, compare type,
     size, required, and array. A mismatch is **reported, not altered**; exit
     code 2 under `--check`.
   - **Wait** until every column is `available`. Use the existing
     `waitForColumns` loop, which polls `getTable` and fails on
     `failed`/`stuck`.
   - **Indexes.** Create missing indexes after the columns are available. A
     definition mismatch is reported.
5. For each bucket: create it, or `updateBucket` so size, extensions,
   encryption, antivirus, and `fileSecurity:false`/`[]` match the declaration.
6. Flags: `--dry-run` (plan only), `--check` (CI drift gate; nonzero on drift),
   `--prune` (list undeclared columns, indexes, and tables; delete only with
   `--prune --yes`).
7. Treat 409 conflicts as "already exists". Retry 429 and 5xx with backoff.

Required API key scopes for the provisioning key: `databases.read/write`,
`tables.read/write`, `columns.read/write`, `indexes.read/write`,
`buckets.read/write`. The runtime key needs only `rows.read/write`,
`files.read/write` (+ `tokens.write` if file tokens are used). Older scope
names (`collections.*`, `attributes.*`, `documents.*`) still exist on some
versions, so the doc for the owner lists both. Use **two keys**: a broad one
for provisioning (kept local or in CI) and a narrow one in Railway.

---

## 9. Local development (shared stack `~/appwrite-local`, port 9080)

1. `node ~/appwrite-local/ensure.mjs` starts or verifies the shared 1.9.5
   stack. It runs no functions executor, which is fine because nothing runs as
   an Appwrite Function anymore.
2. `pnpm appwrite:local:setup` (new `scripts/appwrite-local-setup.mjs`) uses
   the local console credentials in `~/appwrite-local/bootstrap.json` to create
   a **fresh project `lumenclip-local`** and a server key with the scopes
   above. It writes `APPWRITE_*` into the ignored `.env.local` without echoing
   values, then runs `appwrite:provision`. Do not reuse `cfarm-local`: it holds
   the old polymorphic schema and data.
3. `pnpm dev:web` and `pnpm worker` both read `.env.local`.
4. Tests use the memory repos by default. `pnpm test:live` targets a second
   local project, `lumenclip-test`, which is truncated per run.

Recovered helpers worth porting: `git show eab6a0a^:scripts/setup-local-appwrite.mjs`
(project and key bootstrap) and the 1.9.x quirks in memory. For example,
`InputFile` is imported from `node-appwrite/file` (`dist/inputFile.mjs`) when
scripting outside the repo.

---

## 10. What to delete

Code:

- `lib/railway/` (all: `database.ts`, `schema.ts`, `schema.test.ts`,
  `domain-record-store.ts`, `job-queue.ts`, `object-storage.ts`,
  `object-storage.test.ts`, `storage-response.ts`)
- `drizzle.config.ts`, `infra/railway/` (migrations `0001`–`0004`; the
  `infra/` dir becomes empty)
- `scripts/railway-migrate.mts`, `scripts/provision-consolidated-stores.mjs`,
  `scripts/clone-appwrite-schema.mjs`, `scripts/prune-appwrite-schema.mjs`,
  `scripts/sync-function-shared.mjs`, `scripts/run-railway-function.test.ts`,
  and the removed-feature scripts that use Railway
  (`attach-astrology-product-sales-inspirations.mts`,
  `import-amazon-home-improvement-products.mts`)
- `lib/json-store.ts`, `lib/store-identity.ts`, `lib/consolidated-records.ts`
  (+ tests), `lib/asset-storage.ts`, `lib/local-asset-download.ts`,
  `lib/post-repository.ts`, `post-repository-store.ts`,
  `post-repository-config.ts`, `post-repository-errors.ts` (+ tests),
  `lib/output-publications.ts`, `lib/queue.ts` (rewritten in `lib/data`),
  `lib/usage-ledger.ts`, `lib/system-owner-context.ts`,
  `lib/workspace-members.ts` and `app/api/settings/team/*` (if Clerk orgs),
  `lib/pipeline-domain-storage.ts`
- `app/api/local-assets/[...assetPath]/` (replaced by `/api/files/[id]`),
  `app/api/public/videos/` (video output removed)
- `appwrite/` (whole dir: `functions/job-worker`, `functions/template-scheduler`,
  `functions/deploy.mjs`), `appwrite.json`
- Railway-specific mocks in `lib/test-helpers.ts` and `vitest.setup.ts`

package.json:

- Scripts: remove `railway:db:migrate`, `railway:db:generate`,
  `railway:db:studio`, and `products:import:home-improvement`. Add
  `appwrite:provision`, `appwrite:check`, `appwrite:local:setup`, and `worker`.
- Dependencies: remove `drizzle-orm`, `drizzle-kit`, `postgres`, `pg-boss`,
  `@aws-sdk/client-s3`, and `@aws-sdk/s3-request-presigner`. Add a pinned
  `node-appwrite`.

Config and docs:

- `railway.worker.json`: rewrite for the continuous worker (`startCommand:
  pnpm worker`, no cron, `restartPolicyType: ON_FAILURE`).
- Retire the `scheduler` Railway service.
- `.env.example`: apply the section 7 changes.
- Rewrite `docs/data/backend-architecture.md` and
  `docs/reference/railway-worker-operations.md`.
- Update `README.md` and `docs/libraries/index.md`.

---

## 11. AGENTS.md changes

Replace the section **"Railway backend and Clerk authentication"** with:

```md
# Appwrite data, Railway compute, Clerk auth

LumenClip runs its web app and worker on the Railway project `lumenclip`;
data and files live in Appwrite Cloud; Clerk owns browser authentication.

- Railway services: `web` (Next.js) and `worker` (job poller + periodic sweeps).
  There is no scheduler service and no Appwrite Function.
- Appwrite Cloud TablesDB (database `lumenclip`) is the runtime source of
  truth; Appwrite Storage buckets `media` and `renders` hold all binaries.
  Use TablesDB rows (not Databases/documents).
- Schema is declared in `lib/data/appwrite/schema.mjs` and applied with
  `pnpm appwrite:provision` (idempotent; `pnpm appwrite:check` must pass in CI).
  Never create columns or buckets by hand in the console.
- Only `lib/data/appwrite/*` may import `node-appwrite`. Feature code uses the
  `@/lib/data` repositories and passes an explicit workspace context.
- Tables and buckets have no Appwrite permissions; only the server API key can
  access them. Ownership (`workspace_id` = Clerk org id or user id) is enforced
  by the repositories. Buckets stay private: owner-checked app routes and
  HMAC-signed share links are the only public media boundary.
- Clerk is the only auth/session boundary (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`); do not use Appwrite Auth, Appwrite client SDKs, or
  recreate password/session APIs. API and MCP callers use hashed `api_keys`.
- Local work: `node ~/appwrite-local/ensure.mjs`, `pnpm appwrite:local:setup`,
  then `pnpm dev:web` / `pnpm worker` against project `lumenclip-local`.
- Do not reintroduce Postgres, drizzle, pg-boss, S3 clients, or Railway buckets.
- Production changes must deploy and verify every affected Railway service and
  run `pnpm appwrite:check` against production.
- Never print Appwrite API keys, Clerk secrets, or env JSON. Keep local secrets
  in ignored env files.
```

The **workflow run viewer** section (and
`docs/reference/workflow-inspector-design-contract.md`) mostly stops applying
once automations and workflow runs are removed. The parts worth keeping are
generic UI rules: shared `Button`/`IconButton`/`Tabs`, button sizing, headings
without subtitles, and "history is read-only; re-running creates a new run",
which maps onto immutable `renders`. Recommend shrinking it to a short "Render
detail view" contract: render header (back, identity, status, `Render again`),
then slide strip, then `Input` (resolved spec + bound media) and `Result`
(rendered slides), then collapsed `Raw render data`. The UI refactor doc should
own that decision.

---

## 12. Manual steps for the owner in Appwrite Cloud

Agents cannot create accounts or handle secrets, so these steps are yours.

1. Sign in or sign up at cloud.appwrite.io. Choose a plan: **Pro** is
   recommended. Free projects pause when inactive and have tight bandwidth,
   storage, read, and bucket limits.
2. Create an organization if needed, then a **project**: name `LumenClip`,
   project id `lumenclip-prod`. Pick the region closest to the Railway region
   to cut latency on every query.
3. In the project, **do not enable any Auth methods** and add **no Web/Platform
   origins**. No browser talks to Appwrite. Optionally disable unused services
   (Functions, Messaging, Sites) under project settings.
4. Create **two API keys** (Overview → Integrations → API keys):
   - `provision`: databases/tables/columns/indexes/buckets read+write, with a
     short expiry. Use it locally or in CI for `pnpm appwrite:provision`.
   - `runtime`: rows read+write and files read+write (+ tokens write if direct
     download tokens are wanted), with no expiry or yearly rotation.
5. Run the provision script yourself from a trusted shell, or let an agent run
   it once the key is in an ignored `.env.production.local`. The agent must not
   echo it:
   `pnpm appwrite:provision --env-file .env.production.local`.
6. In **Railway** (`web` and `worker` services), set `APPWRITE_ENDPOINT`,
   `APPWRITE_PROJECT_ID`, and `APPWRITE_API_KEY` (the runtime key). Bucket and
   database ids may be left at their defaults. Then remove `DATABASE_URL` and
   all `RAILWAY_BUCKET_*` variables. After cutover is verified, delete the
   Railway Postgres service and the `lumenclip-assets` bucket. That deletion is
   irreversible and the old data is abandoned, per "fresh start".
7. If adopting Clerk Organizations, enable **Organizations** in the Clerk
   dashboard (and personal workspaces if solo use should keep working).
8. Optionally set a spend cap or budget alerts in Appwrite billing, given the
   past quota incidents.

---

## 13. Open questions for the owner

1. **Workspaces**: adopt Clerk Organizations (recommended), or keep the custom
   email-invite sharing on an Appwrite table?
2. **PostFast**: keep one global `POSTFAST_API_KEY` (single-tenant, as today),
   or let each workspace connect its own PostFast key (stored encrypted in
   `workspace_settings`)? This decides whether the SaaS is multi-tenant for
   publishing.
3. **"TikTok publishing"**: today TikTok posting goes only through PostFast
   (no direct TikTok Content Posting API in the code). Is PostFast-TikTok
   enough?
4. **Notifications**: Telegram is removed. Is in-app plus calendar enough, or
   should email (for example via Clerk or Resend) be a channel?
5. **Metering**: does the public render API need usage limits or billing
   (a `usage_events` table and per-key rate limits)?
6. **Retention**: how long to keep renders and their files (for example, delete
   files 90 days after render unless a post references them)?
7. **Video in collections**: keep video uploads in `media` at all, given that
   output is image-only slideshows?

## 14. Risks

- **No transactions in our usage and no compare-and-set.** Every multi-row
  write (render row + files, collection `item_count`) must be idempotent and
  sweep-repairable. The `job_leases` unique-id mutex is the only lock.
- **Read/bandwidth quotas.** This app previously hit Appwrite quota errors.
  Mitigations: `Query.select`, adaptive worker polling, in-process caching of
  settings and API-key lookups (short TTL), and surfacing quota errors as a
  distinct error (reuse `appwrite-errors.ts`) rather than as an empty result.
- **Version skew.** The local stack is 1.9.5 and the Cloud version may differ.
  Pin `node-appwrite` to what Cloud supports and run `appwrite:check` and
  `test:live` against both.
- **Proxying media through Railway** costs egress and latency for large
  galleries. Use preview thumbnails and caching headers, with file tokens as an
  escape hatch.
- **Index limits.** Appwrite caps index count and key length per table, and
  string columns in an index count toward the row-size limit. Keep indexed
  strings small (ids ≤ 64) and never index longtext.
- **Cross-region latency.** Each repository call is an HTTPS round trip, unlike
  the old in-network Postgres. Batch with `Query.equal("$id", [...ids])`. Avoid
  N+1 patterns such as the current `appendJsonArrayRecords`, which does one
  `getRow` per record.
- **Fresh start.** Existing production data (collections, scheduled posts) is
  abandoned. Confirm nothing scheduled in PostFast still depends on old ids
  before cutover.
