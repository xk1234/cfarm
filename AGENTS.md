<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI conventions

In-app page and section headings stand alone. Do not add explanatory subtitles beneath them.

## Workflow run viewer layout

The authoritative contract is
[the workflow run viewer contract](docs/reference/workflow-inspector-design-contract.md).
Follow it exactly for every workflow run surface.

- A workflow viewer shows one persisted or in-progress **run**. It never starts
  with a template picker, creation form, workflow setup, or blank editor. Those
  belong on separate routes and lead into the viewer after a run exists.
- Use this invariant top-to-bottom order inside the project shell: app chrome,
  run header, stage navigation, selected-stage header, `Input | Result` tabs,
  selected-stage content. Do not rearrange these regions.
- Stage navigation is one connected horizontal row of labeled clickable dots
  immediately below the run header and above the selected-stage header. It is
  never at the bottom, in a sidebar, inside the content panel, or represented as
  cards. On narrow screens only this row may scroll horizontally.
- Stage markers are compact 18–20px dots. Put the short stage label outside the
  marker; do not turn markers into large numbered circles, numbered stepper
  chips, icon tiles, cards, or a second progress bar.
- The run header contains back-to-runs navigation, workflow/run identity, run
  status and time, and run-level actions. The selected-stage header contains
  stage index/title/kind/status plus adjacent previous/next arrow buttons.
- Show one stage at a time in one inspector surface. The only primary views are
  `Input` and `Result`. A model prompt is a typed input and appears in `Input`
  with ordered system/user messages plus model and attempt metadata.
- `Input` leads with the exact resolved dependencies received by the stage,
  including prompt messages, model, attempt, variables, and attached media when
  applicable. API endpoints, request IDs, token counts, and call records are
  diagnostics and never substitute for resolved input.
- Completed-run data is read-only. Rerunning a workflow or stage creates a new
  run/fork and never mutates the historical run being inspected.
- Keep raw structured data in a collapsed `Raw stage data` disclosure after the
  typed content. Raw data is not a tab, stage, default view, or substitute for
  an artifact renderer.
- Render typed results as their actual artifact: readable copy, message blocks,
  image/media previews, collection mosaics, storyboard, manifest, QA checklist,
  or final publishable output. URLs alone are not media previews.
- `Result` leads with the actual typed artifact produced by the stage. API/LLM
  calls, network requests, timings, and provider responses belong in a collapsed
  `Execution trace` after the artifact or in `Raw stage data`. Never make a call
  log, trace table, endpoint/status/duration grid, or API-call filter row the
  primary Result view.
- Use the shared workflow shell and artifact components. Feature code provides
  run/stage data; it must not create a workflow-specific viewer layout.
- Use the project's shared `Button`, `IconButton`, and `Tabs` primitives. Workflow
  pages must not invent local button CSS, sizes, radii, icons, or loading states.
- Every workflow uses the same default action inventory and labels: `Back to
  runs` in the run header, `Run workflow` at the right of the run header, `Run
  step` at the right of the selected-stage header, and adjacent Previous/Next
  icon buttons after `Run step`. Do not rename these by workflow type.
- `Run workflow` and `Run step` are the only default execution buttons. On a
  draft they execute the draft; on a historical run they create a new run/fork
  and never mutate history. Disable `Run step` with an accessible reason when
  its dependencies are unavailable.
- `Run workflow` is primary only on an editable draft. On completed or failed
  historical runs it remains present but uses the secondary treatment because
  it creates a new run rather than advancing the inspected one.
- Conditional actions are not defaults: `Cancel workflow` appears only while
  queued/running; `Download` or `Open output` appears only for a final artifact
  that supports it; destructive actions stay in an overflow menu unless they
  are the immediate recovery action. Do not add Save, Rerun, Retry, Fork,
  Continue, Generate, or workflow-specific synonyms to the standard toolbar.
- Action placement is fixed: page-level actions at the right of the page/run
  header; stage-level actions at the right of the selected-stage header;
  previous/next as one adjacent icon-button pair after stage actions. Never put
  primary actions below the inspector, inside artifacts, or in multiple places.
- Do not add floating scroll arrows, sticky action bubbles, or viewport-edge
  shortcuts. Scrolling remains native; actions stay in their assigned headers.
- Buttons are 34–36px high with 16px existing-family icons before labels. Icon-
  only controls are square, have accessible names and tooltips, and never replace
  labeled unfamiliar actions. Tabs are text tabs with an underline, not pills.
- Completed runs are read-only and have no Save button. Editable pre-run forms
  autosave draft inputs; loading changes the two execution labels to `Running
  workflow…` or `Running step…`, disables the trigger, and preserves its width.
  Template/choice cards are fully clickable and do not contain a second
  redundant action button.
- At 360px, keep the same region order, stack header details and actions, and
  preserve visible previous/next controls without page-level horizontal scroll.

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
