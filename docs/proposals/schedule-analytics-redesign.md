# Schedule & Analytics redesign — what needs to change

Written 2026-07-15. The scheduling infrastructure is documented in `docs/appwrite-scheduling.md`; this
doc is about the **product surfaces**: the Schedule (Content Calendar) and
Analytics views, rethought around the workflows of a social media manager/analyst running multiple
accounts across multiple platforms.

---

## 0. The two structural problems

1. **Analytics was built as "one TikTok account's numbers", not a reporting product.** One account at a
   time, one hardcoded metric list applied to every platform, no history, no per-post view, no connection
   between content and performance.
2. **The calendar was built as "what PostFast already knows", not a planning product.** It renders only
   posts that already exist on PostFast, so everything a manager actually plans around — upcoming
   auto-generation slots, content being generated right now, warmup posts they must publish by hand,
   failures needing triage — is invisible. The manual-first bootstrap flow (generate + schedule yourself
   before auto-generation is trustworthy) exists only as tribal knowledge; nothing in the UI models it.

Everything below decomposes these two.

---

## Part A — Analytics

### A1. Current state (facts, with file refs)

**UI** — `components/realfarm/calendar-analytics.tsx` `AnalyticsView` (lines ~505–788):
- Header copy is literally "Track your TikTok performance and engagement metrics" (line 683).
- Single-account: one `selectedIntegrationId` dropdown, defaults to `integrations[0]`. No cross-account
  view of any kind.
- One area chart whose `dataKey` is hardcoded to `"views"` and whose Y-axis domain is hardcoded `[0, 4]`
  (lines 753–757) — the chart is effectively broken for real data.
- One ag-grid table of metric totals (Latest / Previous / Change% / Points / Last Updated). "Points" is
  almost always 1 (see A1-data below), so Previous/Change are usually empty.

**API** — `app/api/postfast/analytics/platform/route.ts`:
- Calls PostFast `GET /social-posts/analytics` for one integration and a day range, then flattens a
  **fixed metric list** — `likes, comments, shares, impressions, reach, totalInteractions, videoViews` —
  identically for every provider. Anything the platform returns outside that list is dropped; anything in
  the list the platform doesn't support renders as a dead row.

**Data** — the fundamental limitation:
- PostFast returns `latestMetric` per post — a **snapshot, not a series**. Both consumers turn that into a
  single data point dated `publishedAt`.
- There is no daily analytics sync. `updatePostFastPostAnalytics` exists, but no production caller
  invokes it. The UI hits the PostFast API live on every render/refresh, so stored per-post history never
  accumulates.
- PostFast's `GET /social-media/{id}/follower-history` (daily follower snapshots + net change) is
  **not used anywhere** — the one genuine time-series the API offers is left on the table.

**Per-platform reality (the constraint the user called out):**
- PostFast post analytics cover **Instagram, Facebook, TikTok, Threads, YouTube, LinkedIn company pages,
  Pinterest business**. Notably **not X/Twitter, Bluesky, Telegram, GBP** — accounts on those platforms
  will simply return nothing from `/social-posts/analytics`.
- Even among the covered platforms, `latestMetric` keys differ (e.g. `videoViews` vs `impressions`;
  saves/bookmarks exist on TikTok/IG but not FB; Threads has a much thinner set). The current fixed-list
  approach papers over this and produces misleading zero rows.
- The codebase already has a full 15-provider enum and per-provider *publish* controls
  (`lib/postfast-client.ts`, `lib/postfast-provider-controls.ts`) — publishing is platform-aware, analytics
  is not.

**Disconnected creative scores:** `lib/slideshow-benchmarks.ts` grades every generated slideshow
(hook/pic-text/ICP/conversation, 0–10) and the corpus rows carry real views/likes/saves — but graded
scores and real post performance are never joined. The learning loop ("do high-scoring hooks actually get
views?") can't be closed anywhere in the product.

**Attribution gap:** post records carry `sourceType` (automation / slideshow / manual / external / …) and
`sourceId`, and `manual_posted` records carry an external URL — but analytics never uses any of it.
Hand-posted warmup TikToks leak into account aggregates without attribution.

### A2. Target workflows (social media manager/analyst)

1. **Morning scan (daily, 2 min):** "Across all my accounts, what happened since yesterday? Anything
   spiking or dying?" → needs a cross-account overview, deltas, and top/bottom recent posts. Currently
   impossible without clicking through accounts one by one.
2. **Content review (weekly):** "Which posts worked, which flopped, and what do they have in common?"
   → needs a per-post table: thumbnail, hook text, account, platform, automation, published date, metrics,
   sortable/filterable. Currently no per-post view exists at all.
3. **Feedback into generation:** "Which automations / hook styles / templates earn views?" → needs
   metrics grouped by `sourceType`/`sourceId`/automation, and the benchmark-score ⇄ real-performance join.
4. **Account health (monthly / client reporting):** follower growth, posting consistency, engagement-rate
   trend, period-over-period comparison, export. Currently zero of these.
5. **Warmup monitoring:** "Are my manually-posted warmup posts getting normal reach?" → needs
   `manual_posted`/external posts to appear as first-class attributed rows.

### A3. What needs to change

#### A3.1 Data layer first — accumulate history (prerequisite for everything)

- **New append-only snapshot store** (e.g. `postfast_metric_snapshots` table): one row per
  `(postId, capturedAt)` with the full `latestMetric` map. Add a daily `sync-post-analytics` job as the
  writer (append instead of overwrite; keep `record.analytics` as a derived "latest" cache or
  drop it). Day over day this yields real per-post time-series — views-over-time curves, "post is still
  compounding vs dead" — which `latestMetric` alone can never give.
- **Sync all active accounts' posts, not just published records with local matches** — today unmatched
  remote posts are counted and discarded; store them keyed by `platformPostId` so externally-created posts
  still get series.
- **Wire follower-history:** nightly per-integration fetch of `/social-media/{id}/follower-history` into a
  small `account_follower_snapshots` store (or fetch live — it's already a series server-side).
- **Raise sync frequency for young posts.** Once daily is fine for month-old posts, useless for the first
  48 h where all the signal is. Tiered cadence: posts < 3 days old sync every ~2–4 h (scheduler already
  supports per-owner dedupe keys; add an hourly key for the "young posts" pass), older posts daily.
- **Kill the dual path:** the UI should read the stored snapshots (fast, historical, no rate-limit
  exposure); the Refresh button triggers an on-demand sync for the selected scope instead of a parallel
  live query. `app/api/postfast/analytics/platform/route.ts` in its current form goes away.

#### A3.2 Metric normalization + capability model (the multi-platform fix)

- Define a **canonical metric registry**: `views, impressions, reach, likes, comments, shares, saves,
  clicks, followers, engagementRate(derived)` with per-provider aliases (TikTok `videoViews`→views,
  X `reposts`→shares, TikTok/IG `bookmarks`→saves) and per-provider **capability matrix**: which canonical
  metrics each provider actually returns, plus a per-provider display label ("Saves" on TikTok/IG,
  "Reposts" on X/Threads).
- Rather than hand-maintaining the matrix blind, **learn it from data**: record the union of
  `latestMetric` keys seen per provider during sync; the matrix is seeded with known values and
  self-corrects.
- UI consequences:
  - Never render a metric a platform can't report; no more dead zero rows.
  - Explicit affordance for uncovered platforms: an X/Bluesky/Telegram account shows "Post analytics
    aren't available through PostFast for this platform" (with follower history if available) instead of
    silently empty charts. X own-post analytics, if wanted later, is a separate integration
    (see `cfarm-auto-reply-research`: X API is pay-per-use now) — the capability model gives it a slot.
  - Engagement rate computed consistently (interactions ÷ views or ÷ followers, per platform convention),
    since raw counts aren't comparable across platforms — cross-platform comparison should default to
    rates, not absolutes.

#### A3.3 UI restructure — three levels instead of one screen

**Level 1 — Overview (new default Analytics landing):**
- KPI cards across **all** connected accounts: total views / interactions / posts published / net
  follower change for the selected range, each with period-over-period delta.
- Follower-growth sparkline per account (from follower-history).
- "Top posts" and "Underperformers" strips (thumbnail + hook + headline metric) for the range.
- Account cards → click through to Level 2. Multi-select accounts to overlay-compare (rates, not raw).

**Level 2 — Account view (evolution of the current screen):**
- Real time-series charts from snapshots (fix: no hardcoded `dataKey`, no `[0,4]` domain; metric picker
  driven by the capability matrix; proper empty/loading states).
- Range selector with **comparison period** (vs previous N days) — managers report in deltas.
- Posting-consistency strip (posts/week vs schedule config) — connects analytics back to the schedule.

**Level 3 — Post table (new, the analyst's main tool):**
- Every synced post as a row: thumbnail, content/hook excerpt, account, platform, `sourceType`,
  automation name, published date, canonical metrics, engagement rate, benchmark overall score.
- Sort by any metric; filter by account / platform / date range / sourceType / automation; group-by
  automation with aggregate rows (this IS the feedback loop into generation).
- Row click → post detail: metric-over-time chart from snapshots, link to the slideshow/run viewer,
  link out to the live post (`releaseUrl`/`externalPostId`), benchmark scores side by side with real
  performance.
- `manual_posted`/external posts appear with an "external" badge — warmup posts finally attributable.

#### A3.4 Close the benchmark ⇄ performance loop
- Join `slideshow_benchmarks` scores onto post rows (both key off the slideshow/run).
- A simple scatter (benchmark overall vs actual views, per platform) answers whether the grader predicts
  anything — and over time can recalibrate the rubric or at least which dimensions matter.

#### A3.5 Cleanups to do regardless
- Delete the TikTok-only header copy; title becomes account/platform-aware.
- `PlatformGlyph` in the calendar defaults every unknown provider to the TikTok icon
  (calendar-analytics.tsx:394) — cover the full provider enum (icons already exist for publish surfaces).
- The two chart hardcodes (dataKey `"views"`, Y domain `[0,4]`) are outright bugs — fix even if the
  redesign is phased.

---

## Part B — Scheduling / Calendar

### B1. Current state (facts, with file refs)

`components/realfarm/calendar-analytics.tsx` `ContentCalendarView` (lines ~101–322):
- Month grid only. Data source is exclusively `GET /api/postfast/posts` for the visible month — i.e.
  **only posts that already exist on PostFast** (plus local `awaiting_manual_post` records via the merge).
- **Not shown:** upcoming auto-generation slots, queued/running generation jobs, drafts pending action,
  failed generations. A freshly configured automation produces an **empty calendar** until the first
  worker run completes — exactly the confusion the manual-first bootstrap causes.
- The only forecast of future runs is 2 client-side chips per automation in the automations list
  (`automations-view.tsx:490–527` via `lib/automation-upcoming-posts.ts`) — pure projection, not on the
  calendar, not persisted.
- **Filters:** one checkbox ("Scheduled Posts"). No account, platform, status, automation, or source
  filters.
- **Interactions:** clicking a day highlights it. That's everything. No post preview, no click-through,
  no reschedule, no cancel, no retry.
- Status appears only as a border color (published green / scheduled blue / draft grey / failed red).

**Bootstrap / warmup reality:**
- The flow the product actually requires — *for a new account, manually Generate (drawer button,
  `drawer.tsx:354`) and manually post/schedule (`SlideshowPostModal`) until the account is warmed up,
  then flip `auto_post` on* — is **not modeled anywhere**. `auto_post` is a boolean on
  `tiktok_post_settings`; nothing tracks how many warmup posts happened, nothing prompts "you've done 5
  manual posts, ready to go live?", nothing on the calendar says "warmup post due today".
- `awaiting_manual_post` records + Telegram reminders exist (the plumbing landed per
  `docs/appwrite-scheduling.md`), but the calendar doesn't distinguish them or make them actionable.

**Pipeline/status fragmentation (5 overlapping enums):** `AutomationStatus` (live/paused),
`AutomationRunStatus` (running/succeeded/failed), `SlideshowStage` (generating/completed), slideshow
render `"exported"`, `PostFastPostStatus` (awaiting_manual_post/draft/scheduled/published/failed), plus
synthetic `queued`/`disabled` per social target. No single answer to "where is this piece of content in
its life?"

**Plumbing gaps that surface in UX:**
- `automation-runner.ts:737` — rendered slide media upload to PostFast is still a follow-up: **auto-posted
  slideshows currently go out as caption + hashtags without media**. This silently undermines the entire
  auto-post path and belongs at the top of any priority list.
- Two due-slot implementations (`lib/automation-runner.ts dueAutomationSlots` vs
  `automation-scheduler/src/main.js dueSlots`) can drift — the calendar projection (B3.1) would add a
  third consumer, so extraction into one shared module becomes mandatory, not nice-to-have.
- "Post now" is fake-now (`scheduledAt = now + 60 s`, `postfast-client.ts:252`).
- PostFast's API has create + delete but **no update** — rescheduling means delete + recreate (relevant
  to drag-to-reschedule below).
- Publish failures inside `publishAutomationRun` are swallowed into per-target statuses; failed targets
  are visible only if you open the run viewer.

### B2. Target workflows (social media manager)

1. **Weekly planning:** "Show me next week across all accounts — what's going out, when, and what still
   needs something from me." Requires the calendar to show *planned* slots and *pending actions*, not
   just accomplished facts.
2. **New-account bootstrap:** connect account → warmup period (manually post N times, tracked, prompted)
   → guided switch to auto. Should be a visible, guided state per automation, with warmup tasks appearing
   on the calendar as due items.
3. **Review-before-publish:** many managers won't let an LLM post unattended. Between "fully auto" and
   "fully manual" there's a missing mode: content generates on schedule, lands in a review queue, one
   click approves → schedules into its slot.
4. **Queue management:** reschedule (move to another day/time), cancel, retry a failure, spot gaps
   ("Tuesday has nothing on the fitness account") and collisions (min_gap violations).
5. **Failure triage:** failed generation or failed publish must be loud — on the calendar and in a
   badge/inbox — with a retry affordance, not buried in a run drawer.

### B3. What needs to change

#### B3.1 One calendar item model over the whole pipeline (the core change)

New aggregate endpoint (e.g. `GET /api/calendar?from&to&accounts&platforms&statuses&automations`)
returning a single `CalendarItem[]` union merged from four sources:

| Source | Items | Lifecycle status |
|---|---|---|
| Schedule projection (shared due-slot module run server-side over `automations` for the requested window) | future generation/post slots not yet materialized | `planned` |
| `jobs` table | queued/leased `run-automation` jobs, retries, dead-letters | `generating` / `generation_failed` |
| Local post records | `awaiting_manual_post`, drafts, failures with `error` | `needs_action` / `draft` / `failed` |
| PostFast posts (existing fetch) | scheduled + published | `scheduled` / `published` / `publish_failed` |

Dedupe rule: a materialized item (job/record/post) replaces its projected slot (match on
`automationId + slotISO`, which is already the job dedupe key).

This gives one canonical lifecycle every surface can speak:
`planned → generating → ready(needs review/needs manual post) → scheduled → published`, with `failed`
branches at generation and publish — mapped from the existing five enums rather than replacing them
storage-wise (that migration can come later).

Visual language: solid = exists (scheduled/published), ghost/dashed = projected (`planned`),
pulsing/spinner = `generating`, amber = `needs_action`, red = `failed`. Paused automations' projections
render struck-through (the chips already do this).

#### B3.2 Warmup / bootstrap state machine (the "manual first" fix)

Per automation (or per automation×account target):

- `posting_mode: "manual" | "review" | "auto"` replaces the bare `auto_post` boolean
  (`auto_post:true` migrates to `auto`, `false` to `manual`).
- Optional warmup config: `warmup: { target_posts: number, completed: number }` — every `manual_posted` /
  manually scheduled post attributed to the automation increments `completed`.
- UX: automation card and drawer show a warmup progress pill ("Warmup 3/5"); on reaching the target the
  app prompts "switch to auto-posting?". Until then, scheduled slots still generate content on cadence
  (mode `manual` ⇒ every run lands as `awaiting_manual_post`), and those appear on the calendar as
  **due tasks** ("Post manually — fitness-tips @ 6 pm") with a one-click path into `SlideshowPostModal`
  prefilled, or "mark posted" with URL paste (the `manual_posted` flow that already exists).
- This makes the currently-implicit rule ("press generate and schedule yourself before auto") an explicit,
  visible, guided state — and the empty-calendar problem disappears because warmup slots project as
  planned items too.

#### B3.3 Review mode (`posting_mode: "review"`)

- Generation runs on schedule as today, but instead of publishing, the run lands as `ready_for_review`
  with its slot attached. Approve ⇒ `publishAutomationRun` for that slot; edit ⇒ open viewer first;
  reject ⇒ archived with reason (optionally feeds hook blacklisting).
- Surfaces: a review queue tray on the schedule view ("3 posts awaiting review") + amber calendar items.
  Telegram notification already exists per-run; add approve-link deep into the app.
- Add a per-automation generation lead time so review-mode users can generate hours ahead of the slot.

#### B3.4 Calendar UX proper

- **Views:** Month (density overview), **Week** (the planner's default — hour-positioned items), and
  **List/agenda** (mobile + triage: "everything needing action, then everything upcoming").
- **Filter bar** (persistent, not a lone checkbox): account multi-select (avatar chips), platform,
  lifecycle status, automation, sourceType. Default = everything; saved per user.
- **Item click → detail popover:** thumbnail/first-slide preview, full caption, target accounts with
  per-target status, timestamps, and actions per lifecycle state — view content, edit caption,
  reschedule, cancel, retry publish, open live post, mark posted.
- **Reschedule:** from popover (datetime picker) and drag-and-drop in week view. Implementation:
  PostFast has no update endpoint ⇒ delete + recreate with same media keys; wrap it as one
  `reschedulePost()` seam in `lib/publishing.ts` with the local record updated transactionally
  (recreate first, delete on success, so failure can't lose the post).
- **Day click → agenda panel** for that day (instead of mere highlight), including planned slots —
  with an "add post" affordance that opens `SlideshowPostModal`/asset picker prefilled to that date.
- **Gap/conflict hints:** since projections know the cadence, flag days violating `min_gap_minutes` or
  weeks under the configured posts/week per account.
- **Timezone display:** items render in the automation's timezone with the viewer's local time on hover;
  today nothing indicates which zone the grid is in.
- **Failure surfacing:** red items + a persistent badge count on the Schedule nav item; retry actions
  call the existing internal runner/publish seams.

#### B3.5 Plumbing to fix beneath the UI

Ordered by user-visible damage:
1. **Media upload for auto-posted slideshows** (`automation-runner.ts:737`) — until this lands,
   `auto`/`review` modes publish caption-only posts; arguably a launch blocker for everything above.
2. **Extract one due-slot module** consumed by scheduler function, app runner, and the new calendar
   projection (three consumers = drift is now a correctness bug, since the calendar would show slots the
   worker never fires or vice versa).
3. **Reschedule seam** (delete+recreate wrapper) in `lib/publishing.ts`.
4. **True "post now"** if PostFast supports immediate publish; otherwise label the button honestly
   ("Publish in ~1 min").
5. **Publish-failure propagation:** failed targets write a `failed` post record (they already do) —
   ensure the aggregate endpoint lifts them to calendar/badge visibility instead of drawer-only.

---

## Part C — Suggested build order

Phases sequenced so each ships standalone value; analytics data-layer work starts first because history
only exists from the day you start collecting it.

**Phase 0 — stop the bleeding (small, immediate)**
- Start appending metric snapshots (A3.1 writer change) even before any UI reads them.
- Fix the two chart hardcodes; remove TikTok-only copy; fix `PlatformGlyph` default.
- Media upload for auto-posted slideshows (B3.5-1).

**Phase 1 — calendar tells the truth**
- Shared due-slot module; `GET /api/calendar` aggregate endpoint; render planned/generating/needs-action/
  failed items with the ghost/solid visual language; filter bar; item popover with view + cancel.
- Nav badge for needs-action/failed counts.

**Phase 2 — manager workflows**
- Week + list views; reschedule (popover + drag); day agenda panel with "add post here".
- `posting_mode` tri-state + warmup tracking + guided switch prompt; warmup tasks on calendar.
- Review queue (review mode).

**Phase 3 — analytics rebuild**
- Metric registry + capability matrix; UI reads snapshots; Overview / Account / Post-table three-level
  structure; follower-history wired; uncovered-platform empty states.

**Phase 4 — the loop**
- Benchmark ⇄ performance join, per-automation aggregate rows, comparison periods, export.
- Tiered sync cadence for young posts; external-post attribution polish.

---

## Appendix — key files touched per area

| Area | Files |
|---|---|
| Calendar UI | `components/realfarm/calendar-analytics.tsx` (split into `content-calendar/` + `analytics/` modules — the file already holds two unrelated products) |
| Calendar API | new `app/api/calendar/route.ts`; `lib/automation-upcoming-posts.ts` (absorb into shared due-slot module) |
| Due slots | `lib/automation-runner.ts:533`, `appwrite/functions/automation-scheduler/src/main.js:61` → new `lib/automation-slots.ts` |
| Posting modes / warmup | `lib/realfarm-automation.ts` (schema), `lib/automation-runner.ts:733-765` (mode branch), drawer + overview panel |
| Reschedule | `lib/publishing.ts`, `app/api/postfast/posts/route.ts` |
| Analytics sync | `lib/postfast-analytics-sync.ts`, `appwrite/functions/*` (cadence), new snapshot store in `lib/appwrite-stores.ts` |
| Metric model | new `lib/metric-registry.ts`; retire `app/api/postfast/analytics/platform/route.ts` |
| Analytics UI | new overview/account/post-table components; `benchmark` join via `lib/slideshow-benchmarks.ts` |
