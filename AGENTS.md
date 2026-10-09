<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI conventions

In-app page and section headings stand alone. Do not add explanatory subtitles beneath them.

## Shared controls and layout

The multi-stage workflow run viewer and its contract were removed with
automations. Rendering a slideshow spec is a single step, so no run/stage
inspector layout applies. These general rules remain:

- Use the project's shared `Button`, `IconButton`, and `Tabs` primitives. Pages
  must not invent local button CSS, sizes, radii, icons, or loading states.
- Buttons are 34–36px high with 16px existing-family icons before labels. Icon-
  only controls are square, have accessible names and tooltips, and never replace
  labeled unfamiliar actions. Tabs are text tabs with an underline, not pills.
- Page-level actions sit at the right of the page header. Never put primary
  actions in multiple places.
- Loading states keep the trigger's width, disable it, and change its label to a
  progressive form (for example `Rendering…`).
- Choice cards are fully clickable and do not contain a second redundant action
  button.
- Do not add floating scroll arrows, sticky action bubbles, or viewport-edge
  shortcuts. Scrolling remains native.
- At 360px, keep the same region order, stack header details and actions, and
  avoid page-level horizontal scroll.

# Railway hosting + Appwrite Cloud data

LumenClip runs its web app and worker on the Railway project `lumenclip`; data
and files live in Appwrite Cloud; Clerk owns browser authentication.

- Railway services: `web` (Next.js, `railway.json`) and `worker`
  (`railway.worker.json`, `pnpm worker`: a long-running lease-based job loop
  plus in-process sweeps). There is no scheduler service, no Railway
  PostgreSQL or bucket in the runtime, and no Appwrite Function.
- Appwrite TablesDB (database `lumenclip`) is the runtime source of truth;
  private Storage buckets `media` and `renders` hold all binaries. Use TablesDB
  rows, not Databases/documents.
- The schema is declared in `lib/data/appwrite/schema.mjs` and applied with
  `pnpm appwrite:provision` (idempotent; `--dry-run`, `--check`, `--prune`).
  `pnpm appwrite:check` must pass. Never create tables, columns, indexes or
  buckets by hand in the console.
- Only `lib/data/appwrite/*` and `scripts/appwrite-provision.mjs` may import
  `node-appwrite` (eslint enforces it). Feature code uses `getRepositories()`
  from `@/lib/data` and passes the workspace id explicitly
  (`workspace_id` = Clerk user id; single-user, no teams).
- Tests use the in-memory repositories (`vitest.setup.ts` forces
  `LUMENCLIP_DATA_BACKEND=memory`) and never touch Appwrite Cloud.
- Tables and buckets have no Appwrite permissions; only the server API key can
  access them. Ownership is enforced by the repositories. Buckets stay
  private: `/api/files/[bucket]/[id]` (ownership-checked, or a short-lived
  signed token) and HMAC-signed share links are the only public media
  boundary.
- Background work goes through the `jobs` table: enqueue with
  `repos.jobs.enqueue`, register handlers in `lib/jobs/handlers.ts`, and keep
  handlers idempotent.
- Clerk is the only auth/session boundary (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`); do not use Appwrite Auth or Appwrite client SDKs, and do
  not recreate password, verification, recovery, or application-session APIs.
- Do not reintroduce Postgres, drizzle, pg-boss, S3 clients, Railway buckets,
  or Railway SDKs/credentials in code.
- Production changes must deploy and verify every affected Railway service and
  run `pnpm appwrite:check` against production
  (`railway run --service web -- pnpm appwrite:check`).
- Never print Appwrite API keys, Railway variable JSON, Clerk secrets, or env
  values. Keep local secrets in ignored environment files.

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
