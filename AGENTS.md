<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Local Appwrite backend (shared stack)

Local dev uses the machine-wide shared Appwrite instance at
`http://localhost:9080/v1` (project `cfarm-local`, database `cfarm`) — one
stack in `~/appwrite-local` serves all local projects. Cloud creds stay in
`.env`; local overrides live in `.env.local` (managed by
`scripts/setup-local-appwrite.mjs`).

- `pnpm dev` ensures the shared stack is up automatically (via
  `node ~/appwrite-local/ensure.mjs`), then runs Next + in-process function
  loops. Do NOT stop the shared stack when you're done — other projects use
  it, and leaving it running is what keeps startup instant.
- `pnpm appwrite:local:setup` re-clones the schema from cfarm cloud into
  `cfarm-local` (idempotent).
- Appwrite functions run in-process via
  `scripts/run-local-appwrite-function.mjs` — there is no local functions
  executor. Deploys go to cloud via `appwrite/functions/deploy.mjs`.
- `appwrite/.local/` is the DEPRECATED old per-repo stack (kept only so its
  data volumes can be recovered). Never `docker compose up` from it.
