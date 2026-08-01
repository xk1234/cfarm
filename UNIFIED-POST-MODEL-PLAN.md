# Unify Post Model: Design and Staged Implementation Plan

Status: Phase 1 design only. This document proposes code and data changes; it does not apply them.

## Executive recommendation

Create a dedicated, owner-scoped `posts` table whose rows represent distribution
instances, not generated files. Keep `outputs` as the artifact/render store and
keep metric and follower snapshots as time-series stores. A generated output can
have zero, one, or several posts; an imported external post can have a post
without an output. Every analytics, calendar, and dashboard reader should
eventually read the `posts` repository.

The first shippable change should not wait for the table migration. Introduce a
canonical `Post` domain type and repository adapter over the current
`outputs.publications` storage, then make TikTok Studio cloud sync and generic
PostFast analytics sync call an idempotent `ensurePostForSnapshot` before
writing a snapshot. That closes the current `0 publications / 1 snapshot` gap
and lets the existing analytics join work. The second change should remove
Studio's “publication must already exist” precondition by resolving or creating
the post from `(owner, provider, integration, externalPostId)`.

The dedicated table, writer convergence, backfill, reader cutover, and legacy
removal then follow as reversible stages. Do not put the canonical model back
inside an output JSON array: the nesting is the reason external imports have no
natural home and why every update currently rewrites publication arrays across
all of an owner's outputs.

## 1. Current model inventory

### 1.1 Physical stores and ownership

The application is Appwrite-only; the JSON-store abstraction has no filesystem
fallback (`lib/json-store.ts:47-50`). Logical stores are routed to consolidated
tables in `lib/appwrite-stores.ts:14-104`:

| Logical data | Physical table / record kind | Relevant mapping |
| --- | --- | --- |
| Generated results | `outputs`, `kind=result` | `lib/appwrite-stores.ts:50-55` |
| Generated video exports | `outputs`, `kind=generated_video` | `lib/appwrite-stores.ts:99-104` |
| X automation runs | `outputs`, `kind=x_automation_run` | `lib/appwrite-stores.ts:34-39` |
| Automation runs | `automation_runs` | `lib/appwrite-stores.ts:31-33` |
| Post metrics | `postfast_metric_snapshots` | `lib/appwrite-stores.ts:62` |
| Account followers | `account_follower_snapshots` | `lib/appwrite-stores.ts:98` |
| Studio imports and batches | `permanent_assets` | `lib/appwrite-stores.ts:63-71` |

Every logical record is stored in an owner-scoped Appwrite document whose
deterministic document ID incorporates the owner (`lib/appwrite-stores.ts:186-195`;
`lib/json-store.ts:475-518`). Normal authenticated writes resolve the current
owner; system-owned jobs can set an explicit owner
(`lib/json-store.ts:562-574`). Generic JSON reads can include workspace-shared
owners (`lib/json-store.ts:349-357`). By contrast,
`lib/output-publications.ts:284-295` resolves one exact owner for its direct
output query. The unified repository must make this ownership/share behavior
explicit and consistent.

### 1.2 `outputs` rows

The provisioned `outputs` schema contains these persisted fields
(`scripts/provision-consolidated-stores.mjs:35-68`):

- Identity/ownership: `rid`, `owner_id`, `source_key`.
- Generic display/state: `name`, `status`, `created_raw`, `data`, `ord`.
- Output classification: `kind`, `subtype`, `storage_class`, `origin`.
- Content: `title`, `hook`, `caption`, `hashtags`, `text`, `text_data`.
- Source relation: `source_automation_id`, `source_run_id`,
  `source_entity_id`.
- Media/publication summary: `has_video`, `publication_status`,
  `scheduled_at`, `published_at`, `primary_post_id`,
  `primary_release_url`, `publications`.
- Diagnostics/migration: `evaluation`, `error`, `updated_at`,
  `migration_source`.

`data` is the complete serialized domain object. The other columns are
projections for filtering and display. `publications` is a JSON string
containing an array of `PostFastPostRecord`. The owner/source/publication/source
ID indexes are provisioned at
`scripts/provision-consolidated-stores.mjs:97-147`.
`lib/consolidated-records.ts:20-79` computes the columns; result and generated
video media are extracted at `lib/consolidated-records.ts:139-164` and hydrated
back into the domain object at `lib/consolidated-records.ts:186-227`.

For a normal generated slideshow result:

- The domain `ResultRecord.id` defaults to `result-${runId}`
  (`lib/results.ts:161-189`).
- `automationId` and `runId` are stored in `source_automation_id` and
  `source_run_id`.
- `artifacts.slideshowId` becomes `source_entity_id`
  (`lib/consolidated-records.ts:306-313`).
- A publication may instead identify the same thing as
  `sourceType="automation", sourceId=runId`, or as
  `sourceType="slideshow", sourceId=slideshowId`. This is the source of the
  current alias and prefix-matching logic.

For generated videos, the export ID is the output identity/source entity, while
`sourceAutomationId` and `sourceRunId` are projected into the corresponding
columns (`lib/generated-videos.ts:41-129`;
`lib/consolidated-records.ts:306-313`).

The confirmed production state—32 output rows, zero embedded publications, and
one metric snapshot—is valid under this schema: generating an output does not
necessarily create a publication. That is the core mismatch with the desired
model.

### 1.3 `PostFastPostRecord`

`PostFastPostRecord` is the current closest thing to a post
(`lib/postfast-posts.ts:44-66`):

- `id`: local publication ID and the foreign key used by metric snapshots.
- `sourceType`: one of `automation`, `slideshow`, `external`, `generated_video`,
  `greenscreen_meme`, `ugc_ad`, `x_automation`
  (`lib/postfast-posts.ts:19-30`).
- `sourceId`: run, slideshow, generated export, or externally generated ID.
- `postfastPostId?`: PostFast's post ID.
- `integrationId`: required PostFast/social account integration.
- `provider`: required social provider.
- `status`: `draft`, `scheduled`, `published`, `failed`,
  `awaiting_manual_post`, or `ready_for_review`
  (`lib/postfast-posts.ts:12-18`).
- `scheduledAt?`, `publishedAt?`, `releaseUrl?`.
- `linkState?`: `postfast_published`, `manually_linked`, or `unlinked`
  (`lib/publication-link-state.ts:6-12`).
- `statsSources?`: `postfast` and/or `tiktok_studio`
  (`lib/postfast-posts.ts:42-65`).
- `externalPostId?`, content/media fields, `createdAt`, `updatedAt`,
  `analytics?`, and `error?`.

Normalization rejects rows missing `id`, `sourceType`, `sourceId`,
`integrationId`, or `provider` (`lib/postfast-posts.ts:363-374`) and fills
legacy defaults for status/link state/stats sources
(`lib/postfast-posts.ts:375-400`). This means the type cannot represent:

1. a generated post before a destination integration is selected; or
2. a Studio-discovered external post for which the application has not already
   created a local publication.

`upsertPostFastPostRecord` treats
`(sourceType, sourceId, integrationId)` as identity, assigns a random UUID when
there is no match, and merges remote IDs and dates
(`lib/postfast-posts.ts:104-162`). That key can collapse intentional reposts to
the same destination, while source aliases can make one distribution instance
look like two records. `baseSourceId()` strips colon suffixes
(`lib/postfast-posts.ts:414-416`), another indication that identity is being
inferred from display/source strings.

The physical relationship is nested rather than relational:
`listPostFastPostRecords()` scans owner output rows and flattens each
`publications` array (`lib/output-publications.ts:20-24`;
`lib/postfast-posts.ts:342-350`). Updating the logical list reads every output,
removes absent records, reassigns existing IDs, locates an output by source
aliases, and may create a synthetic `publication_wrapper` output
(`lib/output-publications.ts:49-80,134-229`). It then rewrites the containing
JSON array plus summary columns (`lib/output-publications.ts:116-131`).
Concurrent writes can therefore lose one another, and an external-only post is
represented by a fake output.

### 1.4 Metric and follower snapshots

`PostFastMetricSnapshot` is defined at
`lib/postfast-metric-snapshots.ts:17-38`. It persists:

- `id`, `postId`, `platformPostId`, `integrationId`, `provider`.
- `capturedAt`, optional `publishedAt`.
- content/thumbnail/release URL and source metadata
  (`sourceType`, `sourceId`, `contentType`, `mediaCount`).
- normalized `metrics`, `latest`, raw metrics/keys, `source`, and optional
  TikTok Studio detail.

`postId` is supposed to reference `PostFastPostRecord.id`.
`metricSnapshotId(postId, capturedAt)` hashes those two values
(`lib/postfast-metric-snapshots.ts:241-247`), so repeated ingestion of the same
capture is idempotent. Append/upsert behavior is at
`lib/postfast-metric-snapshots.ts:107-145`. Adding a snapshot also attempts to
add its source to the matching publication (`lib/postfast-metric-snapshots.ts:147-161`);
it does not create a missing publication.

`AccountFollowerSnapshot` contains `id`, `integrationId`, `provider`,
`capturedAt`, `followers`, and optional raw data
(`lib/postfast-metric-snapshots.ts:87-94`). It is account-scoped rather than
post-scoped. Appends deduplicate by integration and capture day, use a generated
ID, and cap the collection at 10,000 entries
(`lib/postfast-metric-snapshots.ts:172-208`). It should remain a separate
time-series record.

The legacy `analytics` field embedded on a publication is still patchable
(`lib/postfast-posts.ts:164-187`), but current charts use the snapshot store.
The unified model should not revive embedded metric history.

### 1.5 Automations, runs, results, slideshows, and generated video exports

The automation definition determines generation and destinations; it is not a
post. `AutomationSchema` includes automation kind, social integrations,
provider-specific publish settings, schedule, posting mode, render settings,
and UGC/video configuration (`lib/realfarm-automation.ts:310-356`).
Posting mode is `manual`, `review`, or `auto`
(`lib/realfarm-automation.ts:201,446-456`), which should map to post workflow
metadata rather than be overloaded into link state.

`AutomationRunRecord` persists in `automation_runs` and includes
(`lib/automation-runner.ts:130-151`):

- `id`, `automationId`, `automationTitle`, schedule/source/request fields.
- run `status`, optional legacy `postfastRecordId`, `slideshowId`.
- generated video/thumbnail/output URLs and media IDs.
- `socialStatuses`, `manuallyPublishedAt`, rendered slides and plan.
- created/updated/start/completion times and error.

It is written through the automation run store at
`lib/automation-runner.ts:2197-2217`. `postfastRecordId` has no meaningful
multi-destination semantics, and manual-published state currently only stamps
the run and usage (`lib/automation-runner.ts:2487-2504`).

`ResultRecord` is the generated-output record. It contains owner, result ID,
automation/run IDs, workflow type/title/status/timestamps, artifact IDs/URLs,
optional payload, and destination account IDs (`lib/results.ts:15-58`).
`createSlideshowResultRecord()` generates a slideshow ID and result containing
the automation/run references and rendered artifacts
(`lib/slideshows.ts:165-213`). The persisted slideshow itself contains draft,
render, source, media, caption, and timing data
(`lib/slideshows.ts:54-100`).

`GeneratedVideoExport` contains owner, ID, generation type/status/timestamps,
title/description/hashtags, source config, source automation/run IDs, an opaque
legacy `publication` field, output/thumbnail/media URLs, error,
`manuallyPublishedAt`, and deletion-block state
(`lib/generated-video-types.ts:1-45`). CRUD and normalization are in
`lib/generated-videos.ts:41-175,220-253`. Marking a video manually published
only adds a timestamp (`lib/generated-videos.ts:131-148`).

The relationship should be understood as:

```text
automation definition
  -> automation run
     -> generated output/result (rendered artifact)
        -> zero or more destination post intents
           -> optional PostFast/external identity
              -> many metric snapshots

external/Studio import
  -> one post without a generated output
     -> many metric snapshots
```

One output is therefore not necessarily one post. A single slideshow can be
sent to multiple integrations, and an imported TikTok can have no local
slideshow or video.

### 1.6 Meaning of the current keys

| Key | Current meaning and problem |
| --- | --- |
| `rid` | Stable logical record ID projected into an Appwrite row. For a result it is normally `result-${runId}`; for wrappers it is synthetic. It identifies an output, not a destination post. |
| `source_run_id` | Output projection of the automation run. It is a useful relation, not a globally unique post key. |
| `source_entity_id` | Slideshow/export/source artifact identity. It relates a post to an output, but one entity may fan out to multiple posts. |
| `sourceType/sourceId` | Publication-level polymorphic relation. Current writers disagree between automation/run and slideshow/slideshow ID. It must become a compatibility projection over explicit source references. |
| `integrationId` | Destination/account integration. It is required today, even before a destination exists. Reconnects may change it. |
| `postfastPostId` | PostFast's internal post ID. It is useful as a strong identity claim, but should be scoped by owner and verified for integration semantics. |
| `externalPostId` | Provider/platform post ID. It is the strongest platform link when combined with owner, normalized provider, and account/integration scope. |
| `postId` | Snapshot foreign key to the local publication ID. It must become a foreign key to canonical `Post.id`; preserving existing publication IDs minimizes migration. |

## 2. Current write paths

### 2.1 Shared web publishing

`publishPost()` calls PostFast and then upserts a publication. It also creates a
failed publication on failure (`lib/publishing.ts:130-210`). Automation helper
paths create auto/review/manual/failed records at
`lib/publishing.ts:277-389`. All are owner-scoped through the current/system
JSON-store context.

The current writer:

- keys by source type/source ID/integration;
- fills PostFast ID, provider, status, dates, URL, content, and media;
- sets `linkState="postfast_published"` even for scheduling/draft workflows,
  making that label describe the mechanism rather than actual published state;
- writes by replacing the owner's flattened publication list, which eventually
  rewrites one or more output rows.

`reschedulePost()` may create a replacement PostFast ID, delete the old remote,
and update the same local publication (`lib/publishing.ts:230-275`). This is a
retry/replacement of one intent, not a new post unless product behavior says
otherwise.

`app/api/postfast/posts/route.ts:59-169` exposes publishing, manual-awaiting, and
manual-posted branches. The manual-posted branch calls
`linkPublishedOutput`; normal publishing calls `publishPost`. The route is
authenticated and therefore writes under the current owner.

Composer publishing creates a random source ID for the compose operation and
publishes once per selected account (`lib/compose-publishing.ts:27-92`).
Integration currently prevents those sibling posts from colliding.

### 2.2 Manual linking and manual-published stamps

`linkPublishedOutput()` validates/parses a provider URL, detects an existing
provider/external-ID link on another source, and upserts a published,
`manually_linked` record (`lib/manual-publication-linking.ts:23-70`).
Provider URL parsing and external ID extraction are in
`lib/manual-publication.ts:11-107`.

The conflict check uses normalized provider plus `externalPostId`; it does not
include the integration/account. That may be correct for globally unique
TikTok IDs but is unsafe as a universal cross-provider rule. The unified
identity resolver must define platform/account scope per provider.

Several “mark manually published” paths only stamp source records and do not
create a publication:

- automation run: `lib/automation-runner.ts:2487-2504`;
- generated video export: `lib/generated-videos.ts:131-148`;
- slideshow API: `app/api/slideshows/[id]/route.ts:109-121`;
- generated-video API: `app/api/generated-videos/[id]/route.ts:14-32`.

The MCP manual-mark workflow does call `linkPublishedOutput` and then stamps the
corresponding run/video/X record (`lib/mcp/lumenclip-server.ts:5333-5391`).
These paths must converge so a manual publish always upserts the same canonical
post and source stamps become temporary compatibility projections.

### 2.3 Automation generation and worker writers

The in-process slideshow runner creates the result/output at
`lib/automation-runner.ts:706-730`, then writes auto, review, manual, or failed
publication records at `lib/automation-runner.ts:738-845`. It identifies them
as `sourceType="automation", sourceId=runId`. UI slideshow publication uses
`sourceType="slideshow", sourceId=slideshowId`
(`components/realfarm/slideshow-publication-actions.tsx:400-433`).
Social-status matching already compensates for those aliases
(`lib/automation-runner.ts:992-1041`).

The cloud job worker has separate implementations:

- Slideshow worker creates/preserves the result output at
  `appwrite/functions/job-worker/src/slideshow-automation.js:1423-1507`,
  schedules through PostFast at
  `appwrite/functions/job-worker/src/slideshow-automation.js:1005-1075`,
  builds a deterministic run/integration publication at
  `appwrite/functions/job-worker/src/slideshow-automation.js:1088-1125`,
  and writes the output publication column directly at
  `appwrite/functions/job-worker/src/slideshow-automation.js:1568-1595`.
  It omits current link-state/stats-source fields, relying on normalization.
- UGC worker creates the generated output at
  `appwrite/functions/job-worker/src/ugc-automation.js:222-229` and writes
  publication-shaped objects at
  `appwrite/functions/job-worker/src/ugc-automation.js:241-283`. Those objects
  omit required canonical fields including `id`, `sourceType`, and `sourceId`;
  `normalizePost()` consequently filters them out.
- X worker builds publication records at
  `appwrite/functions/job-worker/src/main.js:609-674` and projects
  `publishing.records` into the output publication column at
  `appwrite/functions/job-worker/src/main.js:323-401`. Its records also predate
  link-state/stats-source fields.

These direct worker writes bypass the shared TypeScript upsert logic. The
refactor must include the deployed worker or it will reintroduce incompatible
rows after web writers migrate.

Generated-video publishing passes generated-video/UGC/greenscreen source IDs
from the UI (`components/realfarm/generated-video-exports.tsx:610-639`).
The X API uses the X run ID and then persists the updated run
(`lib/x-automation-publishing.ts:8-67`;
`app/api/x-automations/publish/route.ts:14-35`).

### 2.4 PostFast sync and analytics ingestion

`syncPostFastAnalytics()` reads PostFast analytics, maps local publications by
`postfastPostId` or `externalPostId`, and writes snapshots
(`lib/postfast-analytics.ts:30-110`). For a remote-only post it selects a local
record ID, platform ID, or remote PostFast ID as `snapshot.postId`
(`lib/postfast-analytics.ts:40-72`) but does **not** create a publication. It
only patches publication status if a local row already exists
(`lib/postfast-analytics.ts:111-121`). It then appends metric and follower
snapshots (`lib/postfast-analytics.ts:142-150`).

Thus generic PostFast sync has the same orphan-snapshot defect as Studio.
Its local lookup also omits integration from the external identity map, which
can collide if a provider's IDs are not globally unique.

`app/api/postfast/posts/route.ts:25-56,216-238` also reads the remote feed and
enriches it with local records, but it does not materialize remote-only posts.

### 2.5 TikTok Studio and TikTok publication imports

Studio currently assumes a publication exists:

- Creating an import calls `requireTikTokPublication`
  (`lib/tiktok-studio-analytics.ts:175-212`).
- Batch selection loads publications/snapshots and selects only pre-existing
  TikTok publications (`lib/tiktok-studio-analytics.ts:214-349`).
- Linking again requires the publication, writes a Studio snapshot, and then
  marks the import linked (`lib/tiktok-studio-analytics.ts:520-573`).
- `requireTikTokPublication` throws for a missing record
  (`lib/tiktok-studio-analytics.ts:1161-1169`).
- Snapshot conversion uses `publication.id` as `postId`
  (`lib/tiktok-studio-analytics.ts:847-919`).

Batch deduplication uses `externalPostId` without integration scope
(`lib/tiktok-studio-analytics.ts:292-349`).

The capture route resolves the signed owner's context and invokes the local
capture/link flow (`app/api/tiktok-studio-analytics/capture/route.ts:45-122`).
The cloud-sync route reverses the safe order: it upserts the snapshot and only
patches a publication if one already exists
(`app/api/tiktok-studio-analytics/cloud-sync/route.ts:59-75`). This path can
produce exactly the confirmed production state of one snapshot and zero
publications.

The separate Apify/TikTok publication importer previews existing identities and
then calls `linkPublishedOutput`, so a successful explicit link does create a
publication (`lib/tiktok-publication-import.ts:108-281`). Its run-recovery and
manual-run stamps must become source relations on the same canonical post.
Studio import/batch bookkeeping remains in `permanent_assets`; those records
describe an ingestion job, not the post itself.

### 2.6 Calendar mutations, deletion, MCP, and scripts

- Calendar reschedule delegates to the shared PostFast writer; deletion removes
  the remote post and local publication
  (`app/api/calendar/items/[id]/route.ts:13-85`).
- Slideshow and generated-video deletion consult publications to block deleting
  published artifacts (`app/api/slideshows/[id]/route.ts:328-400`;
  `app/api/generated-videos/route.ts:23-39`). Alias matching lives in
  `lib/slideshow-lifecycle.ts:17-62` and
  `lib/generated-video-deletion.ts:5-19`.
- MCP publishing performs duplicate checks and calls the same `publishPost`
  writer (`lib/mcp/lumenclip-server.ts:5150-5313`).
- `scripts/migrate-publication-link-state.mts:5-73` is an existing
  owner-scoped, dry-run/apply/backup migration pattern.
- `scripts/backfill-tiktok-canonical-urls.mts:24-79` rewrites publication and
  snapshot URLs and illustrates why both stores must be reconciled.
- `scripts/provision-consolidated-stores.mjs:228-254` contains an existing
  output backfill, but canonical-post migration should be a separate explicit
  script rather than hidden in app startup or tests.

## 3. Current read paths and required changes

### 3.1 Analytics

`app/api/analytics/report/route.ts:35-106` concurrently reads integrations,
metric snapshots, follower snapshots, and publications; it infers account
metadata and filters publications by published/scheduled/updated/created time.
POST triggers PostFast sync (`app/api/analytics/report/route.ts:153-171`).
After cutover it should obtain posts from `listPosts()` and snapshots by
canonical `postId`; the response adapter can remain stable.

`components/realfarm/analytics/analytics-selectors.ts:20-80` groups snapshots by
`integrationId:postId`, joins publications by publication ID, and appends
snapshotless publications. Daily/latest windowing is implemented at
`components/realfarm/analytics/analytics-selectors.ts:82-101,216-227`.
That windowing and latest-per-post-per-day behavior must be preserved. Only the
input type and join name should change.

The analytics view and post-detail route use the local post/publication ID
(`components/realfarm/analytics/analytics-view.tsx:30-41,76-80,130-133`;
`app/app/analytics/posts/[id]/page.tsx:21-77`). The detail page currently
requires a snapshot; a canonical post should be displayable before metrics
arrive, with an empty-metrics state.

Hook analytics also joins snapshot `postId` to publication IDs and deliberately
keeps orphan snapshots as fallback rows
(`lib/hook-publications.ts:92-180`). Its run/slideshow alias handling is at
`lib/hook-publications.ts:404-425`, and its retention/window rules are at
`lib/hook-publications.ts:469-509`. Canonical source references should remove
the alias heuristic without changing retention or metric calculations.

The automation-runs API still reports embedded `record.analytics` rather than
the snapshot series (`app/api/automations/runs/route.ts:23-89`). It should join
the latest canonical post snapshots during reader cutover.

### 3.2 Calendar

The calendar API merges four sources: projected automation slots, automation
jobs, local publications, and the remote PostFast feed
(`app/api/calendar/route.ts:78-138`). Local records are mapped at
`app/api/calendar/route.ts:253-322`; remote items are mapped and joined by
PostFast ID at `app/api/calendar/route.ts:324-439`; run/slideshow contexts are
bridged at `app/api/calendar/route.ts:442-477`.

It intentionally suppresses a locally published record with a PostFast ID so
the richer remote feed wins (`app/api/calendar/route.ts:262-265`). Slot-key and
source dedupe are in `lib/calendar-items.ts:84-109`; local/remote lifecycle
mapping is at `lib/calendar-items.ts:142-165`. Repoint this merge to canonical
posts, but preserve:

- remote PostFast enrichment without double-rendering the canonical local row;
- scheduled/published cancellation and rescheduling behavior;
- source/run context;
- projection dedupe.

Paused/non-live automations are deliberately excluded from projected future
items (`app/api/calendar/route.ts:141-184`). That recently fixed behavior is
orthogonal to the post model and must remain covered by tests.

`lib/calendar-summary.ts:11-40` queries denormalized publication fields directly
on `outputs`. It must use the posts repository or, during migration, rely on
dual-written summary projections. The content-calendar components consume
`CalendarItem`, so they should not need a broad UI rewrite if the API adapter
stays stable.

### 3.3 Home dashboard

`listPublishedPostDates()` combines linked publications with manual-published
timestamps from runs and generated videos, excluding source stamps already
matched to publications (`lib/published-post-dates.ts:10-53`). That fallback
exists because some manual paths never created a publication. After migration
it should read canonical posts with `lifecycleStatus="published"` and
`publishedAt`; source stamps remain only as a temporary compatibility fallback.

The workspace loads these dates at
`components/realfarm/routes/workspace-route.tsx:28-53`, and the home view passes
them to `PostFrequencyGraph`
(`components/realfarm/home-view.tsx:54-75,217-252`). The graph merely groups
dates (`components/realfarm/post-frequency-graph.tsx:41-80`), so its contract
does not need to change.

Upcoming posts are schedule projections rather than persisted posts.
`lib/automation-upcoming-posts.ts:17-64` already excludes paused/non-live
automations. Keep that projection for future ungenerated slots; deduplicate it
against canonical generated/scheduled posts by run/slot intent, not caption or
time proximity.

### 3.4 MCP, exports, comments, and lifecycle guards

- MCP schedule views combine local and remote records
  (`lib/mcp/lumenclip-server.ts:500-575`); MCP analytics reads publications and
  snapshots and explicitly warns when outputs exist without publications
  (`lib/mcp/lumenclip-server.ts:894-960`). Both should consume the canonical
  repository while keeping their response schemas stable.
- The Studio MCP report already unions snapshots/imports/publications and
  tolerates orphan snapshots (`lib/mcp/tiktok-studio-report.ts:84-161,182-309`).
  It should become a straightforward canonical-post/snapshot join.
- TikTok comments and publication-import views resolve posts through current
  publication IDs/remote IDs (`lib/tiktok-comments.ts:116-176`;
  `lib/tiktok-publication-import.ts:108-281`). They should use identity claims.
- Slideshow/generated-video download and export readers should continue reading
  `outputs`, because media/rendered artifacts remain an output concern.
  Publication/deletion guards should query posts by explicit `outputId` or
  source reference rather than colon-prefix aliases.

## 4. Proposed unified model

### 4.1 Boundary: Post is a distribution instance

Add a `Post` domain type and a `PostRepository`. A post represents one intended
or actual distribution to one destination. It can exist before it is linked to
a provider post. It may point to a generated output, but does not own the
rendered artifact.

This interpretation satisfies “one post object treated the same regardless of
where it came from” without falsely forcing one output to equal one post:

- one output sent to three accounts creates three sibling posts;
- one unassigned generated output can initially create one unassigned post;
- an external TikTok import creates one post with no output;
- PostFast publication, manual linking, Studio import, and analytics sync all
  fill optional fields on the resolved post rather than create another shape.

### 4.2 Proposed `Post` field set

The TypeScript domain model should be explicit rather than a raw `data` bag.
The table may project indexed fields and retain the full record as JSON.

```ts
type PostLifecycleStatus =
  | "generated"
  | "ready"
  | "scheduled"
  | "published"
  | "failed"

type PostLinkState =
  | "unlinked"
  | "postfast_managed"
  | "externally_linked"

type Post = {
  schemaVersion: 1
  id: string
  intentId: string
  ownerId: string

  origin:
    | "automation_generation"
    | "composer"
    | "manual_link"
    | "postfast_publish"
    | "postfast_sync"
    | "tiktok_publication_import"
    | "tiktok_studio_import"
    | "migration"

  sourceType?: PostFastPostSourceType // temporary compatibility projection
  sourceId?: string                  // temporary compatibility projection
  sourceRefs: Array<{
    kind: "output" | "automation" | "run" | "slideshow" | "generated_video"
        | "x_automation" | "external"
    id: string
  }>
  outputId?: string
  automationId?: string
  runId?: string
  sourceEntityId?: string

  lifecycleStatus: PostLifecycleStatus
  publishMode?: "auto" | "review" | "manual"
  linkState: PostLinkState
  linkMethod?: "postfast" | "manual_url" | "tiktok_publication_import"
             | "tiktok_studio" | "analytics_sync"

  integrationId?: string
  provider?: PostFastSocialProvider
  postfastPostId?: string
  externalPostId?: string
  releaseUrl?: string
  statsSources: Array<"postfast" | "tiktok_studio">

  title?: string
  content: string
  hashtags: string[]
  contentType?: "slideshow" | "video" | "image" | "text"
  media: Array<{
    id?: string
    kind: "image" | "video" | "thumbnail"
    url?: string
    postfastKey?: string
    order: number
  }>

  generatedAt?: string
  readyAt?: string
  scheduledAt?: string
  publishedAt?: string
  linkedAt?: string
  failedAt?: string
  lastSyncedAt?: string
  createdAt: string
  updatedAt: string

  error?: { code?: string; message: string; retryable?: boolean }
  mergedIntoId?: string
}
```

Notes:

- `integrationId`, provider IDs, dates, URL, and analytics-source fields are
  optional specifically so linking/importing can fill them later.
- `intentId` is immutable and generated at the business action boundary. It
  makes retries idempotent without claiming that every use of one output is the
  same post.
- `sourceRefs` replaces ambiguous source aliases. The scalar compatibility
  fields remain through rollout and are removed only after callers migrate.
- Media URLs may refer back to the output; the output remains authoritative for
  artifact lifecycle. Avoid copying large artifact payloads into the post.
- Snapshot series stays in `postfast_metric_snapshots`, keyed by `Post.id`.
  Account follower snapshots remain unchanged.
- If product needs cancellation as a durable state, add `cancelled` before the
  public type freezes. Do not encode cancellation as `failed`.

### 4.3 Lifecycle state machine

```text
generation requested
      |
      v
  generated -------- generation/publish error ------> failed
      |                                                |
 render/content ready                                 | retry
      v                                                v
    ready -- PostFast schedule --> scheduled ------> ready/scheduled
      |                            |
      | manual link / import       | provider confirms, sync, or link
      +----------------------------+
                                   v
                               published
```

Rules:

1. Successful generation creates or advances the post to `generated`, then
   `ready` when media/content are usable.
2. `review` and `manual` are `publishMode`/required-action attributes on
   `ready`, not separate lifecycle identities.
3. A successful PostFast scheduling response sets `scheduled`,
   `postfast_managed`, integration/provider/PostFast ID, and `scheduledAt`.
4. Provider confirmation, manual URL link, TikTok import, Studio import, or
   analytics discovery sets/fills `published`, external identity,
   `publishedAt`, URL, link metadata, and stats sources.
5. External import may enter directly at `published`.
6. Failure records the failed operation but preserves the same post/intent so a
   retry can return it to the prior ready/scheduled state.
7. A link operation is a patch/upsert, not a second record. A deliberate repost
   is a new intent and therefore a new post.

Legacy adapter mapping:

| Canonical | Legacy `PostFastPostRecord` |
| --- | --- |
| `generated` | `draft` |
| `ready` + review | `ready_for_review` |
| `ready` + manual | `awaiting_manual_post` |
| `scheduled` | `scheduled` |
| `published` | `published` |
| `failed` | `failed` |
| `postfast_managed` | `postfast_published` |
| `externally_linked` | `manually_linked` |

### 4.4 Identity and deduplication

Identity must be resolved from explicit claims in descending strength:

1. Existing canonical `Post.id`.
2. `(owner, postfastPostId)` after confirming whether PostFast IDs are globally
   unique or integration-scoped.
3. `(owner, normalizedProvider, integration/account scope, externalPostId)`.
4. `(owner, intentId)` for pre-link creation and retry.
5. A migration-only source claim such as
   `(owner, outputId, destinationKey)` when no intent ID exists.

Do **not** use these as universal identity:

- `(sourceType, sourceId)` alone: one output/run can fan out.
- `(sourceType, sourceId, integrationId)` for all time: it collapses deliberate
  reposts.
- `externalPostId` without provider/account scope.
- caption, media URL, timestamp proximity, `baseSourceId()`, or colon-prefix
  matching.

Use a small `post_identities` claim table (or an equivalent Appwrite collection)
to make aliases deterministic and concurrency-safe:

```text
owner_id
identity_kind       // intent, postfast, provider_external, legacy_source
identity_hash       // hash of normalized scoped value
post_id
created_at
data                // non-secret normalized diagnostic fields
```

The document ID should be a deterministic hash of owner, kind, and normalized
claim. Claim creation is idempotent. An upsert resolves all supplied claims:

- no claim exists: create a post and claims;
- claims resolve to one post: patch that post;
- claims resolve to multiple posts: return/report a reconciliation conflict;
  never silently merge;
- an approved merge sets `mergedIntoId` and preserves an alias so old post IDs
  and snapshot links remain resolvable.

For known automation destinations, create one post/intent per integration. If
generation has no destination, create one unassigned post tied to the output.
The first destination/link can fill that unassigned record; a second
destination creates a sibling with a new `intentId`.

### 4.5 How each writer maps to one upsert

| Writer/event | Identity supplied | Fields filled/advanced |
| --- | --- | --- |
| Automation generation | immutable intent plus output/run/source refs; integration if known | origin, content/media, source refs, `generated` then `ready`, publish mode |
| PostFast publish/schedule | intent/current post plus returned PostFast ID | integration/provider, PostFast ID, schedule, `postfast_managed`, `scheduled` or `published`, URL/external ID when returned |
| PostFast sync | PostFast/external identity | find-or-create, remote fields, `published`, stats source, last sync; write snapshot with resolved canonical ID |
| Manual URL link | current post/intent plus provider-scoped external identity | external ID, provider/integration, URL, published/linked dates, `externally_linked`, `published` |
| TikTok publication import | provider/integration/external identity plus recovered source refs | same canonical patch as manual link; origin/link method records importer |
| TikTok Studio import/link | provider/integration/external identity from manifest/capture | find-or-create, `published`, URL/date/content where available, `tiktok_studio` stats source; snapshot uses returned post ID |
| Composer | one intent per selected integration | content/media/source external; normal PostFast fields |
| Calendar reschedule | existing post ID/intent | same row, replacement PostFast claim if needed, scheduled time |
| Failure/retry | existing post ID/intent | error and lifecycle transition; never generates a duplicate |
| Delete/cancel | existing post ID | provider cancellation plus explicit cancelled/tombstone policy; do not remove published analytics history silently |

The critical ordering invariant for every analytics ingestion path is:

```text
resolve-or-create canonical post
  -> use canonical post.id for snapshot.postId
  -> upsert snapshot
  -> add stats source / last sync on the same post
```

TikTok Studio must no longer call `requireTikTokPublication()` before it has
enough data to construct a post. That function becomes
`resolveOrCreateTikTokPost({ owner, integrationId, externalPostId, ... })`.

## 5. Storage decision and migration

### 5.1 Decision

Create a dedicated `posts` table and a `post_identities` claim table.

Do not keep the canonical set in `outputs.publications`:

- an external post should not require a fake output wrapper;
- a generated output can have multiple destination posts;
- nested arrays cannot be indexed by external identity safely;
- every update currently scans and may rewrite all owner publication arrays;
- worker and web writers have already drifted in schema;
- direct per-post writes and deterministic claims substantially reduce
  lost-update risk.

Do not merge outputs and posts into one table/kind as the final abstraction.
They have different lifecycle and cardinality: outputs own generated artifacts;
posts own distribution instances. They may share the existing physical
`outputs` table temporarily for deployment convenience, but that would retain
the misleading name/index shape and is not recommended.

Keep metric and follower snapshots in their current stores. Change only the
meaning of metric `postId` from legacy publication ID to canonical `Post.id`,
preserving IDs wherever possible.

Suggested indexed post columns:

```text
rid, owner_id, schema_version, intent_id, origin,
source_type, source_id, output_id, source_automation_id,
source_run_id, source_entity_id,
integration_id, provider, lifecycle_status, link_state,
postfast_post_id, external_post_id,
scheduled_at, published_at, created_at, updated_at,
release_url, data
```

Indexes should cover owner/status/date, owner/source references,
owner/integration, and remote identity lookup. Appwrite index limits and
nullable-field behavior must be validated locally before provisioning cloud.
The claim table, rather than optimistic application scans, enforces alias
uniqueness.

### 5.2 Reversible, idempotent production migration

Add an explicit script, for example
`scripts/migrate-unified-posts.mts`. It must never run during application
startup or test setup. The existing test helper refuses unsafe remote Appwrite
configuration (`lib/test-helpers.ts:7-25`); retain that guard and require
migration-specific production intent.

Command contract:

```text
pnpm tsx scripts/migrate-unified-posts.mts \
  --env-file .env \
  --owner-id <owner> \
  --dry-run

pnpm tsx scripts/migrate-unified-posts.mts \
  --env-file .env \
  --owner-id <owner> \
  --apply \
  --confirm-project <project-id> \
  --manifest <path>

pnpm tsx scripts/migrate-unified-posts.mts \
  --env-file .env \
  --owner-id <owner> \
  --verify \
  --manifest <path>
```

The script should print endpoint, project, database, and owner before any write,
default to dry-run, reject missing owner, and require explicit apply/project
confirmation. It should follow the backup/apply separation used by
`scripts/migrate-publication-link-state.mts:5-73`.

#### Dry-run/plan algorithm

1. Read every owner output row, embedded publication, metric snapshot, relevant
   automation run, and generated-video/X/result source object.
2. Normalize valid legacy publications. Preserve each `publication.id` as
   canonical `Post.id`, so its snapshots continue to join without rewrites.
3. For every output with no publication, propose at least one deterministic
   generated/ready post:
   - intent seed:
     `migration:v1:${owner}:${outputRid}:${destination-or-unassigned}`;
   - attach exact automation/run/slideshow/export references;
   - create one per recoverable destination integration, otherwise one
     unassigned post;
   - copy only authoritative content/media/timestamps.
4. For every orphan metric snapshot, propose a post whose ID is exactly
   `snapshot.postId`, filling provider, integration, platform/external ID,
   published date, URL, content/source, `published`,
   `externally_linked`, and its stats source.
5. Attach an orphan snapshot-derived post to an output only when an exact
   persisted source reference resolves one output. Do not guess from caption,
   media, or timestamp.
6. Build all intent/PostFast/provider-external/source claims and report:
   duplicates, claims resolving multiple post IDs, missing provider/integration,
   invalid worker publication shapes, and unresolved source aliases.
7. Produce a machine-readable manifest containing input row hashes, proposed
   post/claim IDs, preimages, conflicts, and expected verification counts.
   Material conflicts block `--apply`.

For the confirmed owner, the dry run should explicitly report the known
baseline: 32 outputs, zero valid legacy publications, and one orphan snapshot.
It should propose at least one post for each output and one for the orphan
snapshot unless exact source identity proves the snapshot belongs to one of the
32. Do not hard-code “33” as the expected final count because that exact match
is a data-dependent reconciliation decision.

#### Apply algorithm

1. Re-read and compare input hashes to the dry-run manifest; abort on drift.
2. Write deterministic claims/posts using create-or-compare semantics.
3. On rerun, an identical post/claim is a no-op; a divergent existing row is a
   conflict, not an overwrite.
4. Do not delete or mutate `outputs.publications`, source records, or snapshots.
   The first migration is additive.
5. Save preimages for any existing canonical row that must be enriched.
6. Emit a signed/checksummed result manifest listing created, unchanged,
   enriched, skipped, and conflicted IDs.

#### Verification

Automated verification must assert:

- every owner output maps to at least one canonical post;
- every snapshot `postId` resolves directly or through a declared merge alias;
- every identity claim resolves to exactly one non-tombstoned post;
- no duplicate provider/integration/external identities;
- source/output cardinality is reported, not assumed one-to-one;
- content/status/date totals match the manifest;
- the known TikTok post appears in the analytics API for a date range that
  includes its snapshot;
- calendar and dashboard counts match documented legacy/shadow expectations.

The one existing snapshot may lie outside the UI's default lookback. Verification
must query a range including `capturedAt`; do not weaken chart windowing just to
make the migrated row visible.

#### Rollback

Because legacy rows are unchanged, rollback deletes only post/claim IDs recorded
as newly created by the manifest and restores recorded preimages for enriched
rows. Refuse rollback if a row has changed since the apply result hash. Reader
feature flags return traffic to legacy mode immediately. Legacy deletion is a
separate, much later cleanup with its own backup and approval.

## 6. Staged rollout plan

Each stage is independently deployable and reversible. Use explicit path
staging and the repository's normal review/deploy procedure when Phase 2 is
authorized. No stage below is part of this Phase 1 deliverable.

### Stage 1 — Canonical domain adapter and orphan-safe analytics ingestion

**Outcome:** Fix the immediate production failure: a Studio or PostFast
snapshot cannot exist without a local post visible to analytics.

**Changes**

- Add `lib/posts.ts` with the canonical type, normalization, lifecycle adapter,
  and identity normalization.
- Add `lib/post-repository.ts` with a repository contract initially backed by
  existing `PostFastPostRecord`/`outputs.publications`.
- Extend the legacy adapter with an idempotent
  `ensurePostForSnapshot(snapshot)` that can create a valid publication with a
  specified `id` and external source when no output exists.
- Change `app/api/tiktok-studio-analytics/cloud-sync/route.ts` to resolve/create
  the post **before** upserting the snapshot.
- Change `lib/postfast-analytics.ts` to do the same for remote-only PostFast
  analytics.
- Make `lib/postfast-metric-snapshots.ts` add stats sources through the
  repository.
- Add targeted tests beside existing PostFast/Studio/analytics tests.

The adapter may still create a `publication_wrapper` in this stage. That is
temporary but makes the immediate fix small and compatible with all current
readers.

**Risk:** Choosing a new local ID when the orphan snapshot already has
`snapshot.postId` would leave analytics broken. Preserve the snapshot's ID when
safe, or transactionally rewrite the snapshot to the resolved canonical ID.
Also include integration in identity maps and reject conflicting claims.

**Verification**

- `pnpm typecheck`.
- Targeted Vitest: post repository/normalization, PostFast analytics sync,
  metric snapshot source updates, Studio cloud-sync route, analytics report and
  selector join.
- Local test: ingest a snapshot into an empty publication store twice; expect
  one post, one snapshot, `statsSources=["tiktok_studio"]`.
- Production read check for the owner: publication count becomes nonzero, no
  orphan snapshots, known TikTok post joins in `/api/analytics/report` over an
  inclusive date range. The owner/operator should run this check; the app code
  must not silently repair all production data on read.

**Rollback:** Revert the two ingestion call sites and repository adapter.
Existing created wrapper/publication data is additive and readable by old code;
do not delete it during rollback.

### Stage 2 — Studio import resolves or creates the post

**Outcome:** Studio import/link works for a TikTok that was never generated or
published by this application.

**Changes**

- Replace `requireTikTokPublication` in
  `lib/tiktok-studio-analytics.ts` with provider-scoped
  `resolveOrCreateTikTokPost`.
- Update single-import and batch-selection code so the manifest/capture's
  integration and external ID materialize candidate posts before selection.
- Make batch dedupe use owner/provider/integration/external identity.
- Update `app/api/tiktok-studio-analytics/*` request/response adapters as
  required.
- Update Studio dialog/UI only if an explicit TikTok URL or external-ID seed is
  required; the current companion manifest is an explicit list of selected
  posts (`components/realfarm/tiktok-studio-batch-dialog.tsx:115-147`).
- Reuse the same operation from TikTok publication import; do not maintain a
  separate linking implementation.

**Risk:** Studio cannot discover an arbitrary account's complete post list from
local data alone. Product must decide whether candidates come only from the
companion manifest/PostFast feed or whether the UI accepts TikTok URLs/IDs.
Do not invent posts by matching caption/date.

**Verification**

- `pnpm typecheck`.
- Targeted Studio single/batch/capture/cloud-sync and publication-import tests.
- Cases: no local output, retry of same import, two integrations with similar
  IDs, conflicting identity, and existing generated post being enriched rather
  than duplicated.
- Production read check: import one previously unknown TikTok, then confirm one
  post, one external identity, snapshot join, analytics card/detail, and no
  extra output except any temporary Stage-1 wrapper.

**Rollback:** Restore the require-existing behavior behind a feature flag.
Posts created by the stage remain valid external canonical records.

### Stage 3 — Provision dedicated stores and dual-write repository

**Outcome:** Canonical posts become independently addressable without changing
read traffic yet.

**Changes**

- Extend provisioning with `posts` and `post_identities` tables/indexes.
- Implement Appwrite `PostRepository` list/get/upsert/claim/patch methods.
- Add read mode flags: `legacy`, `union-shadow`, `canonical`.
- In `union-shadow`, return legacy results to callers while comparing canonical
  projections and logging structured diffs.
- Dual-write the shared web repository to dedicated posts and legacy embedded
  arrays. Continue projecting output publication summaries for
  `lib/calendar-summary.ts`.
- Add deterministic concurrency/claim tests.

**Risk:** Appwrite index availability and dual-write partial failure. Treat the
canonical write as authoritative only after reconciliation; record an outbox or
retryable repair event rather than silently succeeding one side. Avoid global
owner-array rewrites on the canonical side.

**Verification**

- Provision and exercise the schema on local Appwrite.
- `pnpm typecheck` and targeted repository/claim/legacy-adapter tests.
- Concurrent upsert tests for the same intent and external identity.
- Shadow report shows canonical/legacy equality for existing test fixtures.
- Production read-only schema/count check after provisioning.

**Rollback:** Set read/write flags to legacy-only. New tables are additive and
remain for diagnosis; do not drop them.

### Stage 4 — Converge every writer on canonical upsert

**Outcome:** All new generated, scheduled, manual, and imported posts use one
operation and shape.

**Changes**

- Refactor `lib/publishing.ts`, `lib/manual-publication-linking.ts`,
  `lib/compose-publishing.ts`, `lib/x-automation-publishing.ts`, calendar
  reschedule/delete, and manual-published routes to call `PostRepository`.
- At successful generation, create generated/ready post intents from
  `lib/automation-runner.ts`, result/slideshow creation, and generated-video
  creation.
- Replace source-only manual stamps with canonical post upserts, retaining
  stamps as dual-written compatibility fields.
- Update MCP publish/manual-link/delete flows to use the same repository.
- Update all Appwrite job-worker slideshow, UGC, and X writers. Prefer one
  shared, generated contract fixture/schema that both TypeScript and worker JS
  validate; eliminate worker-specific publication object construction.
- Keep legacy embedded publication arrays/output summary columns dual-written.

**Risk:** Worker/web deployment skew and scheduled jobs running old code. Deploy
repository/schema compatibility first, then workers, then web flags. UGC's
currently invalid record shape needs explicit regression coverage.

**Verification**

- `pnpm typecheck`.
- Targeted publishing/manual-link/composer/calendar/generated-video/slideshow/
  MCP tests.
- Worker `node --test` suites for slideshow, UGC, and X with contract fixtures.
- End-to-end local cases for auto, review, manual, failed/retry, reschedule,
  multi-account fan-out, and deliberate repost.
- Production read check after a controlled generation: one output, expected
  posts per destination, no duplicate claims, legacy/canonical shadow match.

**Rollback:** Disable canonical writer/read flags. Because legacy dual-write
continues, old readers remain complete. Worker deployment must be rolled back
to the compatible prior version as a unit.

### Stage 5 — Dry-run and apply the production migration

**Outcome:** Existing generated outputs and orphan snapshots have canonical
posts without deleting legacy data.

**Changes**

- Add the explicit migration/verification/rollback script and tests for its
  pure planning logic.
- Run local fixture dry-run/apply/idempotent-rerun/rollback.
- Operator runs the production dry run for the named owner and reviews the
  conflict manifest.
- Apply only after review, then run automated verification and the requested
  real production read checks.

**Risk:** False source attribution and identity collisions. Exact references
only; unresolved entries become explicit unassigned/external posts or conflicts.
No caption/date fuzzy merges.

**Verification:** The checks in Section 5.2, plus `pnpm typecheck` and targeted
migration planner tests. Run production analytics with a window including the
known snapshot.

**Rollback:** Manifest-based removal/restoration plus reader flag back to
legacy. Outputs and snapshots were not deleted.

### Stage 6 — Cut readers over by surface

**Outcome:** Analytics, calendar, and home all read one canonical set.

Cut over in small commits/PRs:

1. Analytics report/selectors/detail/hook analytics/automation run analytics.
2. Calendar API, calendar summary, and lifecycle mutation lookups.
3. Dashboard published dates; preserve upcoming schedule projection.
4. MCP analytics/schedule, Studio MCP report, comments/import lookups, and
   source deletion guards.

Keep API/UI response adapters stable where practical. Run legacy/canonical
shadow comparison for each surface before flipping it.

**Risk:** Metric window changes, calendar double entries, dashboard historical
count shifts, and output deletion regressions.

**Verification**

- `pnpm typecheck`.
- Targeted analytics selector/API/detail/hook tests.
- Calendar local/remote dedupe, reschedule/delete, and paused-automation tests.
- Published-date/dashboard tests including legacy manual stamps.
- MCP/report/deletion-guard tests.
- Production read comparison for counts and representative post IDs on each
  surface before/after its flag.

**Rollback:** Flip that surface back to legacy reads independently. Continue
dual-write during the soak period.

### Stage 7 — Stop legacy writes and remove old paths

**Outcome:** `posts` is the only post store; outputs contain artifacts and
temporary summary projections only.

**Changes**

- After a defined soak with zero shadow diffs, stop embedded-publication writes.
- Remove `publication_wrapper` creation and global-array rewrite behavior from
  `lib/output-publications.ts`.
- Remove source-prefix identity heuristics and legacy embedded analytics.
- Repoint/remove `outputs` publication summary fields after all direct queries,
  especially calendar summary, are gone.
- Retain a read-only backup/export and migration manifest according to data
  retention policy.

**Risk:** Unknown consumers of output publication columns or old worker
versions. Search application, scripts, functions, and MCP code again immediately
before removal; require deployment inventory and a soak threshold.

**Verification:** Full typecheck/test suite, worker suites, production
zero-legacy-read telemetry, data export verification, and rollback rehearsal.

**Rollback:** Re-enable dual-write/legacy adapter while legacy columns remain.
Physical column/table deletion is a later operational change, not part of the
same deployment.

## 7. Risks and open questions

### Decisions needed from the owner

1. **Post cardinality:** confirm that one canonical Post means one distribution
   intent/destination, not one generated artifact. This plan recommends the
   former because multi-account publishing otherwise cannot be represented.
2. **Unassigned generation:** should every generated output immediately create
   one unassigned post when no integration is selected? Recommended: yes, to
   meet the “every post/generated item appears uniformly” goal. A later second
   destination creates a sibling.
3. **Deliberate repost:** confirm that reposting the same output to the same
   integration creates a new intent/Post, while retries and reschedules reuse
   the existing intent.
4. **Cancellation:** decide whether `cancelled` is a first-class lifecycle
   state. Recommended: add it if calendar cancellation should remain auditable.
5. **Integration stability:** determine whether reconnecting an account changes
   `integrationId`, and whether a stable provider account/user ID is available.
   External identities should use stable account scope when provider post IDs
   are not global.
6. **Studio discovery UX:** decide whether Studio may materialize only IDs
   supplied by the companion/PostFast data, or whether users can seed imports
   with TikTok URLs/IDs. Current code cannot enumerate arbitrary account posts
   without an input source.
7. **Team/workspace visibility:** specify whether posts are private to
   `owner_id` or shareable like generic JSON-store results. The repository must
   not accidentally broaden access.

### Behavioral and technical risks to preserve/test

- **Analytics semantics:** keep requested lookback filtering, latest-per-post
  and latest-per-day selection, metric chart windowing, follower history, and
  weighted engagement calculations. The presence of a post must not cause an
  out-of-window snapshot to appear in a chart.
- **Snapshot identity:** preserving legacy publication IDs is the safest route.
  Re-keying snapshots changes deterministic snapshot IDs and requires an
  explicit manifest.
- **Calendar dedupe:** canonical local posts and the remote PostFast feed are
  two views of the same item. Preserve remote enrichment and avoid rendering
  both.
- **Paused automation projection:** do not reintroduce projected upcoming items
  for paused/non-live automations while changing calendar repositories.
- **Dashboard history:** manual run/video stamps currently compensate for
  missing publications. Backfill before removing that fallback or historical
  frequency counts will drop.
- **Worker drift:** slideshow, UGC, and X workers currently construct different
  record shapes. A shared contract and coordinated rollout are mandatory.
- **Lost updates:** legacy list replacement is not atomic. Dual-write duration
  should be short, and canonical claims/upserts must not repeat that pattern.
- **Over-deduplication:** current source/integration upsert, manual
  provider/external check, Studio external-ID dedupe, and PostFast sync maps
  each use slightly different identity. Centralize them before adding more
  import paths.
- **Source attribution:** automation/run/slideshow aliases should become
  explicit references. Do not infer ownership of historical posts from caption,
  media URL, or nearby timestamps.
- **Output deletion:** define whether an unpublished generated post is deleted
  or tombstoned with its output, and continue blocking destructive deletion
  when a published post depends on the artifact.
- **Partial writes:** Appwrite does not make multi-document post/claim/snapshot
  updates automatically transactional. Use deterministic writes, compare-and-
  repair behavior, and structured reconciliation; do not hide partial failure.
- **Schema rollout:** create attributes and wait for readiness before indexes or
  worker deployment. Validate nullable/index behavior against the shared local
  Appwrite stack.
- **Backups and privacy:** migration manifests/backups contain post content and
  remote identifiers. Store them with restricted access and a retention policy.
- **Legacy naming:** `postfast_published` currently includes scheduled/draft
  flows. Preserve adapter compatibility but use mechanism-neutral canonical
  names.

## Definition of success

The refactor is complete when, for an owner:

- every generated distribution intent, PostFast post, manually linked post, and
  Studio-imported post resolves to one canonical `Post.id`;
- linking/importing fills fields on that record and does not create a competing
  shape;
- every metric snapshot resolves to a canonical post;
- analytics, calendar, dashboard, MCP, comments/imports, and lifecycle guards
  query the same repository;
- outputs no longer need embedded publication arrays or synthetic wrappers;
- intentional multi-destination/repost cases remain distinct, while retries and
  repeated imports are idempotent;
- migration can be dry-run, verified, rerun, and rolled back without losing the
  32 existing outputs or the existing snapshot.
