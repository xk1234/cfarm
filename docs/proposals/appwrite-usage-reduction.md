# Appwrite usage reduction — full options list

Date: 2026-07-16. Basis: 5 parallel code audits (data layer, polling/workers, API routes, workspace load, asset/bandwidth). This is a decision menu, not a plan — pick what you want and I'll implement it.

---

## 0. Frame it correctly: you have TWO separate meters

Codex blended these; they have different fixes.

- **Database reads (the crisis — 87% of cap).** Appwrite bills **1 read per ROW returned**, regardless of fields selected. So the only ways to cut read *count* are: return fewer rows (limits/filters/pagination), count via `total` instead of fetching rows, shrink tables (archival), poll less, or cache/skip the read. `Query.select` does **not** reduce read count.
- **Bandwidth (33 GB, not yet capped).** Driven almost entirely by the asset/video proxy. Fixed by streaming, caching headers, thumbnails, and `preload`.

**The one root cause behind ~90% of the read spend:** every list/read in the app funnels through `awReadTable` (`lib/json-store.ts:179`), which **paginates the entire owner-scoped table** (100/page loop) with no caller limit or filter. Every `?limit=`, `?id=`, `status`, `automationId` you see is applied **in memory after the whole table is already read and billed.** Fix this one primitive and most line items below collapse.

---

## 1. Corrections to the Codex audit (so you trust the numbers)

| Codex claim | Reality (verified in code) |
|---|---|
| Calendar badge polls the **whole calendar every minute**, ~150K reads/day | **Already fixed.** `navigation.tsx:68` uses `/api/calendar/summary` at **10-min** interval, `refreshWhenHidden:false`, reads **≤26 rows/tick** (`lib/calendar-summary.ts`). Real cost ≤3,744/day per open tab. This is *not* a top offender. |
| Local worker polls **twice every 15s**, ~11,520 reads/day | Interval is **5 min**, reads ≤3 rows/tick, and it's **gated off by default** (`ENABLE_LOCAL_AUTOMATION_WORKER`, `instrumentation.ts:5`). Near-zero unless you enabled it. |
| Cloud workers ~8K reads/day | `job-worker` is bounded (≤3 rows/tick) — fine. But `automation-scheduler` **full-scans two entire tables every 5 min** — Codex undercounted this one. |
| (not mentioned) | **The single worst read source is the generation drawer's 4-second poll** — Codex missed it entirely. See L1 below. |

Net: Codex's #1 priority (calendar polling) is already done. The true priorities are the drawer poll, the scheduler scan, and the `awReadTable` design itself.

---

## 2. Database-read reduction — full list

Legend: **Impact** = share of read spend removed · **Effort** S/M/L · **UX/behavior change?**

### Tier A — structural (kills the root cause; highest leverage)

- **A1. Add `limit`/`queries` passthrough to `awReadTable`/`readJsonArrayStore`** (`lib/json-store.ts:44,179`). Let callers push `Query.limit(n)`, `Query.equal("status",…)`, `Query.equal("automation_id",…)`, cursor. `queue.listJobs` (`lib/queue.ts:115`) already does this — copy it. **Impact: very high** (unblocks A2–A5, L1, and every "scan-then-slice" route). Effort: M. Behavior change: none.
- **A2. Server-side single-row lookups instead of scan-then-`.find`.** `slideshows/[id]`, `generated-videos/[id]`, `knowledge-bases.getKnowledgeBase` (`lib/knowledge-bases.ts:68`) all read the whole table to find one row by id. Use an indexed `Query.equal` on a `rid` column. **Impact: high** on detail-page views. Effort: M (needs A1 + an index on `rid`). Behavior change: none.
- **A3. Fix `withJsonArrayStore` double-scan + `awWriteTable` id-scan** (`lib/json-store.ts:133,269`). Every mutation via this path reads the **entire table twice** (once to load, once to diff `$id`s — and it pulls the full 1 MB `data` blob just to collect ids). Switch mutations to the already-existing bounded `upsertJsonArrayRecord`/`appendJsonArrayRecords`/`deleteJsonArrayRecord` primitives where possible, and at minimum `Query.select(['$id'])` the diff scan. **Impact: high** (every save/generate currently pays a full read). Effort: M. Behavior change: none.
- **A4. Count via `total`, never by fetching rows.** `slideshows/route.ts:22-29` scans `results` a **second time** just to compute `slideshowsCount`/`videosCount`. Same anti-pattern in `postfast-analytics.ts:125`. Use `Query.limit(1)` + `res.total` (as `queue.queueStats` already does). **Impact: medium-high** (halves the slideshow gallery cost). Effort: S. Behavior change: none.
- **A5. Stop `listAutomationRuns` from also scanning `results`.** `enrichRunsWithRenderedSlides` (`lib/automation-runner.ts:786`) makes every runs read *also* full-scan the `results` table — this doubles the cost of the hottest call (calendar, drawer, slideshow detail). Fetch only the needed slideshow ids, or denormalize rendered-slide data onto the run row. **Impact: high.** Effort: M. Behavior change: none.

### Tier B — polling (cut read *frequency*)

- **B1. 🔴 Drawer generation poll — the worst offender** (`drawer.tsx:140`). Every **4 seconds** during any generation it hits `/api/automations/runs`, which full-scans **3 tables** (`automation_runs` + `results` + `postfast_posts`). Order ~**225K reads per active hour, per open drawer.** Fixes, cheapest first: (a) make the endpoint fetch only the target automation's runs server-side (needs A1); (b) add a lightweight status-only endpoint returning just the in-flight run; (c) back off the interval (4s → 10–15s); (d) replace with Realtime (D1). **Impact: very high during generation.** Effort: S–M.
- **B2. `automation-scheduler` cron full-scan** (`appwrite/functions/automation-scheduler/src/main.js:42`, cron `*/5`). Reads **every row** of `automations` + `x_automations` every 5 min, then filters `status==="live"` in memory. At 200 automations = ~57K reads/day; scales linearly. Fix: `Query.equal("status","live")` (+ ideally a `next_run_at <= now` indexed query). **Impact: high, constant background drain.** Effort: S (needs a `status` index).
- **B3. Knowledge-base refresh poll** (`knowledge-bases-panel.tsx:107`, 4s while refreshing) full-scans `knowledge_bases` each tick. Bounded to refresh windows, but same fix as B1 (target-row read or Realtime). **Impact: low-medium.** Effort: S.
- **B4. Trim calendar-summary's postfast read** (`lib/calendar-summary.ts:22`). Already cheap, but it pulls 25 posts to compute 2 counts — switch to `Query.limit(1)` + `total` per status. **Impact: low.** Effort: S.
- **B5. Cron cadence review.** `job-worker` every 2 min and `automation-scheduler` every 5 min run 24/7 even when idle. Options: widen intervals off-peak, or make job-worker **event-driven** (Appwrite event trigger on `jobs` row create) so it runs only when work exists. **Impact: low-medium.** Effort: M.

### Tier C — caching (skip the read entirely)

- **C1. Cache the calendar route** (`app/api/calendar/route.ts`) — it's the single largest per-load cost (~1,675 rows, 6 tables) and is `force-dynamic` with no cache. Add range-keyed `revalidate`/`s-maxage`, or precompute a per-month summary row. **Impact: high.** Effort: M. Behavior change: calendar may lag up to the TTL (acceptable — it's not real-time data).
- **C2. Memoize the near-static public tables.** `benchmark_corpus` and `automation_templates`/`automation_template_runs` are public/shared and re-scanned on every relevant call. Wrap in `unstable_cache`/module memo with a long TTL. **Impact: medium.** Effort: S.
- **C3. Broaden server caching.** Only ONE read in the whole app is cached today (`listMediaLibraryAssets`, `revalidate:300`). Wrap other stable list reads in `unstable_cache` or React `cache()` for per-request de-dup. **Impact: medium.** Effort: M.
- **C4. Client-side SWR for the workspace fetches.** The 6 mount effects in `realfarm-workspace.tsx:359-469` use raw fetch — every full navigation to `/app` refetches everything. Wrap in SWR (already a dependency) so repeat visits hit cache. **Impact: medium.** Effort: M.

### Tier D — architecture (bigger changes you're open to)

- **D1. Adopt Appwrite Realtime to replace polling.** The app uses `node-appwrite` (server SDK) only — **zero** Realtime today; every "live" feature is a poll. Wiring the browser SDK's `client.subscribe` for generation progress (B1), KB refresh (B3), and the calendar badge would eliminate most steady-state polling reads and feel more responsive. **Impact: high** (removes B1/B3 entirely). Effort: L. This is the single biggest architectural lever.
- **D2. Write-time aggregation / materialized dashboard.** Instead of computing counts and calendar summaries by reading rows, maintain a small per-user summary/counter row updated on write. Reads become O(1). Generalizes A4. **Impact: high.** Effort: L.
- **D3. Archive/cold-store old rows.** `automation_runs`, `results`, `postfast_posts` grow unbounded and every full scan pays for all history. Move rows older than N days to a cold table (or JSON in Storage). Shrinks *every* read that still scans. **Impact: high and compounding.** Effort: M–L. Behavior change: old runs/history load on demand from the archive.
- **D4. Split the fat `data` blob for list views.** The denormalized columns (`rid/name/status/created_raw/ord/owner_id`) already carry enough for list rendering. List endpoints could read only those (they still bill 1 read/row, but far less egress/latency) and fetch the 1 MB `data` blob only on detail open. Pairs with pagination. **Impact: bandwidth + latency** (not read count). Effort: M.
- **D5. Add the missing indexes.** ~17 core tables have `idx_owner` but **no `idx_ord`**, yet every read does `Query.orderAsc("ord")` → unindexed sort on every scan. `automation_templates`/`automation_template_runs` have **no indexes at all**. Add `idx_ord` (+ `status`/`rid` indexes for A2/B2). **Impact: latency/cost of every scan;** prerequisite for A2/B2 filters. Effort: S.

### Tier E — UX / product changes (you said you're open to these)

- **E1. Paginate the big libraries instead of loading everything.** Media (~529), templates (~187), runs, videos, posts are all loaded whole on mount. Switch to load-more / infinite scroll / virtualized grids that fetch a page at a time (needs A1). **Impact: high** on workspace load. Behavior change: users scroll to load more.
- **E2. Lazy-load per view instead of on mount.** `realfarm-workspace.tsx` fires 6 data effects (image collections, X automations+runs, product collections, automations, recent runs) on **every** page load regardless of the active tab (default = home). Gate each behind its view. **Impact: high** (home load stops fetching X-studio + collections data nobody's looking at). Effort: M. Behavior change: tiny delay when first opening a tab.
- **E3. Drop showcase data from first paint.** `automation_template_runs` (example/showcase runs, hundreds of rows) load server-side on every `/app` render but are only used in template showcases. Load on expand. **Impact: medium.** Effort: S.
- **E4. Defer the media library off the home path.** ~529 media rows load server-side on every workspace render but are only needed by the Music/UGC/greenscreen pickers. Load when a picker opens. **Impact: medium** (it's `unstable_cache`d, so only cache-miss loads hurt). Effort: S.
- **E5. Slow down / gate live progress UX.** The 4s drawer poll (B1) exists for a live progress bar. If you accept a slightly less "live" feel, a 10–15s interval or "generating… (refresh)" pattern cuts that cost 3–4× with a one-line change, independent of the deeper fixes. **Impact: high, near-zero effort.** Behavior change: progress updates less smoothly.
- **E6. Collapse duplicate server+client fetches.** Some data is fetched server-side in `page.tsx` **and** again client-side on mount. Pass server data down as props / hydrate SWR fallback instead of refetching. **Impact: medium.** Effort: M.

---

## 3. Bandwidth reduction (the 33 GB) — full list

- **G1. ✅ Stream byte-ranges instead of buffering whole files** (`app/api/local-assets/[...assetPath]/route.ts:62`). *(Landed — route now delegates to `appwriteFileResponse`.)* Previously downloaded the **entire** Appwrite file into memory for **every** request — even a 1-byte range probe forced Appwrite to egress the whole file (the billed bandwidth). The correct streaming passthrough (`lib/appwrite-storage-response.ts`, used by the swipes route) is now used here. **Impact: very high** (primary 33 GB driver). Effort: S.
- **G2. Enable browser caching.** Same route previously sent `Cache-Control: no-store` so every render/navigation re-downloaded. `private, max-age=3600` (G1 brings this for free). **Impact: very high.** Effort: S (bundled with G1).
- **G3. `preload="auto"` → `preload="metadata"` on grid videos** (`generated-video-thumbnail.tsx:10`, `generated-video-exports.tsx:226`, `home-view.tsx:645`). Grids currently download **full videos** just to grab a 0.1s thumbnail frame. Every other player already uses `metadata`. **Impact: high.** Effort: S.
- **G4. Use stored poster images in grids** (`item.previewUrl`/`thumbnailUrl` already exist and are used in viewers) instead of the JS frame-grab hook — avoids loading video bytes for off-screen cards entirely. **Impact: high.** Effort: M.
- **G5. `getFilePreview` resized thumbnails for image grids.** Appwrite can return a small resized/`webp` image; the app never uses it and serves full-res originals in grids. Add a `width`/`quality` param to the proxy for image content types. (Images only — videos need G4.) **Impact: medium.** Effort: M.
- **G6. Add `loading="lazy"` to grid `<img>`/`<video>`.** Off-screen cards fetch immediately today. **Impact: medium.** Effort: S.

---

## 4. Immediate account protection (do today, no code)

- Set a temporary **$2–$5 budget cap** so the project can't be restricted while fixes land (overage is cheap: $0.06/100K reads).
- Close idle `/app` tabs (each open tab = badge poll; each open generation drawer = the 4s scan).
- If publishing isn't critical today, pause the two Appwrite function schedules (stops B2's ~57K/day).
- Confirm `ENABLE_LOCAL_AUTOMATION_WORKER` is not set anywhere.

---

## 5. Recommended sequence (my pick)

If you want the maximum read reduction for the least work, in order:

1. **E5 + B1(c)** — back off / gate the 4s drawer poll. One-line, kills the worst offender immediately.
2. **A1** — add limit/filter passthrough to `awReadTable`. Unlocks everything else.
3. **B2** — status filter on the scheduler cron. Kills the constant background scan.
4. **A4 + A5** — count via `total`; stop the runs→results double-scan.
5. **G1 + G2 + G3** — asset streaming + caching + preload. Kills most of the 33 GB.
6. **C1 + D5** — cache calendar + add indexes.
7. Then the structural/UX items (A2/A3, D1 Realtime, D3 archival, E1/E2) as appetite allows.

Steps 1–4 alone should cut steady-state reads well over 90%. Say which tiers/items you want and I'll implement them.
