---
title: "Legacy Appwrite recovery"
---

Appwrite is no longer part of LumenClip's development or production runtime.
This page records the remaining recovery boundary for old data; it is not a
local setup guide.

## Current local development

Run \`pnpm install\`, then \`pnpm dev:web\`. Use a Railway-compatible PostgreSQL
database and private S3-compatible bucket. \`pnpm dev\` is now an alias for the
same Next.js development server. Neither command starts Appwrite, a worker, or
a scheduler.

Apply checked-in database migrations with \`pnpm railway:db:migrate\`. Run
workers separately with \`pnpm railway:worker\` or \`pnpm railway:scheduler\`
when the flow under test needs them.

## Recovery-only material

The \`appwrite/\` directory and the \`legacy:appwrite:*\` package scripts are kept
only to inventory, recover, or roll back old Appwrite data. They must not be
used for new runtime reads, writes, local development, or production deploys.

Record and asset backfills into Railway remain dry-run inventory operations
unless \`--apply\` is explicitly supplied:

\`\`\`sh
pnpm railway:migrate:records
pnpm railway:migrate:assets
\`\`\`

Keep Appwrite credentials out of normal Railway service configuration. See
[Railway migration](./railway-migration) for the completed cutover and
[Backend architecture](./backend-architecture) for the current topology.
