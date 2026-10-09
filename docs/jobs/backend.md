---
title: "Backend scheduling"
description: "How background jobs, scheduled posts and reminders run on the Railway worker and the Appwrite jobs table."
---

Background work runs on one long-running Railway `worker` service that polls
the Appwrite `jobs` table. There is no scheduler service and no Appwrite
Function. Recurring automations were removed with the rendering-engine
refactor; nothing generates content on a timer.

## Job types

| Type | Enqueued by | What it does |
| --- | --- | --- |
| `render-slideshow` | API/MCP renders too large to render inline | Renders the frozen resolved spec and writes `<renderId>-NN` files to the `renders` bucket. |
| `publish-post` | The worker's minute sweep, for due scheduled posts not yet handed to SocialBu | Uploads the render to SocialBu and creates the post. |
| `notify` | The worker's minute sweep, for pending in-app notifications that are due | Marks the notification delivered so it appears in the inbox. |

## Lifecycle

```text
enqueue (deterministic id when deduped)
  -> jobs: queued, run_at
  -> worker claim: job_leases/<jobId>.<attempt> (409 = another worker won)
  -> jobs: running, lease renewed while the handler works
  -> succeeded | queued again with backoff | dead after max_attempts
```

Handlers are idempotent: a job can run again after a crash or an expired
lease. Scheduled posts keep their own `publish_at`; SocialBu publishes at that
time once the post is created there, so the worker only needs minute-level
precision.

See [Railway worker](../reference/railway-worker-operations.md) for operating
the service.
