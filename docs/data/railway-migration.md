---
title: "Railway runtime"
---

LumenClip runs on Railway PostgreSQL and a private S3-compatible bucket.
Clerk owns browser identity; the application owns domain records under stable
owner IDs.

## Runtime topology

| Resource | Responsibility |
| --- | --- |
| PostgreSQL | Domain records, output media, jobs, users, and operational metadata |
| Private bucket | Uploaded media, generated slides, videos, thumbnails, and demos |
| Web | Next.js application and MCP HTTP surface |
| Worker | Durable job execution for generation, analytics, and publishing work |
| Scheduler | Computes due automation slots and enqueues idempotent jobs |

## Storage model

The `domain_records` table is the compatibility boundary for logical JSON
stores. Its `table_name`, `source_key`, owner, RID, status, ordering, and JSONB
payload preserve the original record identity while allowing indexed reads.
Output media is normalized into `output_media`.

Private objects are addressed by deterministic bucket and file IDs derived from
the data-relative path. Browser clients never receive bucket credentials;
application routes stream authorized media and signed downloads remain
short-lived.

## Operations

```bash
pnpm railway:db:migrate
```

Apply this command on deploy and before starting web, worker, or scheduler.
Database migrations are checked in under `infra/railway/migrations`.

Never print database URLs, bucket credentials, Clerk secrets, or provider keys.
Production changes must be verified across web, worker, scheduler, PostgreSQL,
and bucket-dependent paths.

## Acceptance checks

- A generation creates its run/output records and normalized media rows.
- Generated media streams through application routes and public share URLs.
- Publishing creates canonical post records and publication projections.
- Analytics snapshots attach to the correct post and integration.
- Scheduled jobs are deduped, leased once, retried safely, and dead-lettered.
- MCP can read the same persisted artifacts with the caller's owner scope.
