# Railway notification worker

The production `worker` uses `/railway.worker.json`, with `pnpm railway:worker:once`
run every five minutes (UTC). It drains due notification jobs until the queue is
empty, 100 batches have run, or four minutes have elapsed. The invocation has a
270-second hard deadline, closes PostgreSQL and telemetry connections, and exits.
Railway may start cron runs a few minutes late, so notifications are not immediate.
Windmill owns generation workflows; this worker handles notification jobs.

The `scheduler` service is retired and should remain stopped. Its handler only
reports that templates generate drafts on demand. The launcher also exits after
that no-op to prevent accidental redeployments from running indefinitely.

Set the worker service's Railway config path to `/railway.worker.json` before
uploading this repository. The web service continues to use `/railway.json`.
No schema migration is needed for this change. A successful cron run may show as
completed rather than remain running; verify `processed ..., failed ...` logs,
the absence of runtime errors, and the next scheduled run.

For a temporary continuous worker, clear the cron schedule and use the normal
`railway.json` config (`pnpm railway:start` dispatches to `pnpm railway:worker`).
Restore the cron config afterward. Do not redeploy the old `.mts` launcher: tsx
loads its default-imported service handlers as objects, causing `handler is not a
function` on every tick. Runtime regression tests exercise the `.ts` entrypoint
through an actual Node/tsx subprocess rather than Vitest's module transform.
