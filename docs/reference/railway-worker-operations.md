# Railway worker

The production `worker` service uses `/railway.worker.json`: build runs
`pnpm worker:check` (loads the handler registry without connecting), and the
service runs `pnpm worker` continuously with `restartPolicyType: ON_FAILURE`.
There is no cron schedule and no `scheduler` service.

## What the worker does

`scripts/worker.mts` wires `lib/jobs/worker.ts` to `getRepositories()`:

1. **Sweeps** (every minute, in-process): pending in-app notifications whose
   `deliver_at` has passed become `notify` jobs, and scheduled posts that are
   due and were not yet handed to SocialBu become `publish-post` jobs. Sweep
   jobs use deterministic ids, so several replicas never double-enqueue.
   Hourly, lease rows older than seven days are purged.
2. **Claims** up to `WORKER_CONCURRENCY` (default 2) queued jobs whose `run_at`
   has passed, plus running jobs whose lease expired. A claim creates the row
   `job_leases/<jobId>.<attempt>`; a 409 means another worker won.
3. **Runs** the handler from `lib/jobs/handlers.ts`, renewing the lease every
   third of its length (default lease 2 minutes). Success marks the job
   `succeeded`; failures retry with exponential backoff until `max_attempts`,
   then become `dead`. `PermanentJobError` stops retries; `RetryJobError` picks
   the next attempt time.
4. **Sleeps** adaptively (1 s up to 20 s) when idle. `POST /wake` on
   `WORKER_PORT` (or `PORT`) cuts the sleep short; web code can call
   `wakeWorker()` (`lib/jobs/wake.ts`) after enqueueing, using
   `WORKER_WAKE_URL` on Railway private networking. `GET /health` reports
   liveness.

## Handlers

| Job type | Owner | Status |
| --- | --- | --- |
| `notify` | backend | Implemented: flips a pending notification to delivered. |
| `render-slideshow` | render engine | Placeholder: retries every 15 minutes until a handler is registered. |
| `publish-post` | publishing | Placeholder: retries every 15 minutes until a handler is registered. |

## Operating it

- `pnpm worker:once` runs one forced sweep and one claim batch, then exits.
- Required variables: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`,
  `APPWRITE_API_KEY`. `LUMENCLIP_DATA_BACKEND` must be unset or `appwrite`.
- Verify a deploy by checking the `worker started` log line and, after
  enqueuing work, `job succeeded` lines. Never print variable values.
