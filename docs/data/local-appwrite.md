---
title: "Local Appwrite"
---

Local development uses the machine-wide shared Appwrite stack at
`http://localhost:9080/v1`, project `cfarm-local`, database `cfarm`. The stack
lives in `~/appwrite-local` and is shared by local projects.

## Start the full app

```bash
pnpm install
pnpm dev
```

`pnpm dev`:

1. Runs `~/appwrite-local/ensure.mjs` to create or recover the shared stack.
2. Verifies the local LumenClip project and schema.
3. Starts the scheduler and job-worker entrypoints as local Node 22 processes.
4. Starts Next.js.

Stopping the command stops its worker and Next.js children. It does **not**
stop the shared Appwrite containers because other projects may be using them.

Use `pnpm dev:web` only when the shared backend and required workers are already
managed separately.

## Environment ownership

- `.env` contains cloud credentials and provider keys.
- `.env.local` contains local Appwrite overrides and is managed by
  `scripts/setup-local-appwrite.mjs`.
- The browser and local workers use `.env.local`; schema/reference sync scripts
  read cloud source credentials from `.env` explicitly.

Do not point `.env` at local Appwrite. Do not copy the local API key back into
cloud environment configuration.

## Schema refresh

```bash
pnpm appwrite:local:setup
```

This idempotently clones tables, columns, indexes, and buckets from cloud,
ensures the consolidated local tables exist, then syncs cloud reference
collections and their referenced Storage files. It does not copy automations,
outputs, or job history. `pnpm dev` uses the lightweight `--ensure` path, so it
does not re-copy reference data on every startup.

Pass `--skip-reference-sync` directly to the setup script only when refreshing
schema without reference data. A full setup can restore a cloud collection that
was intentionally deleted locally; ordinary dev-server restarts do not.

`appwrite/.local/` is the deprecated per-repository stack. Never start Docker
Compose from that directory; it remains only for old-volume recovery.

## Optional user-data imports

Automations remain opt-in user data. Reference data is synced by full setup and
can also be refreshed explicitly:

```bash
pnpm appwrite:local:sync-automations
pnpm appwrite:local:sync-reference
```

The automation command imports cloud automation IDs that are missing locally.
Because a missing row can represent an intentional local deletion, rerunning it
can restore automations previously removed from local Appwrite.

### Local MCP owner

The stdio MCP server must use a local user ID when `.env.local` points Appwrite
at `localhost`. Set this explicitly in `.env.local`:

```bash
LUMENCLIP_MCP_OWNER_ID="<local Appwrite user id>"
```

Use the local user that owns the imported automation and analytics rows. Do not
reuse the cloud `LUMENCLIP_SYSTEM_OWNER_ID`: owner IDs differ between Appwrite
projects even when accounts share an email. The MCP entry point fails fast when
the local override is missing instead of returning deceptively empty reads.

### Reference collections

Cloud and local intentionally both retain image collections. Full local setup
runs the reference sync automatically after matching owners by email. To rerun
only that step:

```bash
pnpm appwrite:local:sync-reference
```

The command:

- maps the cloud owner to the local account by email;
- copies cloud `image_collections` rows into local
  `permanent_assets/source_key=image_collection` rows;
- copies only Storage files referenced by those collections;
- skips existing rows/files, so rerunning it is safe;
- never deletes or mutates cloud collections.

Automation templates are local-only Appwrite reference data. Their cloud rows
were moved into local `permanent_assets` rows with source keys
`automation_template` and `automation_template_example`; the app reads those
rows directly from the shared local project.

## Local functions

There is no local Appwrite functions executor. `pnpm dev` runs the checked-in
function entrypoints through `scripts/run-local-appwrite-function.mjs`:

- `automation-scheduler` every five minutes;
- `job-worker` every minute.

Cloud deployments continue through `appwrite/functions/deploy.mjs`.
