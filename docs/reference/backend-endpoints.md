---
title: "Backend endpoints"
---

Canonical inventory of the internal Next.js route-handler API under `app/api`.
This is an application API for the LumenClip browser client and workers; it is not a
versioned public API. The planned external agent surface is documented
separately in [the MCP roadmap](../roadmap/lumenclip-mcp-server.md).

Inventory verified against the working tree on 2026-07-18: **62 route files and
86 method handlers**.

## Global contract

- `proxy.ts` requires an Appwrite session for all `/api/**` routes except
  `/api/auth/**` and the read-only `/api/search` documentation index.
- Authentication uses the HTTP-only `lumenclip-session` cookie.
- JSON is the default request/response format. Upload endpoints use
  `multipart/form-data`; demo and asset-view endpoints may return bytes.
- Success responses use named top-level fields such as `{ automation }`,
  `{ collections }`, or `{ runs }`. There is no universal success envelope.
- Failures use `{ error: string }` unless a binary endpoint returns a plain
  `Response`.
- `withHandler()` maps `ApiError` to its declared status and hides unexpected
  errors behind a generic 500. Routes not yet using it contain local error
  mapping.
- Provider-backed routes may return 502/503 for upstream or missing-provider
  failures. Generation calls can be slow and are not uniformly job-backed yet.
- IDs in a dynamic path are URL encoded. Date/time inputs are ISO 8601 unless a
  route explicitly says otherwise.

Legend:

- **Current** — used by a current UI or worker flow.
- **Internal** — operational/debug surface; not a normal product API.
- **Legacy** — retained compatibility path with a newer canonical replacement.
- **Broken** — route exists but cannot currently compile or execute as written.

## Authentication

These public API routes manage authentication.

| Method and path                       | Input                                                                                | Response / behavior                                                  | State   |
| ------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------- |
| `POST /api/auth/register`             | JSON `{ name, email, password }`; password requires 8+ chars, a letter, and a number | `201 { ok, verificationSent }`; creates user/session and sets cookie | Current |
| `POST /api/auth/login`                | JSON `{ email, password }`                                                           | `{ ok }`; sets session cookie                                        | Current |
| `POST /api/auth/logout`               | Session cookie if present                                                            | `{ ok }`; revokes session best-effort and clears cookie              | Current |
| `POST /api/auth/verification/confirm` | JSON `{ userId, secret }`                                                            | `{ ok }`                                                             | Current |
| `POST /api/auth/verification/resend`  | Session cookie                                                                       | `{ ok, alreadyVerified? }`                                           | Current |

## Documentation search

| Method and path   | Input         | Response / behavior                                     | State   |
| ----------------- | ------------- | ------------------------------------------------------- | ------- |
| `GET /api/search` | Query `query` | Public read-only Orama index generated from `docs/**/*` | Current |

## Automations and templates

| Method and path                            | Input                                                                                | Response / behavior                                                           | State   |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------- |
| `GET /api/automation-templates`            | None                                                                                 | Template records, summaries, example runs, and schema map                     | Current |
| `POST /api/automation-templates`           | JSON array or `{ templates }` / `{ automations }` containing ReelFarm-shaped exports | Imports normalized templates; `201`                                           | Current |
| `GET /api/automations`                     | None                                                                                 | `{ records, automations }`                                                    | Current |
| `POST /api/automations`                    | JSON `{ name?, automationKind?, schema?, template?, overrides? }`                    | Creates a local automation; raw imports are rejected; `201`                   | Current |
| `PATCH /api/automations`                   | JSON `{ id, name?, status?, favorite?, schema? }`                                    | `{ record, automation }`; `409` when a published hook is removed or renamed   | Current |
| `DELETE /api/automations/[id]`             | Path ID                                                                              | Cascades through runs, slideshow results, and local publication records       | Current |
| `POST /api/automations/hooks`              | JSON `{ automationId }`                                                              | Generates and persists a fresh hook set; rejects missing/exhausted inputs     | Current |
| `POST /api/automations/video-copy`         | JSON `{ automationId, template?, hook?, items?, segmentRoles? }`                     | Generated/fallback title, caption, hashtags, substitutions, and per-item text | Current |
| `POST /api/automations/run`                | JSON `{ automationId, force: true, now?, requestId? }`                               | Runs one interactive generation and returns created/results/skipped           | Current |
| `GET /api/automations/runs`                | Query `automationId?`, `limit?`                                                      | Unified run views, including generated-video-backed runs                      | Current |
| `GET /api/automations/[id]/hook-analytics` | Path automation ID                                                                   | Published hook lock state and aggregated metric rows                          | Current |

An interactive `/automations/run` call is the manual generation path. Scheduled
execution is driven by the scheduler/worker and is not exposed as a browser
endpoint.

## Slideshows, results, and generated videos

| Method and path                     | Input                                                                            | Response / behavior                                                                 | State   |
| ----------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| `GET /api/slideshows`               | Query `id?`, `limit?`                                                            | `{ slideshows, slideshowsCount, videosCount }` derived from result outputs          | Current |
| `POST /api/slideshows`              | `CreateSlideshowInput` JSON                                                      | Creates a slideshow-compatible `ResultRecord`; `201 { slideshow, result }`          | Current |
| `GET /api/slideshows/[id]`          | Path slideshow ID                                                                | Images available from the automation's configured collections                       | Current |
| `PATCH /api/slideshows/[id]`        | Action JSON: `removeSlide`, `replaceImage`, `updateMetadata`, or `markPublished` | Updated slideshow/run; blocks edits to scheduled/published content                  | Current |
| `DELETE /api/slideshows/[id]`       | Path slideshow ID                                                                | Deletes eligible result/run/publication records; blocks scheduled/published content | Current |
| `GET /api/results`                  | Query `id?`, `automationId?`, `runId?`, `limit?`                                 | `{ results, resultsCount }`                                                         | Current |
| `GET /api/generated-videos`         | Query `type?`, `automationId?`, `limit?`                                         | `{ exports }` plus deletion-block reason                                            | Current |
| `POST /api/generated-videos`        | JSON generated-video create payload                                              | Creates queued/ready export; `201`                                                  | Current |
| `PATCH /api/generated-videos`       | JSON `{ id, status, previewUrl?, videoUrl?, error? }`                            | Updates processing state                                                            | Current |
| `PATCH /api/generated-videos/[id]`  | JSON `{ action: "markPublished" }`                                               | Records manual publication time                                                     | Current |
| `DELETE /api/generated-videos/[id]` | Path ID                                                                          | Deletes unless scheduled or published                                               | Current |

## Collections and reusable assets

| Method and path                              | Input                                                                           | Response / behavior                                             | State                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/image-collections`                 | None                                                                            | `{ collections }`                                               | Current                                                            |
| `POST /api/image-collections`                | `StoredImageCollection` JSON                                                    | Upserts by normalized collection name; `201`                    | Current                                                            |
| `POST /api/image-collections/delete-preview` | JSON `{ collections: [{ name, created_at }] }`                                  | Counts media and lists dependent automations/templates          | Current                                                            |
| `DELETE /api/image-collections`              | JSON `{ collections: [{ name, created_at }] }`                                  | Soft-deletes for 30 days; unreferenced files purge after expiry | Current                                                            |
| `POST /api/image-collections/import`         | JSON `{ collectionName?, collectionCreatedAt?, mediaType?, images[] }`          | Downloads, hashes, deduplicates, and adds up to 80 items; `201` | Current                                                            |
| `POST /api/image-collections/captions`       | Collection JSON plus optional `image_index`                                     | Captions one/all images through OpenRouter and saves collection | Current                                                            |
| `POST /api/image-collections/image-actions`  | JSON `{ mode, imageUrl, prompt?, upscaleFactor? }`; mode is `edit` or `upscale` | KIE edit/upscale result                                         | Current                                                            |
| `GET /api/product-collections`               | None                                                                            | `{ collections }`                                               | Current, read-only                                                 |
| `GET /api/word-collections`                  | None                                                                            | `{ collections }`                                               | Current                                                            |
| `POST /api/word-collections`                 | JSON `{ id?, name, description?, words?, source? }`                             | Upserts variable collection; `201`                              | Current                                                            |
| `DELETE /api/word-collections/[id]`          | Path ID                                                                         | `{ collection }`                                                | Current                                                            |
| `GET /api/assets`                            | Query `scope?`, `category?`, `kind?`                                            | `{ assets }`                                                    | Current                                                            |
| `POST /api/assets/upload`                    | Multipart `file`, optional `scope`, `category`, `name`                          | Persists asset metadata/file; `201`                             | Current                                                            |
| `POST /api/assets/caption`                   | JSON `{ id, caption }`                                                          | Updates asset caption                                           | Current                                                            |
| `GET /api/media-library`                     | None                                                                            | Runtime media-library assets from `loadRealFarmData()`          | Current                                                            |
| `POST /api/local-assets/upload`              | Multipart MP3/WAV `file`                                                        | Stores audio and registers a media-library entry                | Current                                                            |
| `GET /api/local-assets/[...assetPath]`       | Asset path; optional HTTP Range header                                          | Streams deterministic Appwrite Storage object                   | Current                                                            |

The former `/api/assets/reference-import` and `/api/characters/**` families were
removed with the character/UGC workspace. They are intentionally absent from
the current inventory.

## Discovery and media proxying

| Method and path              | Input                                                         | Response / behavior                                                         | State   |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| `GET /api/pexels/search`     | Query `query`, `limit?` (max 80)                              | Pexels results or deterministic fallback results                            | Current |
| `POST /api/pexels/search`    | JSON `{ query }` (or first array item), query `limit?`        | Same as GET                                                                 | Current |
| `GET /api/pinterest/search`  | Query `query`, `limit?` (max 100)                             | Pinterest import results                                                    | Current |
| `POST /api/pinterest/search` | JSON `{ query, mode? }` (or first array item), query `limit?` | Pinterest import results                                                    | Current |
| `GET /api/image-proxy`       | Query `url`                                                   | SSRF-guarded image bytes; supported image MIME only, redirect and size caps | Current |

## Calendar and analytics

| Method and path                            | Input                                                                                                          | Response / behavior                                                            | State                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `GET /api/calendar`                        | Query `from?`, `to?`, repeated/comma filters: `accounts`, `platforms`, `statuses`, `automations`, `sourceType` | Merged projections, jobs, local publications, and PostFast posts plus summary  | Current                                                                        |
| `PATCH /api/calendar/items/[id]`           | Local post ID and `{ scheduledAt }` future ISO timestamp                                                       | Recreates the remote schedule from the stored publication snapshot             | Current                                                                        |
| `DELETE /api/calendar/items/[id]`          | Local post ID or `postfast:<remoteId>`                                                                         | Cancels scheduled PostFast post and deletes local publication record           | Current                                                                        |
| `GET /api/calendar/summary`                | None                                                                                                           | `{ summary: { needsAction, failed } }` for sidebar polling                     | Current                                                                        |
| `GET /api/analytics/report`                | Query `days?` (1–365), comma-separated `integrationIds?`                                                       | Integrations, metric snapshots, follower snapshots, capability map             | Current                                                                        |
| `POST /api/analytics/report`               | JSON `{ integrationIds?: string[], days? }`                                                                    | Triggers analytics synchronization for selected/all accounts                   | Current                                                                        |
| `GET /api/tiktok-studio-analytics`         | Query `importId` or `batchId`                                                                                  | Polls an owner-scoped Studio capture or account-wide batch                     | Current                                                                        |
| `POST /api/tiktok-studio-analytics`        | `start` or `start_batch` with account IDs and scope                                                            | Queues a capture and returns a device connection payload for the web-to-extension bridge | Current |
| `GET /api/tiktok-studio-analytics/capture` | Bearer device credential                                                                                       | Returns the newest pending, explicitly allowlisted capture manifest             | Current |
| `OPTIONS                                   | POST /api/tiktok-studio-analytics/capture`                                                                     | Bearer device credential plus `{ captureId, studioUrl, payload }`; maximum 2.5 MB | Chrome-companion CORS intake; job allowlist, URL, and returned ID must match | Current |

## PostFast accounts and publishing

| Method and path                     | Input                                                                                                           | Response / behavior                                                            | State   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| `GET /api/postfast/connect-url`     | Query `expiryDays?` (1–30)                                                                                      | `{ url }` for PostFast account connection                                      | Current |
| `GET /api/postfast/integrations`    | None                                                                                                            | Active and locally disconnected integrations; tokens omitted                   | Current |
| `DELETE /api/postfast/integrations` | JSON `{ integrationId }`                                                                                        | Locally disconnects account and removes it from automations                    | Current |
| `POST /api/postfast/integrations`   | JSON `{ integrationId }`                                                                                        | Restores a locally disconnected account                                        | Current |
| `GET /api/postfast/posts`           | Query `startDate?`, `endDate?`, `page?`, `limit?`                                                               | Enriched PostFast posts; returns `configured:false` when key is absent         | Current |
| `POST /api/postfast/posts`          | JSON `{ sourceType, sourceId, integrationId, provider, content, media?, type?, date?, releaseUrl?, settings? }` | Creates draft/schedule/now post, manual reminder, or manual-published evidence | Current |
| `POST /api/postfast/upload`         | Multipart `file` or JSON `{ url }`                                                                              | Uploads image/video to PostFast signed storage; returns `{ upload }`           | Current |

`type` for post creation is `draft | schedule | now | manual | manual_posted`.
Manual and manual-posted records are stored as output publications without
calling PostFast's create-post endpoint.

## X and Threads automation

| Method and path                             | Input                                                     | Response / behavior                                                              | State   |
| ------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------- |
| `GET /api/x-automations`                    | None                                                      | `{ automations }`                                                                | Current |
| `POST /api/x-automations`                   | JSON `{ name?, platform? }`; platform is `x` or `threads` | Creates automation; `201`                                                        | Current |
| `PATCH /api/x-automations`                  | Full automation or `{ automation }`                       | Normalizes and upserts automation                                                | Current |
| `DELETE /api/x-automations/[id]`            | Path ID                                                   | `{ deleted }`                                                                    | Current |
| `POST /api/x-automations/[id]/derive-brief` | Path ID                                                   | Derives niche strategy and persists it                                           | Current |
| `POST /api/x-automations/discover`          | JSON `{ automationId, query?, source? }`                  | Trend candidates from configured discovery source                                | Current |
| `GET /api/x-automations/generate`           | Query `automationId?`                                     | `{ runs }`                                                                       | Current |
| `POST /api/x-automations/generate`          | JSON `{ automationId, topic?, sourceCandidate? }`         | Generates and persists a draft run; `201`                                        | Current |
| `DELETE /api/x-automations/generate`        | Query `automationId`                                      | Deletes runs and resets recent-use memory                                        | Current |
| `POST /api/x-automations/image`             | JSON `{ runId, prompt?, aspectRatio? }`                   | Generates a KIE image, persists it in Storage, and attaches it to the run; `201` | Current |
| `POST /api/x-automations/publish`           | JSON `{ runId }`                                          | Publishes through configured integration(s) and updates run status               | Current |

## Settings and team data

| Method and path                  | Input                                                | Response / behavior                                   | State   |
| -------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- | ------- |
| `GET /api/settings/demos`        | None                                                 | `{ demos }` for current owner                         | Current |
| `POST /api/settings/demos`       | Multipart video `file`, optional `title`; max 250 MB | Stores demo and metadata; `201`                       | Current |
| `GET /api/settings/demos/[id]`   | Path ID                                              | Private video bytes for owner                         | Current |
| `GET /api/settings/team`         | None                                                 | `{ members }` for current workspace owner             | Current |
| `POST /api/settings/team`        | JSON `{ email }`                                     | Sends invitation and creates membership record; `201` | Current |
| `POST /api/settings/team/accept` | JSON `{ teamId, membershipId, userId, secret }`      | Accepts Appwrite team invitation                      | Current |

## Backend-only and development endpoints

| Method and path                           | Input                                                                       | Response / behavior                                         | State                                             |
| ----------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `POST /api/linkedin-automations/generate` | JSON containing `niche` plus optional brief/persona/plan/model/count inputs | Stateless LinkedIn generation; no persistence or scheduler  | Internal preview                                  |
| `POST /api/debug/automation-preview`      | Automation/schema JSON plus optional `now`, `textModel`                     | Produces an automation plan without saving a run            | Internal; authenticated but not environment-gated |
| `POST /api/debug/dump`                    | JSON `{ name, data }`                                                       | Writes JSON to OS temp directory and returns local path     | Internal; authenticated but not environment-gated |
| `GET /api/temp/testing-center/models`     | None                                                                        | Cached OpenRouter structured-output model list              | Internal testing center                           |
| `POST /api/temp/testing-center/generate`  | JSON `{ automationId, model, systemPrompt?, promptInstructions? }`          | Runs template text generation and returns plan/debug result | Internal testing center                           |

Development routes should not be treated as stable integrations. Before public
deployment, the two `/api/debug/**` handlers should be explicitly disabled in
production or restricted to an administrative capability.

## Maintaining this inventory

When adding, changing, or deleting a route:

1. Update this file in the same change.
2. Update [data-objects.md](data-objects.md) if request handling creates a new
   persistent shape or changes lifecycle semantics.
3. Update [backend-architecture.md](backend-architecture.md) if a physical table,
   `source_key`, bucket, worker, or provider boundary changes.
4. Update the relevant `docs/tabs/**` file when the browser workflow changes.
5. Put unshipped endpoint designs in `docs/roadmap/**`; do not describe them
   here as current behavior.
