---
title: "Backend architecture"
---

LumenClip's data and files live in **Appwrite Cloud** (TablesDB + Storage).
The Next.js web app and one background worker run on **Railway**. **Clerk** is
the only browser auth/session boundary. The design rationale is in
`docs/refactor/03-appwrite-data-layer.md`.

## Data layer (`lib/data`)

Feature code imports only `@/lib/data`:

- `types.ts` — domain types (templates, renders, collections, media, posts,
  settings, notifications, API keys, jobs) and zod schemas for JSON columns.
- `repositories.ts` — repository contracts. Every workspace-scoped method takes
  the workspace id (the Clerk user id) explicitly; a row owned by another
  workspace behaves like a missing row.
- `memory.ts` — in-memory reference implementation, used by all unit tests.
- `appwrite/` — the Appwrite implementation, the only code that imports
  `node-appwrite`:
  - `schema.mjs` declares every table, column, index and bucket. Both the
    adapter and `scripts/appwrite-provision.mjs` read it.
  - `repositories.ts` maps rows to domain objects and validates JSON columns on
    read.
  - `fake.ts` is an in-process TablesDB/Storage fake that enforces the declared
    schema; `contract.test.ts` runs the same contract tests against memory and
    the Appwrite adapter.
- `getRepositories()` picks the backend from `LUMENCLIP_DATA_BACKEND`
  (`memory` or `appwrite`; Appwrite is the default outside tests).

## Tables

| Table | Holds |
| --- | --- |
| `specs` | Slideshow templates (JSON spec + denormalised counts) |
| `renders` | One render: frozen resolved spec, status, output file list |
| `collections` | Image/video collections (unique name per workspace, 30-day trash) |
| `media` | Every stored upload or collection item (bucket `media`) |
| `posts` | One render going to one SocialBu account; calendar source |
| `workspace_settings` | Timezone, hidden accounts, reminders, render defaults |
| `notifications` | In-app inbox and reminders |
| `api_keys` | Hashed workspace API keys for `/api/v1` and MCP |
| `jobs`, `job_leases` | Durable background work and atomic claims |

Appwrite has no compare-and-set, so atomicity comes from row ids and unique
indexes: idempotent creates use deterministic ids (renders by idempotency key,
posts by intent key, notifications by dedupe key, jobs by dedupe key), and a
job claim creates `job_leases/<jobId>.<attempt>` — a 409 means another worker
won.

## Files

Buckets `media` and `renders` are private (no permissions, file security off).
Stored file names carry the owning workspace, and every read checks it.

- `GET /api/files/[bucket]/[id]` serves a file to the owning Clerk session, to
  a workspace API key with the bucket's read scope, or to anyone holding a
  valid short-lived signed token (`repos.blobs.signedUrl`, signed with
  `FILE_URL_SECRET`, falling back to `SLIDESHOW_SHARE_SECRET`). Everything else
  is a 404.
- Public share links (`/share/slideshows/[id]`, `/api/public/slideshows/...`)
  keep their HMAC tokens and read the render's slides from the `renders`
  bucket.
- Remote media (Pinterest, Pexels, URL imports) is copied into storage at pick
  time by `lib/files/remote-fetch.ts` (public-address check on every redirect
  hop, streaming size cap, content-type check) and `lib/files/ingest.ts`
  (format sniffing, sha256 dedupe).

## Background work

`scripts/worker.mts` runs `lib/jobs/worker.ts` on the Railway `worker`
service. See [Railway worker](../reference/railway-worker-operations.md).

## Provisioning

`pnpm appwrite:provision` creates the database, tables, columns, indexes and
buckets, waits for them to become available, and updates bucket settings. It
reports — never alters — column or index definitions that differ.
`--dry-run` prints the plan, `--check` exits 2 on any drift, and
`--prune [--yes]` lists (or deletes) undeclared columns, indexes and tables.
On Railway: `railway run --service web -- pnpm appwrite:check`.
