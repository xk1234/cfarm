# Scheduling & Job Queue on Appwrite

Scheduling, queue ownership, and scheduled slideshow execution live in Appwrite. The Next application is a control panel and interactive-run surface; scheduled delivery does not depend on it being online. There is no callback URL or shared runner secret.

## Architecture

```
 automation-scheduler  (Appwrite Function, cron */5)
        │  computes owner-scoped slideshow slots 30 minutes ahead
        ▼  enqueues one run-automation job per automation+slot
 ┌──────────────┐
 │  jobs table  │  durable TablesDB queue with lease/retry/dead-letter
 └──────────────┘
        │
        ├── job-worker (Appwrite Function, cron */2 * * * *)
        │      OpenRouter copy → collection image selection → Sharp render
        │      → Appwrite Storage/results → PostFast target-slot schedule
        │
        └── optional local analytics worker (disabled by default)
               only enabled explicitly for development compatibility
```

Both functions use `APPWRITE_API_KEY` against the migrated `cfarm` database. Appwrite injects the Function endpoint and project id.

## Components

**`jobs` table** — the queue. Indexes cover `status`, `type`, `dedupe_key`, and `available_at`. Deterministic queue row ids make an automation/slot enqueue idempotent.

**`automation-scheduler`** (`appwrite/functions/automation-scheduler`, cron `*/5 * * * *`) — computes posting slots in each automation timezone and enqueues slideshow jobs 30 minutes before delivery. Variables: `APPWRITE_DATABASE_ID` and `LOOKBACK_MINUTES`.

The function runtimes generated from canonical app modules include scheduling slots, hook expansion/casing/runtime variables, slideshow rendering/text-style rules, guards, and PostFast provider controls. `appwrite/functions/deploy.mjs` refreshes every generated copy automatically. Run `pnpm appwrite:sync-shared` before deploying through another path, or `pnpm appwrite:check-shared` in CI to fail on drift.

**`job-worker`** (`appwrite/functions/job-worker`, cron `*/2 * * * *`) — leases and dispatches one job per invocation, retries with exponential backoff, and dead-letters exhausted jobs. It skips the stale-lease query whenever queued work exists. Its 900-second timeout and 960-second lease accommodate structured generation, optional AI image matching/benchmarking, rasterization, Storage writes, and provider uploads without an expired lease being reclaimed.

**`appwrite/functions/job-worker/src/slideshow-automation.js`** — the self-contained cloud port of the scheduled parts of `lib/automation-runner.ts`, `lib/slideshow-renderer.ts`, and `lib/publishing.ts`. It:

- scopes every TablesDB read/write to the queue row's `owner_id`;
- derives `runId` from `automationId + scheduledFor` and persists `accepted → generating → generated → posted/failed`;
- leaves button-generated runs unscheduled and not published, while scheduled auto-mode runs continue to publish automatically;
- loads existing owner image collections, generates structured copy through OpenRouter, and optionally uses OpenRouter for configured AI image matching;
- rasterizes the same SVG slide layout through Sharp, writes PNGs to the `slideshows` bucket, and persists a normal `results` record;
- uploads rendered media to PostFast and creates auto-mode posts with `status:"SCHEDULED"` and the exact queued `scheduledFor` value;
- reuses already-scheduled per-integration records on retry to avoid repeating successful PostFast calls.

**`lib/local-automation-job-worker.ts`** — optional development-only analytics worker. It is disabled unless `ENABLE_LOCAL_AUTOMATION_WORKER=true`, and polls at most every five minutes. It never claims `run-automation`; scheduled slideshow execution has one production owner, the Appwrite job-worker.

### Slideshow generation contract

- The job payload contains only identity and scheduling data. The worker reloads the owner-scoped automation, image collections, word collections, knowledge bases, and usage history from Appwrite before generating.
- Generated media is written to Appwrite Storage and the authoritative slideshow/result metadata is written to the `results` table. Local files are not a persistence backend.
- Missing database records, configured collection assets, hook variables, generated text/metadata, translation output, rasterization output, or requested video output fail the run. They are never replaced with a different model, collection, caption, hashtag set, SVG, or image carousel.
- Scheduled video slideshow exports use Rendi online and persist the MP4 plus first-frame thumbnail to Appwrite Storage. `RENDI_API_KEY` is required only for automations whose database `publish_type` is `video`.

**`lib/queue.ts`** — app-side enqueue/list/get/stats helpers over the same queue.

## Job handlers

- **`echo`** — verification handler.
- **`run-automation`** — full cloud slideshow generation and scheduling. Button-generated runs stay unscheduled and can be marked as published from their status control; scheduled auto-mode runs schedule their social posts.
- **`run-x-automation`** — cloud X/Threads generation.
- **`refresh-knowledge-source`** — cloud knowledge ingestion/refresh.
- **`sync-post-analytics`** — **not handled by the cloud job-worker.** The worker explicitly excludes this job type (`Query.notEqual("type", ["sync-post-analytics"])`); it is drained only by the in-process local worker (`lib/local-automation-job-worker.ts`). Normal analytics refreshes run explicitly from the Analytics view (`POST /api/analytics/report`).
- **`send-notification`** — Telegram reminders and dead-letter alerts.

## Function variables

Never commit provider values. Set these on the **`job-worker` function** before deployment:

- `APPWRITE_API_KEY` — required, with TablesDB and Storage access.
- `APPWRITE_DATABASE_ID` — defaults to `cfarm`.
- `OPENROUTER_API_KEY` — required for slideshow copy; also used for configured AI image matching and best-effort benchmark scoring.
- `POSTFAST_API_KEY` — required when a run has active social integrations, including manual/review runs because media is uploaded for later action.
- `RENDI_API_KEY` — required when the persisted automation requests video export.
- `DEEPL_KEY` — required only for `Chinese`, `Malay`, `Indian`/`Hindi`, or `Spanish` automations.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` — optional as a pair; required to deliver manual/review reminders and dead-letter alerts.
- `BATCH=1` and `LEASE_MS=960000` — runtime controls in the checked-in configuration.

`APPWRITE_FUNCTION_API_ENDPOINT` and `APPWRITE_FUNCTION_PROJECT_ID` are injected by Appwrite. `KIE_KEY` is not consumed by scheduled slideshow execution; it remains used by separate character/image-generation routes. `RENDI_API_KEY` is consumed only when the persisted automation requests video export.

The `job-worker` function also needs `files.read` and `files.write` scopes; both are declared in `appwrite.json`. Sharp is bundled as a function dependency.

## Verification and deployment

Local tests cover deterministic run ids, warmup/manual mode, exact PostFast slot payloads, and byte-for-byte SVG-renderer parity with the app. Queue/provider integration must be verified after deployment with a non-production automation and provider accounts.

After setting variables, deploy from the repository root with either:

```
appwrite push functions
```

or:

```
node appwrite/functions/deploy.mjs
```

The deploy script forwards only variables present in its invoking environment. This code change has not been deployed.
