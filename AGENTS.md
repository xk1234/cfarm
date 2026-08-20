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

# Railway backend and Clerk authentication

LumenClip runs on the Railway project `lumenclip`. Railway owns the application
runtime and persistence; Clerk owns browser authentication and sessions.

- Production consists of the Railway `web`, `worker`, and `scheduler` services,
  Railway PostgreSQL, and the private `lumenclip-assets` S3-compatible bucket.
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
  and bucket configuration. The legacy `pnpm dev` wrapper still starts the old
  Appwrite harness and must not be treated as the normal Railway development
  path until that wrapper is removed.
- Appwrite is legacy import/rollback material only. Do not add new runtime
  Appwrite reads or writes, start `~/appwrite-local`, run
  `pnpm appwrite:local:setup`, or deploy `appwrite/functions/`.
- `pnpm railway:migrate:records` and `pnpm railway:migrate:assets` are recovery
  and backfill tools. They are inventory-only unless `--apply` is explicit.
- Production changes must deploy and verify all affected Railway services, not
  an Appwrite Function or a Vercel-only surface.
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

# Workflow run viewer layout

This is the invariant workflow **run** viewer. Creation forms, template pickers,
workflow-definition editors, and blank setup states are separate screens.

Required top-to-bottom order:

1. Existing app chrome.
2. Run header: back to Runs, workflow/run identity, status/time, run actions.
3. Stage navigation: one connected horizontal row of labeled clickable dots.
4. Selected-stage header: stage identity and adjacent previous/next arrows.
5. `Input | Result` tabs.
6. Selected-stage typed content, followed by collapsed raw data.

- Stage navigation is always directly below the run header and above the stage
  header. Never put it at the bottom, in a sidebar, in the inspector, or in a
  second progress control. At 360px only this row may scroll horizontally.
- Stage markers are compact 18–20px dots with the short label outside. Large
  numbered circles, icon tiles, and stage cards do not meet the contract.
- The viewer opens an existing queued/running/failed/completed run directly. It
  never opens on a form or template selection. Starting a workflow creates a
  run, then navigates here.
- Show one stage at a time. `Input` contains exact resolved dependencies and any
  model prompt, including model/attempt metadata and ordered system/user
  messages. Prompt and raw data never receive separate tabs or stages.
- `Input` leads with those resolved dependencies, prompts, variables, and
  attached media. Endpoints, request IDs, token counts, and API/LLM-call records
  are diagnostics and never substitute for stage input.
- `Result` uses a typed renderer for copy, media, collections, image selections,
  storyboards, manifests, QA, and final output. Do not show bare media URLs.
- `Result` leads with the actual typed artifact. API/LLM calls, network requests,
  timings, retries, and provider responses belong in a collapsed `Execution
  trace` after the artifact or in `Raw stage data`; a trace table is never the
  primary result.
- Completed runs are read-only. Rerunning creates a new run/fork with lineage.
- Use one shared viewer shell and shared artifact renderers across projects.
  Workflow-specific code supplies data, labels, and supported actions only.
- Use shared `Button`, `IconButton`, and `Tabs` primitives; never create local
  workflow button styling. Labeled controls are 34–36px high, icon-only controls
  are matching squares, and existing-family icons are 16px before labels.
- Every workflow uses the same default controls and labels: `Back to runs` at
  left in the run header; `Run workflow` at right in the run header; `Run step`
  at right in the selected-stage header; then an adjacent Previous/Next icon
  pair. These are the only default execution controls. Do not rename them to
  Generate, Continue, Run stage, Retry, Rerun, Fork, or workflow-specific terms.
- `Run workflow` executes a draft or creates a new run from historical inputs.
  `Run step` executes the selected step or creates a new fork from that step on
  a historical run. Historical data is never mutated. Keep `Run step` visible
  but disabled with an accessible reason when dependencies are unavailable.
- `Run workflow` is primary only on an editable draft. It uses the secondary
  treatment on completed or failed historical runs.
- Conditional controls are capability-driven: `Cancel workflow` only while
  queued/running, `Resume workflow` only while paused, and Download/Open output
  only for a selected final artifact that supports them. Do not add persistent
  Save, Publish, Approve, Share, or overflow buttons for toolbar symmetry.
- Page/run actions stay at the right of the page/run header. Stage actions stay
  at the right of the selected-stage header, followed by one adjacent
  Previous/Next pair. Do not duplicate actions below tabs, inside artifacts, or
  in a bottom bar. Template/choice cards are one clickable target without an
  inner redundant action button.
- Do not add floating scroll arrows, sticky action bubbles, or viewport-edge
  shortcuts. Scrolling is native and actions stay in their assigned headers.
- Tabs are text with an active underline, never pills or bottom navigation.
  Loading disables the trigger, preserves its width, and uses the shared
  labels `Running workflow…` or `Running step…`. Icon-only controls require
  accessible names and tooltips.
- Use compact monochrome workspace styling and preserve the same region order at
  360px without page-level horizontal scrolling.
