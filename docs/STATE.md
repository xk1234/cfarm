# State of the App

> **Living document.** The single source of truth for what LumenClip (repo `cfarm`) *is and does today*. Aspirational/planned work lives in [ROADMAP.md](ROADMAP.md), not here. If you change what the app does, update this file in the same PR.
>
> Last verified: 2026-07-16 · Next.js 16 (App Router) · Appwrite Cloud (`sgp`)

## 1. What it is

LumenClip is a content-production and automation workspace for character-driven social video. It combines: an AI character/UGC-avatar editor (image + video generation), a swipe-research tool fed by a browser extension, an automation engine that turns templates into scheduled auto-published slideshows and short posts (X/Threads, LinkedIn), a social calendar + analytics layer, and an asset/collection library. Single-page workspace shell (`components/realfarm-workspace.tsx`) that swaps views client-side; marketing/auth pages live under `app/`.

Stack and setup live in the root [README](../README.md). Design system in [DESIGN.md](../DESIGN.md). This doc covers **product surface, subsystems, infra, and known gaps**.

## 2. Product surface — views

Nav registry: `ViewKey` in `components/realfarm/navigation.tsx`; render switch in `components/realfarm-workspace.tsx`. Two nav groups: **top** (Home, Swipes, AI UGC avatars, Greenscreen Memes, Schedule, Analytics) and **slideshow** (Automations, Collections, Knowledge Bases).

| View | Component | State | Feature doc |
|---|---|---|---|
| Home | `home-view.tsx` | ✅ working | `tabs/home.md` |
| Swipes | `swipes-view.tsx` | ✅ working | `tabs/swipes.md` |
| AI UGC avatars | `characters-view.tsx` | ✅ working | `tabs/ai-ugc-avatars.md` |
| Greenscreen Memes | `greenscreen-view.tsx` | ⚠️ preview works; `onCreate` is a no-op (`realfarm-workspace.tsx` `createDraft` returns `undefined`) | `tabs/greenscreen-memes.md` |
| Schedule | `content-calendar/content-calendar-view.tsx` | ✅ working (redesigned) | `tabs/schedule.md` |
| Analytics | `analytics/analytics-view.tsx` | ✅ working (redesigned) | `tabs/analytics.md` |
| Automations | `automations-view.tsx` + `automation-settings.tsx` + `x-automation-studio.tsx` | ✅ working | `tabs/automations.md` |
| Collections | `collections-view.tsx` | ✅ working | `tabs/image-collections.md` |
| Knowledge Bases | `knowledge-bases-panel.tsx` | ✅ working | `tabs/knowledge-bases.md` |

**Not a view:** `creator-ui.tsx` is a shared component lib. `CreatorsView` (`home-view.tsx`) is dead code with no route — the tab was removed (a contract test enforces its absence); its doc has been deleted, but the dead `CreatorsView` export should be cleaned up. The testing center (`components/temp/slide-testing-center.tsx`, `/app/debug`) is a debug-only surface, not in product nav.

## 3. Subsystems

| Subsystem | Key files | External providers |
|---|---|---|
| Slideshow engine — interactive | `lib/automation-runner.ts`, `slideshow-renderer.ts`, `slideshow-text-generation.ts`, `slideshow-lifecycle.ts`, `slideshow-image-matching.ts` | OpenRouter, DeepL, Pexels, Pinterest, Rendi, PostFast |
| Slideshow engine — scheduled | `appwrite/functions/job-worker/src/slideshow-automation.js` (+ `slideshow-renderer.js`) — *parallel/duplicated pipeline inside Appwrite* | Rendi, OpenRouter, DeepL, PostFast |
| Character / UGC avatars | `lib/characters.ts`, `character-image-generations.ts`, `character-video-generations.ts`, `character-video-postprocess.ts`, `ugc-avatar-videos.ts`, `realfarm-generation-model-registry.ts` | KIE (image + video) |
| Render primitives | `lib/rendi-ffmpeg.ts`, `slideshow-export.ts`, `generated-video-renderer.ts` (client canvas) | Rendi FFmpeg |
| Image/video gen wrappers | `lib/kie-image.ts`, `kie-video.ts` | KIE |
| Swipes | `lib/swipes.ts`, `swipe-scoring.ts`, `swipe-search.ts`, `swipe-display-model.ts` | extension capture |
| Social publishing / PostFast | `lib/postfast-*.ts`, `publishing.ts`, `social-post-metadata.ts` | PostFast |
| X / Threads automation | `lib/x-automation*.ts`, `x-post-presets.ts`, `x-trend-discovery.ts`, `hook-*.ts`, `debate-hook.ts` | OpenRouter, Apify, KIE, FAL, PostFast |
| LinkedIn automation | `lib/linkedin-automation-generation.ts`, `linkedin-post-presets.ts`, `app/api/linkedin-automations/generate`, `scripts/linkedin-lab/` — **backend + eval-lab only; not surfaced in any UI** | OpenRouter |
| Benchmarks (LLM grading) | `lib/slideshow-benchmarks.ts`, `x-benchmarks.ts`, `client-slideshow-benchmarks.ts`, `metric-registry.ts` | OpenRouter |
| Knowledge bases | `lib/knowledge-bases.ts` (+ worker ingestion) | Apify, DataForSEO, FAL/OpenAI Whisper, pdf-parse, OpenRouter |
| Analytics / metrics | `lib/postfast-analytics.ts`, `postfast-metric-snapshots.ts`, `metric-registry.ts`, `app/api/analytics/report` | PostFast |
| Collections / assets | `lib/image-collections.ts`, `product-collections.ts`, `word-collections.ts`, `media-library.ts`, `assets.ts`, `asset-storage.ts`, `pexels-search.ts`, `pinterest-search.ts` | Pinterest, Pexels |
| Translation | `lib/deepl-translate.ts` | DeepL |
| Auth / multitenancy | `lib/auth.ts`, `workspace-members.ts`, `system-owner-context.ts` | Appwrite |
| Storage abstraction | `lib/json-store.ts`, `appwrite-stores.ts`, `appwrite.ts` | Appwrite |

## 4. Backend & infra

**Appwrite Cloud** — project `Cfarm`, region `sgp`, TablesDB database `cfarm`.

- **Tables** (map: `lib/appwrite-stores.ts` `STORE_TABLES`): ~26 stores + a `jobs` queue. Public/shared (non-owner-scoped): `automation_templates`, `automation_template_runs`, `benchmark_corpus`, `x_benchmark_corpus`, `media_library`. Row shape: `rid, name, status, created_raw, source_key, ord, data(longtext)` — the `data` column carries the JSON blob.
- **Storage buckets**: `music, image_collections, greenscreen, characters, slideshows, ugc_videos, backgrounds, assets, knowledge_base_files, benchmark_images, product_images, demos, misc`. File ids are deterministic (`sha256(path)`), derived at runtime — no lookup table.
- **Functions** (`appwrite.json`, node-22): `automation-scheduler` (cron `*/5`) computes due automations → enqueues deduped jobs; `job-worker` (cron `*/2`, 900s, lease/claim/retry/dead-letter) drains `jobs` — handlers `run-automation`, `run-x-automation`, `refresh-knowledge-source`, `send-notification`, `echo`.
- **Local worker** (`lib/local-automation-job-worker.ts`, started by `instrumentation.ts`): in-process 5-min poller that handles **only** `sync-post-analytics` jobs — the Appwrite worker deliberately excludes that type. Off by default (`ENABLE_LOCAL_AUTOMATION_WORKER`).

### Architectural facts worth knowing before you touch data
- **Appwrite bills 1 DB read per row returned.** The whole app reads through `awReadTable` (`lib/json-store.ts`), which **paginates the entire owner-scoped table** — every `?limit=`/`?id=`/`status` filter is applied *in memory after* the full read. This is the dominant cost driver. See [proposals/appwrite-usage-reduction.md](proposals/appwrite-usage-reduction.md).
- Persistence has **no filesystem fallback** for mapped stores — Appwrite is authoritative, and an unmapped store or unconfigured Appwrite throws (`requireTableFor`). Binary asset *files* keep local working copies for ffmpeg/sharp, but the `data/*.json` record stores are dead.

## 5. Known gaps, stubs & half-built features

| Area | State | Location |
|---|---|---|
| Billing / plans | UI stub — "Coming soon" tiles, no integration | `user-settings-modal.tsx` `BillingPanel` |
| LinkedIn automation | Works via API + lab, **no UI**, no store/table/scheduler | `lib/linkedin-automation-generation.ts` |
| Scheduled X/Threads auto-publish | Only single-post + `autoPost===true` auto-publishes; **threads & multi-post sit as unpublished drafts** | `job-worker/src/main.js` `publishScheduledXDraft` |
| Scheduled X draft grading | Drafts carry placeholder benchmark (`total:0`, "pending independent LLM grade") — not graded at gen time | `job-worker/src/main.js` |
| `sync-post-analytics` reliability | Runs **only** in the local Next.js worker; if the app process is down, queued analytics jobs never drain | `local-automation-job-worker.ts` |
| Greenscreen create | `onCreate` no-op — nothing persists | `realfarm-workspace.tsx` `createDraft` |
| Creators tab | Removed; dead `CreatorsView` export still to be cleaned up | `home-view.tsx` |
| Appwrite scheduler deploy | Code shipped in-repo; **deployment pending** | `appwrite/functions/*` |

## 6. Browser extension

Manifest V3 "CFarm Swipe Saver" (`extension/`). Adds "Swipe" buttons to ad/creative surfaces and imports captured media into local collections via `localhost:3000` app APIs → `swipes` table. Adapters: Facebook Ads Library, TikTok, TikTok Creative Center, TikTok Seller SG, X/Twitter, Google Ads, Google Ads Transparency, Tumblr. Per-adapter notes in `extension/`. QA in `workflows/`.

## 7. Known inconsistencies (tech debt, not features)

- **Branding split:** code/env use `LumenClip` (`lumenclip-session`, `LUMENCLIP_*`) while docs/diagrams/extension use `CFarm`/`cfarm`. Pick one canonical product name.
- **Duplicated due-slot logic:** `automation-runner.ts` and `automation-scheduler/src/main.js` were meant to collapse onto `lib/automation-slots.ts` (now exists) — check for lingering duplication.
- **Duplicated render pipeline:** interactive (`lib/`) vs scheduled (`job-worker/src/`) slideshow renderers are parallel implementations that can drift.
