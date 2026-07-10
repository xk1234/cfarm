# Scheduling & Job Queue on Appwrite

The app was originally **local-only** — no deployment, and its scheduling was a leftover Vercel-cron config (`vercel.json`, now deleted) that assumed a hosted URL. Since the new app uses **Appwrite as its backend**, scheduling and background work now run entirely inside Appwrite: cron **Functions** + a durable **jobs queue table**. Nothing depends on the app being reachable at a URL.

## Architecture

```
 automation-scheduler  (Appwrite Function, cron */5)
        │  reads the `automations` table, computes which are "due"
        │  (ported due-slot logic, luxon, per-automation timezone),
        ▼  enqueues one job per due slot (deduped by automation+slot)
 ┌──────────────┐
 │  jobs table  │  durable queue in TablesDB
 └──────────────┘  columns: type, status, payload, priority, attempts,
        ▲          max_attempts, available_at, leased_by, leased_until,
        │          result, error, dedupe_key, created_at, updated_at
        │  claims queued (and lease-expired) jobs, dispatches by type,
 job-worker  (Appwrite Function, cron * * * * *)
             marks completed / retries with backoff / dead-letters
```

Both functions run server-side in Appwrite using an `APPWRITE_API_KEY` variable (full-access) against the migrated `cfarm` database. The local Next app is now just a UI/control panel over the same Appwrite data — it can enqueue jobs and read queue state via `lib/queue.ts`, but it is not required for scheduling to work.

## Components

**`jobs` table** — the queue. Created in TablesDB with indexes on `status`, `type`, `dedupe_key`, `available_at`. Deterministic row ids (hash of `dedupe_key`) give idempotent enqueues.

**`automation-scheduler`** (`appwrite/functions/automation-scheduler`, cron `*/5 * * * *`) — reads all `automations` rows, and for each `live`, non-paused automation computes due posting slots (faithful port of `dueAutomationSlots` from `lib/automation-runner.ts`, using each automation's `schedule.timezone` + `posting_times`/`interval`). Enqueues a `run-automation` job per due slot, deduped by `auto:{id}:{slotISO}` so re-runs within the lookback window don't double-enqueue. Variables: `APPWRITE_DATABASE_ID` (cfarm), `LOOKBACK_MINUTES` (10).

**`job-worker`** (`appwrite/functions/job-worker`, cron `* * * * *`) — claims up to `BATCH` queued jobs (and reclaims `processing` jobs whose `leased_until` has passed), leases them (`leased_by`/`leased_until`), dispatches to a handler, then marks `completed`, retries with exponential backoff (`queued` + future `available_at`), or dead-letters (`dead`) after `max_attempts`. Variables: `APPWRITE_DATABASE_ID`, `BATCH` (10), `LEASE_MS` (120000).

**`lib/queue.ts`** (app side) — `enqueueJob`, `listJobs`, `getJob`, `queueStats` so the app can push jobs (e.g. asset generation) and render a queue dashboard, all against the same table.

## Job handlers

The worker has a `handlers` map keyed by job `type`:

- **`echo`** — returns its payload (used for verification).
- **`run-automation`** — records a durable, deduped run row in `automation_runs` (status `accepted`). **This is the integration point for the media pipeline.** The heavy generation (LLM copy → image/video via OpenRouter/KIE, video assembly via Rendi, upload to Storage, then social posting) plugs in here as cloud HTTP calls using function variables for the provider keys — most of the existing pipeline is already HTTP-based and runs fine in a function. It's left as an explicit, honest boundary rather than a faked success. Add new job types by adding handlers.

## Verified

- Worker drains the queue: enqueued `echo` + `run-automation` jobs → both `completed`, `run-automation` created an `automation_runs` row.
- Scheduler enqueues real due automations: with the default 10-minute lookback, a temporarily-due automation produced exactly one correctly-scheduled `run-automation` job (then reverted).
- App-side `lib/queue.ts`: enqueue / dedupe / get / list / stats all round-trip against the live table.
- Retry/backoff/dead-letter and lease-reclaim paths are implemented in the worker.

## Redeploy / manage

```
# Appwrite CLI (from repo root, logged in):
appwrite push functions

# or the SDK deploy script used during migration (creates functions, sets vars, uploads):
node deploy-functions.mjs
```

Provider API keys for the generation pipeline should be added as **variables on `job-worker`** (not committed), mirroring the app's `.env` provider keys.
