---
title: "State of the App"
---

> **Living document.** The single source of truth for what LumenClip (repo `cfarm`) _is and does today_. Aspirational/planned work lives in the [roadmap](/docs/roadmap), not here. If you change what the app does, update this file in the same PR.
>
> Last verified: 2026-07-18 · Next.js 16 (App Router) · shared local Appwrite + Appwrite Cloud (`sgp`)

## 1. What it is

LumenClip is a content-production and automation workspace for social slideshows, short-form video, and text posts. It combines an automation engine that turns templates and reusable collections into scheduled content, X/Threads automation, a social calendar and analytics layer, publishing through PostFast, and reusable asset/collection libraries. A single-page workspace shell (`components/realfarm-workspace.tsx`) swaps views client-side; marketing/auth pages live under `app/`.

Stack and setup live in the root [README](../README.md). Design system in [DESIGN.md](../DESIGN.md). This doc covers **product surface, subsystems, infra, and known gaps**.

## 2. Product surface — views

Nav registry: `ViewKey` in `components/realfarm/navigation.tsx`; render switch in `components/realfarm-workspace.tsx`. Two nav groups: **top** (Home, Greenscreen Memes, Schedule, Analytics) and **slideshow** (Automations, Collections).

| View              | Component                                                                                                                                                            | State                   | Feature doc                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------- |
| Home              | `home-view.tsx`                                                                                                                                                      | ✅ working              | `tabs/home.md`                |
| Greenscreen Memes | First-class video automation template opened from **New automation**; hooks, media collections, schedule, accounts, and publishing reuse the video automation editor | ✅ working              | `assets/greenscreen-memes.md` |
| Schedule          | `content-calendar/content-calendar-view.tsx`                                                                                                                         | ✅ working (redesigned) | `tabs/schedule.md`            |
| Analytics         | `analytics/analytics-view.tsx`                                                                                                                                       | ✅ working (redesigned) | `tabs/analytics.md`           |
| Automations       | `automations-view.tsx` + `automation-settings.tsx` + `x-automation-studio.tsx`                                                                                       | ✅ working              | `tabs/automations.md`         |
| Collections       | `collections-view.tsx`                                                                                                                                               | ✅ working              | `collections/overview.md`     |

Generated slideshow viewers can publish through PostFast or link an existing
live post. Manual links store a canonical public URL and provider-native post
ID in the output publication, allowing analytics sync to attribute the remote
post back to its slideshow. Slideshow automations also have a **Published
Posts** workflow for TikTok photo posts: Apify imports the slides, visible text
and run history are compared before confirmation, and missing historical
outputs/hooks can be restored without republishing externally. The same
owner-scoped service is exposed through seven MCP tools over the authenticated
`/mcp` route and local stdio transport: schedule inspection, manual slideshow
generation, safe automation updates, stored analytics reads, and three focused
TikTok publication-reconciliation tools. Collection deletion uses a 30-day
soft delete with dependency-aware confirmation and toast undo. X/Threads
strategy derivation uses bounded primary retries plus a fallback model; every
attempt is retained in the automation operation history, and retryable failures
are shown inline without clearing editor state.

Slideshow/video hooks are stable catalog items with row-based multiline paste
and independent enable state. A hook becomes Used only after PostFast confirms
publication or a user links an output as published; used rows cannot be
renamed or deleted but can be disabled. Each automation has a hook analytics
table backed by its attributed publication metric snapshots.

**Not a view:** `creator-ui.tsx` is a shared component lib. `CreatorsView` (`home-view.tsx`) is dead code with no route — the tab was removed (a contract test enforces its absence); its doc has been deleted, but the dead `CreatorsView` export should be cleaned up. The testing center (`components/temp/slide-testing-center.tsx`, `/app/debug`) is a debug-only surface, not in product nav.

## 3. Subsystems

| Subsystem                      | Key files                                                                                                                                                                   | External providers                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Slideshow engine — interactive | `lib/automation-runner.ts`, `slideshow-renderer.ts`, `slideshow-text-generation.ts`, `slideshow-lifecycle.ts`, `slideshow-image-matching.ts`                                | OpenRouter, DeepL, Pexels, Pinterest, Rendi, PostFast |
| Slideshow engine — scheduled   | `appwrite/functions/job-worker/src/slideshow-automation.js` (+ `slideshow-renderer.js`) — _parallel/duplicated pipeline inside Appwrite_                                    | Rendi, OpenRouter, DeepL, PostFast                    |
| Render primitives              | `lib/rendi-ffmpeg.ts`, `slideshow-export.ts`, `generated-video-renderer.ts` (client canvas)                                                                                 | Rendi FFmpeg                                          |
| Image generation wrapper       | `lib/kie-image.ts`                                                                                                                                                          | KIE                                                   |
| Social publishing / PostFast   | `lib/postfast-*.ts`, `publishing.ts`, `social-post-metadata.ts`                                                                                                             | PostFast                                              |
| X / Threads automation         | `lib/x-automation*.ts`, `x-post-presets.ts`, `x-trend-discovery.ts`, `hook-*.ts`, `debate-hook.ts`                                                                          | OpenRouter, Apify, KIE, FAL, PostFast                 |
| LinkedIn automation            | `lib/linkedin-automation-generation.ts`, `linkedin-post-presets.ts`, `app/api/linkedin-automations/generate` — **backend only; not surfaced in any UI**                     | OpenRouter                                            |
| Analytics / metrics            | `lib/postfast-analytics.ts`, `postfast-metric-snapshots.ts`, `metric-registry.ts`, `app/api/analytics/report`                                                               | PostFast                                              |
| Collections / assets           | `lib/image-collections.ts`, `product-collections.ts`, `word-collections.ts`, `media-library.ts`, `assets.ts`, `asset-storage.ts`, `pexels-search.ts`, `pinterest-search.ts` | Pinterest, Pexels                                     |
| Translation                    | `lib/deepl-translate.ts`                                                                                                                                                    | DeepL                                                 |
| Auth / multitenancy            | `lib/auth.ts`, `workspace-members.ts`, `system-owner-context.ts`                                                                                                            | Appwrite                                              |
| Storage abstraction            | `lib/json-store.ts`, `appwrite-stores.ts`, `appwrite.ts`                                                                                                                    | Appwrite                                              |

## 4. Backend & infra

**Appwrite Cloud** — LumenClip's legacy project and database IDs are `cfarm`; the project runs in region `sgp`.

- **Consolidated tables:** `permanent_assets` stores reusable inputs and `outputs` stores generated content/publication state, both discriminated by `source_key`; `output_media` holds normalized media references. Dedicated active tables include `automations`, `automation_runs`, `x_automations`, `usage_ledger`, analytics snapshots, `jobs`, `workspace_members`, and `demos`. See [reference/backend-architecture.md](reference/backend-architecture.md).
- **Automation template catalog:** 29 definitions and 158 curated example runs were moved from cloud into public local `permanent_assets` categories; the app reads them from local Appwrite.
- **Local reference collections:** `pnpm appwrite:local:sync-reference` copies the 41 cloud image collections and their referenced Storage files into the matching local owner's consolidated rows without deleting the cloud source.
- **Storage buckets:** active paths use `music, image_collections, greenscreen, slideshows, ugc_videos, backgrounds, assets, product_images, demos, misc`; older cloned schemas may retain removed buckets. Path-derived file IDs are deterministic (`sha256(path)`), with no lookup table.
- **Functions** (`appwrite.json`, node-22): deployed `automation-scheduler` (cron `*/5`) computes due automations → enqueues deduped jobs; deployed `job-worker` (cron every minute, 900s, lease/claim/retry/dead-letter) drains `jobs` — handlers `run-automation`, `run-x-automation`, `send-notification`, `echo`.
- **Local worker** (`lib/local-automation-job-worker.ts`, started by `instrumentation.ts`): in-process 5-min poller that handles **only** `sync-post-analytics` jobs — the Appwrite worker deliberately excludes that type. Off by default (`ENABLE_LOCAL_AUTOMATION_WORKER`).

### Architectural facts worth knowing before you touch data

- **Appwrite bills by rows returned.** `awReadTable` supports physical queries and limits, but callers that omit them still paginate the whole owner/source category; eliminating remaining broad reads is the main cost-reduction work. See [roadmap/appwrite-read-reduction.md](roadmap/appwrite-read-reduction.md).
- Persistence has **no filesystem fallback** for mapped mutable stores — Appwrite is authoritative, and an unmapped store or unconfigured Appwrite throws. Automation templates are an explicit read-mostly repository catalog, not a fallback for a mutable store.

## 5. Known gaps, stubs & half-built features

| Area                              | State                                                                                                    | Location                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Billing / plans                   | UI stub — "Coming soon" tiles, no integration                                                            | `user-settings-modal.tsx` `BillingPanel`          |
| LinkedIn automation               | Works via API, **no UI**, no store/table/scheduler                                                       | `lib/linkedin-automation-generation.ts`           |
| Scheduled X/Threads auto-publish  | Only single-post + `autoPost===true` auto-publishes; **threads & multi-post sit as unpublished drafts**  | `job-worker/src/main.js` `publishScheduledXDraft` |
| Scheduled X draft grading         | Drafts carry placeholder benchmark (`total:0`, "pending independent LLM grade") — not graded at gen time | `job-worker/src/main.js`                          |
| `sync-post-analytics` reliability | Runs **only** in the local Next.js worker; if the app process is down, queued analytics jobs never drain | `local-automation-job-worker.ts`                  |
| Creators tab                      | Removed; dead `CreatorsView` export still to be cleaned up                                               | `home-view.tsx`                                   |

## 6. Known inconsistencies (tech debt, not features)

- **Naming:** LumenClip is the canonical product and public API name. Existing `cfarm` repository, database, project, CSS, and temporary-path identifiers remain internal compatibility details.
- **Duplicated due-slot logic:** `automation-runner.ts` and `automation-scheduler/src/main.js` were meant to collapse onto `lib/automation-slots.ts` (now exists) — check for lingering duplication.
- **Duplicated render pipeline:** interactive (`lib/`) vs scheduled (`job-worker/src/`) slideshow renderers are parallel implementations that can drift.
