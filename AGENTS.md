<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI conventions

In-app page and section headings stand alone. Do not add explanatory subtitles beneath them.

All workflow inspectors and workflow-result surfaces must follow
[docs/reference/workflow-inspector-design-contract.md](docs/reference/workflow-inspector-design-contract.md).
Do not create workflow-specific stage navigation or generic JSON/result cards
when the shared inspector and artifact renderers cover the use case.

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

# GitHub publishing in the shared workspace

Read [docs/reference/agent-github-publishing.md](docs/reference/agent-github-publishing.md)
before committing, pushing, merging, or deploying.

- The worktree and Git index are shared with other agents. Inspect both
  `git status --short` and `git diff --cached --name-status` immediately before
  every commit. If the index contains unrelated files, do not commit, unstage,
  discard, or overwrite them.
- Stage explicit paths only. Never chain `git add` and `git commit` into one
  command in this workspace; the mandatory cached-diff inspection must happen
  between them.
- If `git push` returns 403 after `gh auth status` succeeds, never print or
  embed tokens. Retry once after `gh auth setup-git`; if it still fails, use
  the connected GitHub app's file/branch/PR tools.
- Merge only the checked PR head SHA, then verify the `main` production
  deployment reaches `READY`. A successful preview is not a production
  deployment.
