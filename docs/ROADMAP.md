# Roadmap

> **Living document.** The consolidated view of all planned/in-flight work, replacing the scattered plan files. Each initiative links to its detailed proposal in [`proposals/`](proposals/). When work fully ships, its plan doc is **deleted** (facts folded into [STATE.md](STATE.md)/`reference/`) and its row moves to the shipped list.
>
> Last updated: 2026-07-16

## Status legend

| | Meaning |
|---|---|
| 🔴 **Now** | Active / urgent — do next |
| 🟡 **Next** | Committed, not started or partial |
| ⚪ **Later** | Proposed, not yet committed |
| ✅ **Shipped** | Done (detail doc archived) |
| 🗑 **Superseded** | Replaced by a newer decision |

## The board

### 🔴 Now

| Initiative | Why now | Remaining work | Detail |
|---|---|---|---|
| **Appwrite cost reduction** | At ~87% of the DB-reads billing cap; ~1 day of headroom at recent rate. | Most items still open — only asset streaming (G1) landed. Priority chain: slow the 4s drawer poll → add limit/filter passthrough to `awReadTable` → status filter on scheduler cron → count-via-`total` → caching/indexes. | [proposals/appwrite-usage-reduction.md](proposals/appwrite-usage-reduction.md) |
| **Deploy the Appwrite scheduler + worker** | Code is in-repo but **not deployed**; scheduled publishing doesn't actually run until it is. | Deploy `automation-scheduler` + `job-worker`; verify queue drains end-to-end. | [reference/appwrite-scheduling.md](reference/appwrite-scheduling.md) |

### 🟡 Next (committed / partially built)

| Initiative | Done so far | Remaining | Detail |
|---|---|---|---|
| **Schedule + Analytics redesign** | Metric registry, snapshot store, unified calendar API, posting-mode tri-state, warmup, review mode, reschedule, split UI components — all landed. | Retire old monolith `calendar-analytics.tsx` + legacy `postfast/analytics/platform` route; finish caption-only auto-post path. | [proposals/schedule-analytics-redesign.md](proposals/schedule-analytics-redesign.md) |
| **LinkedIn automation** | Generation lib, presets, `/api/linkedin-automations/generate`, eval lab. | Record/store + `linkedin_automations` table, benchmarks lib, studio UI, scheduler wiring. | [proposals/linkedin-automation-plan.md](proposals/linkedin-automation-plan.md) |
| **X/Threads drift fixes** | Niche injected into prompt (EXP-1); Threads format library restored (EXP-6). | Niche-relevance eval harness (EXP-0) + `nicheRelevance`/`mentionsNiche` metric (EXP-4); remove astrology regex. | [proposals/x-threads-drift-experiments.md](proposals/x-threads-drift-experiments.md) |
| **Scheduled X/Threads auto-publish** | Single-post auto-publish works. | Auto-publish threads + multi-post drafts (currently sit unpublished); grade drafts at generation time instead of placeholder benchmark. | (see [STATE.md §5](STATE.md#5-known-gaps-stubs--half-built-features)) |
| **`sync-post-analytics` reliability** | Runs in local Next.js worker. | Make it durable — either a dedicated cloud analytics function or accept/monitor the local-only constraint. | (see [STATE.md §5](STATE.md#5-known-gaps-stubs--half-built-features)) |

### ⚪ Later (proposed, not committed)

| Initiative | Summary | Detail |
|---|---|---|
| **Reply extension** | Extend the Chrome extension to draft context-aware AI replies to top comments on your own posts, with anti-ban pacing. Prereq: add `platformPostId` to `postfast-posts`. | [proposals/reply-extension-impl.md](proposals/reply-extension-impl.md) |
| **Local backend migration** | A `lib/backend/` contract with a SQLite + filesystem local adapter (selected by `CFARM_BACKEND`) so dev never hits Appwrite. Also directly relieves the reads cap for dev traffic. | [proposals/local-backend-migration-plan.md](proposals/local-backend-migration-plan.md) |
| **Billing / plans integration** | Replace the "Coming soon" billing stub with a real plan/usage/seat integration. | *(no doc yet)* |

### ✅ Recently shipped (plan docs removed)

Implemented; their detail docs have been deleted. Behavior now lives in the code + [STATE.md](STATE.md).

| Initiative | Where it lives now |
|---|---|
| X/Threads rebuild → single-call pattern (then split to one-platform-per-automation + benchmark judge) | `lib/x-automation*.ts`, `lib/x-post-presets.ts`, `lib/x-benchmarks.ts` |
| Video automation quality (organic `story_over_broll` / `faceless_reel` presets + grading harness) | `lib/video-automation-templates.ts`, `scripts/eval-video-automation.mjs`, `scripts/grade-video.mjs` |

## Documentation hygiene (housekeeping backlog)

Not product work, but tracked so it doesn't rot again:

- ✅ Refreshed feature docs `tabs/schedule.md` + `tabs/analytics.md` to the redesigned surfaces; deleted `tabs/creators.md`; added `tabs/knowledge-bases.md`.
- Resolve the **branding split** (LumenClip vs cfarm/CFarm) — pick one and align docs + code. *(Open — a product decision.)*
- ✅ Fixed the **`data/*.json` contradiction** — reference docs now state Appwrite is authoritative for mapped stores.
- `reference/appwrite-scheduling.md`: drop the "not deployed" framing once the functions are actually deployed (see 🔴 Now).
