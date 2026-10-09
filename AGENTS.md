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

# Railway backend and Clerk authentication

LumenClip runs on the Railway project `lumenclip`. Railway owns the application
runtime and persistence; Clerk owns browser authentication and sessions.

- Production consists of the Railway `web` service, a five-minute `worker` cron,
  Railway PostgreSQL, and the private `lumenclip-assets` S3-compatible bucket.
  The retired template `scheduler` service stays stopped. The worker uses
  `railway.worker.json` and exits after draining due notifications (up to 100
  batches or four minutes); notification delivery can be delayed by several minutes.
- PostgreSQL is the runtime source of truth. Apply checked-in migrations with
  `pnpm railway:db:migrate`; Railway injects `DATABASE_URL` into its services.
- Runtime data and assets use `LUMENCLIP_DATA_BACKEND=railway` and
  `LUMENCLIP_ASSET_BACKEND=railway`. Bucket access uses the `RAILWAY_BUCKET_*`
  variables. Buckets remain private; application routes and short-lived signed
  downloads are the public media boundary.
- Clerk is the only browser auth/session boundary. Use
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`; do not recreate
  password, verification, recovery, or application-session APIs.
- For local web work, use `pnpm dev:web` with a Railway-compatible PostgreSQL
  and bucket configuration.
- Do not add Railway SDKs, credentials, runtime reads/writes, local harnesses,
  or Railway Function deployments.
- Production changes must deploy and verify all affected Railway services.
- Never print Railway variable JSON, bucket credential JSON, Clerk secrets, or
  database URLs. Keep local secrets in ignored environment files.

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
