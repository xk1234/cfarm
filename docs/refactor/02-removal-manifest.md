---
title: "Removal manifest"
description: "Keep/delete/rewrite inventory, cut lines, deletion order and agent split for the rendering-engine refactor."
---

# 02 — Removal manifest (keep / delete / rewrite)

Branch `refactor/base` at `b853662`. Baseline: `pnpm typecheck` (tsc --noEmit) passes with 0 errors.

Method: a script parsed every `import`/`export from`/`import()`/`require()` in 769 code files (`app/`, `components/`, `lib/`, `scripts/`, `test/`, `e2e/`, `mcp/`, `appwrite/`, `browser-extension/`, plus root config files). It resolved `@/` and relative paths and built a dependency graph. Each file got a decision from the owner's product rules. Then every KEEP/REWRITE file that still imports a DELETE file was flagged as a **cut line**. A second pass looked for string URLs (`"/api/..."`) in kept files that point at deleted routes. Non-code assets (docs, images, fonts, SQL, JSON) were classified by hand.

Legend: **KEEP** = survives unchanged or with trivial edits. **REWRITE** = survives, but needs real surgery (a cut line, the backend swap, or a product reshape). **DELETE** = remove the file.

## 0. Headline numbers

| Decision | Code files | Lines |
|---|---:|---:|
| DELETE | 481 | 112,305 |
| REWRITE | 90 | 35,191 |
| KEEP | 198 | 22,982 |
| **Total scanned** | **769** | **170,478** |

About 66% of code lines go. Non-code deletions add more: 83 of 151 `docs/` files (41 of them screenshots), 39 of 47 `public/docs/workflows` images, 2 companion zips, 4 SQL migrations, 2 `data/` files, all of `browser-extension/`, and `appwrite/functions/` (21 fonts are moved, not deleted). Details are in sections 4 and 5.

Cut lines: **35 kept files** (30 non-test) import modules being deleted (section 3). There are also **11 string-URL cut lines**, **2 CSS/side-effect import cut lines** and **1 dangling deploy config**.

## 1. Decisions and interpretations made while classifying

1. **The render core already exists and is spec-shaped.** `POST /api/slideshows` (`lib/slideshows.ts#createSlideshowResultRecord`) takes `CreateSlideshowInput` = `{settings: {aspect_ratio, font, background_color, ...}, images: SlideshowSlide[]}`. Each `SlideshowSlide` has `{image_url, imageFit, overlay, overlayImage, iconLayout, textItems: [{text, fontSize, textSize, textStyle, textAlign, textAnchor, textVerticalAnchor, textPosition{x,y}}]}`. It renders inline through `slideshow-renderer.ts` → `slideshow-fabric-canvas.ts` → `slideshow-raster-renderer.ts` (fabric + node-canvas) and writes PNGs. This shape becomes the v1 JSON spec, so the renderer files are KEEP. `lib/slideshows.ts` is REWRITE: drop the automation/run fields and Rendi mp4 export, and add spec validation.
2. **The public render API is a stub today.** `lib/openapi-app.ts` exposes only `GET /api/v1/health`, and it reports `dataBackend: "railway"`. All real routes are cookie-authenticated `/api/*`. The render API is mostly new work: REWRITE openapi-app plus new routes. MCP is the opposite case. `lib/mcp/lumenclip-server.ts` (8,159 lines, 64 tools) is gutted to 16 tools (section 8).
3. **Slideshow → MP4 export is removed with Rendi.** `lib/slideshows.ts` calls `renderStoredSlideshowVideo` / `prepareStoredSlideshowVideo` / `finalizeStoredSlideshowVideo` / `encodePngSequenceToMp4ViaRendi` through `lib/rendi-ffmpeg.ts`. `settings.export_as_video`, `sound_*` and `transition_style` lose their meaning. Output becomes PNG slides plus a zip (`lib/slideshow-export.ts`, `/api/public/slideshows/[id]/download`).
4. **The canvas editor is removed.** That covers `components/realfarm/fabric-slideshow-canvas.tsx` (konva) and the format editor tree under `components/realfarm/automation-settings/` (format-preview-card, format-text-toolbar, content-format-editor, slideshow-format-preview-stage). Per-slide text and image edits also go: `app/api/slideshows/[id]` PATCH calls `updateAutomationRunSlideText`/`replaceAutomationRunSlideImage`, and the MCP tool `lumenclip_output_slide_text_update`. To change a render, re-submit the spec.
5. **"TikTok publishing" = PostFast's TikTok integration plus the manual-post flow.** No direct TikTok API publisher exists. Kept: `lib/postfast-*.ts` (except analytics/metric-snapshots), `lib/publishing*.ts`, `lib/post-*.ts`, `lib/publication-*.ts`, and `lib/manual-publication*.ts`, which handle the "awaiting_manual_post → manual_posted + releaseUrl" path used for TikTok photo posts. Deleted: `lib/tiktok-publication-import.ts` (Apify import of published TikTok posts for analytics linking), TikTok Studio and TikTok comments.
6. **The only UI that publishes a slideshow lives inside the automation tree.** That file is `components/realfarm/automation-settings/slideshow-publication-actions.tsx`. It is reclassified **REWRITE (move)** to a new `components/realfarm/publish/` home rather than deleted. Every other file in `automation-settings/` is deleted.
7. **The Compose page and the composer are deleted.** These are text posts built from content templates: `app/app/compose/*`, `components/realfarm/composer/post-composer.tsx`, `composer-types.ts`, `lib/compose-publishing.ts`, `lib/compose-validation.ts`, `app/api/compose/publish`, `app/api/publish-gates`, `app/api/outputs`. Slideshow publishing uses `/api/postfast/posts`. The per-platform limit checks in `compose-validation.ts` (`composeLimitErrors`) can be salvaged into `lib/publishing.ts` if wanted. Platform previews (`components/realfarm/previews/*`) are kept for the publish dialog.
8. **Reminders/notifications are kept, but their only channel is Telegram, which is removed.** `lib/reminder-settings.ts` defines `ReminderChannel = "none" | "telegram"`. `lib/reminders.ts` enqueues `send-notification` jobs only when the channel is `telegram`. So reminders are REWRITE to a channel-agnostic model, and the new channel is an **open question** (Q1). `lib/reminder-actions.ts` (Telegram callback → mark run published) and `app/api/telegram/webhook` are deleted.
9. **No worker exists in the working tree.** The snapshot commit deleted `services/job-worker.ts`, `services/template-scheduler.ts` and `railway.json`. But `railway.worker.json` still runs `pnpm railway:worker:check` / `railway:worker:once`, and neither script exists in `package.json`. `lib/railway/job-queue.ts` (pg-boss) has zero importers. The restored `appwrite/functions/job-worker/src/main.js` says "This worker handles short notification jobs only" and carries 30 mirrored generation modules plus langfuse. **Decision: DELETE `appwrite/functions/**` and run the worker on Railway** as a TS script that imports `lib/` directly, as the owner specified. **Exception:** the 21 `.otf` fonts in `appwrite/functions/job-worker/assets/fonts/` are the only display fonts in the repo. They **move** to `assets/fonts/` (section 4).
10. **Fonts limit customizability today.** `lib/slideshow-font-family.ts#resolveSlideshowFont` maps every family name except generic CSS families to the bundled `Inter`. Only `assets/fonts/Inter-Variable.ttf` ships (`next.config.mjs` `outputFileTracingIncludes`). Moving the 21 fonts and adding a font registry is the cheapest gain in customizability. License check needed (Q4).
11. **Image collections are kept; text collections are deleted.** "Word/variable collections" (`lib/word-collections.ts`, `app/api/word-collections`, `variable-collections-panel.tsx`) only fed hook-variable expansion. Product collections are part of product-sales-inspiration and are deleted. Collection "Get image captions" (AI, `/api/image-collections/captions`) and image actions (KIE AI edit, `/api/image-collections/image-actions`) are deleted. Manual asset captions (`/api/assets/caption`, non-AI) are kept.
12. **Backend rewrite seam.** Only 11 kept non-test files touch Railway storage directly: `lib/json-store.ts`, `lib/asset-storage.ts`, `lib/queue.ts`, `lib/results.ts`, `lib/output-publications.ts`, `lib/post-repository-store.ts`, `lib/calendar-summary.ts`, `lib/workspace-members.ts`, `lib/test-helpers.ts`, `app/api/local-assets/[...assetPath]/route.ts` and `app/api/public/slideshows/[id]/slides/[index]/route.ts`. `lib/server-env.ts` touches Railway only through env vars. Seven deleted files also touch it: `lib/demos.ts`, `lib/ugc-cost.ts`, `lib/ugc-run-status.ts`, `lib/pipeline-domain-storage.ts`, `app/api/public/videos/[id]/media`, `app/api/telegram/webhook` and `lib/railway/*`. Everything else goes through `json-store` / `asset-storage` / `queue`. Swapping those to Appwrite TablesDB + Storage behind the **same exported signatures** keeps the swap isolated. `node-appwrite` is not in `package.json`, even though `scripts/provision-consolidated-stores.mjs`, `clone-appwrite-schema.mjs` and `prune-appwrite-schema.mjs` import it.
13. **AGENTS.md "Workflow run viewer layout" (lines 12–89) stops applying.** It governs automation runs and stages (`Run workflow`/`Run step`, stage dots, `Input | Result`, `Execution trace`). After this strip no multi-stage run exists. Rendering a spec is a single step. Its implementation (`components/realfarm/workflow-inspector/*`, `workflow-artifacts/*`, `components/ui/workflow-stage-map.tsx`, `docs/reference/workflow-inspector-design-contract.md`) is deleted. Keep only the generic rules from that section as general UI conventions: shared `Button`/`Tabs` primitives, 34–36px buttons, text tabs with an underline, no floating action bubbles, and the 360px layout rule.
14. **Internal tools disappear.** `lib/internal-tools.ts` is used only by deleted pages (`/debug`, `/api/debug/*`, `/analytics-preview`) and by the `proxy.ts` 404 gate for those paths. Delete it, `ENABLE_INTERNAL_TOOLS`, and the `INTERNAL_PATH_PREFIXES` block.
15. **The test harness depends on local Postgres.** `vitest.setup.ts` refuses to run without a localhost `DATABASE_URL` and wipes tables between files. With Appwrite Cloud, tests need either an in-memory adapter behind the `json-store`/`asset-storage`/`queue` seam (recommended) or a dedicated Appwrite test project (risk R3).

## 2. Code inventory by feature

### 2.1 Group reasons (one line per group)

| Feature group | Decision | Files | Reason |
|---|---|---:|---|
| render-core | KEEP | 27 | Spec → PNG renderer (fabric/node-canvas), fonts, text-style presets, zip export, share tokens, public slide/zip delivery. This is the product. |
| render-core | REWRITE | 12 | `lib/slideshows.ts` and its routes/tests: strip automation/run fields and the Rendi mp4 path, add spec validation; the viewer modal loses slide editing; `template-showcase-preview.tsx` becomes a generic `SlidePreview`. |
| images | KEEP | 28 | Uploads, assets, image collections CRUD/import, Pexels/Pinterest search, image proxy, collections pages. |
| images | REWRITE | 17 | Collections UI loses AI captions, AI image actions, product and variable panels; `realfarm-data` / `realfarm-collections` / `media-library` lose the automation coupling; `asset-urls` loses video share URLs. |
| publishing | KEEP | 66 | PostFast client/integrations/posts/upload, publication record + link state, post repository/writer, manual-post flow, social provider contract/registry, calendar items UI, platform previews. |
| publishing | REWRITE | 4 | `app/api/postfast/integrations` (+test) stops syncing integrations into automations; `slideshow-publication-actions.tsx` (+test) moves out of `automation-settings/` as the slideshow publish dialog. |
| scheduling | REWRITE | 8 | Calendar route (619 lines) currently projects automation slots plus X runs; it becomes PostFast scheduled posts + local publication records. Reminders become channel-agnostic (Telegram removed). |
| api-mcp | KEEP | 7 | `/mcp` route, MCP tool-access settings, `/api/v1` mount, `/api-reference` (Scalar). |
| api-mcp | REWRITE | 7 | MCP server gutted from 64 to 16 tools; OpenAPI app grows real render routes; MCP stdio launcher and doc generator follow the registry. |
| backend | REWRITE | 21 | Railway Postgres/bucket → Appwrite TablesDB/Storage behind unchanged signatures (`json-store`, `asset-storage`, `queue`, `results`, `output-publications`, `post-repository-store`, `calendar-summary`, `workspace-members`, `server-env`, `test-helpers`, `consolidated-records`, local-assets routes, Appwrite provisioning scripts). |
| backend | DELETE | 53 | `lib/railway/*` (8), `drizzle.config.ts`, `scripts/railway-migrate.mts`, `scripts/run-railway-function.test.ts` (tests a script deleted in b853662), `scripts/sync-function-shared.mjs`, all 41 JS files under `appwrite/functions/` (generation mirrors, langfuse, notification worker — re-homed on Railway). |
| platform | KEEP | 36 | Clerk auth, layout/providers, API helpers, guards, http, url-guard, store identity, logger, team invites, docs source. |
| ui | KEEP | 18 | Shared primitives (`components/ui/*` minus `workflow-stage-map.tsx`). |
| shell | REWRITE | 12 | Workspace shell, nav, home, settings modal: remove Compose/Analytics/Templates/X views, the AI-models/Demos settings tabs and Telegram settings; add "Renders" and "New render". |
| marketing | KEEP / REWRITE | 4 / 5 | Legal pages + marketing shell kept; `/`, `/product`, `/solutions`, `/pricing`, `/careers` copy describes AI generation and automations. |
| docs (code) | KEEP / DELETE | 6 / 3 | fumadocs shell kept; automation template catalog and pipeline JSON enhancer deleted. |
| tooling | KEEP / REWRITE / DELETE | 6 / 4 / 2 | `proxy.ts`, `next.config.mjs`, `vitest.config.ts`, `vitest.setup.ts` change; `vitest.live.config.ts` (every live test is deleted) and `instrumentation.ts` (empty `register()`) are deleted. |
| automations | DELETE | 165 | Automations/templates/runner/pipeline/hook pools/experiments/variable bindings/run viewer/testing center/debug + `lib/internal-tools.ts`. |
| llm-generation | DELETE | 73 | OpenRouter, KIE, FAL, ElevenLabs, DeepL, debate hook, slop guardrail, generation chain/models, tone analysis, image matching, text generation, hook casing/expansion/variables, usage ledger, live provider tests. |
| video-ugc | DELETE | 48 | Generated videos, UGC runs/cost, Rendi/ffmpeg, greenscreen, demos, public video share. |
| x-threads-linkedin | DELETE | 28 | X/Threads/LinkedIn text automation studio, generation, trend discovery, publishing. |
| analytics-tiktok | DELETE | 76 | Analytics pages, metric registry/snapshots, PostFast analytics, TikTok Studio sync, TikTok comments, publication-link-state migration, published-post-dates, post-frequency graph, browser companion extension. |
| telegram | DELETE | 4 | Telegram webhook + reminder actions. |
| product-sales | DELETE | 8 | Product collections + sales inspiration. |
| compose-text | DELETE | 11 | Compose page, post composer, compose publish/validation, publish gates, outputs API. |
| editor | DELETE | 1 | `fabric-slideshow-canvas.tsx` (konva editor). |
| scripts-misc | DELETE | 9 | One-off imports/migrations/backfills/doc captures for deleted features. |

### 2.2 REWRITE notes (non-test files)

| File | Surgery |
|---|---|
| `lib/slideshows.ts` | Remove `rendi-ffmpeg` import and the four video functions (lines ~474–572, 1365–1410). Remove `automationId`/`runId`/`prompt`/`slideshow_type`/`image_collection` from the draft, and `deleteSlideshowRecordsForAutomation`. Remove `recordSlideshowPostIntents` auto-intents (an automation concept) or keep them behind an explicit `publish` block in the spec. Add `validateSlideshowSpec` (zod) as the single entry point. |
| `app/api/slideshows/route.ts` | POST = render from spec (sync for ≤N slides; else enqueue `render-slideshow`). Drop `videosCount`. |
| `app/api/slideshows/[id]/route.ts` | Remove the `@/lib/automation-runner` imports (`removeAutomationRunSlide`, `replaceAutomationRunSlideImage`, `updateAutomationRunMetadata`, `updateAutomationRunSlideText`, `AutomationRunRecord`) and the slide-edit PATCH branches. Keep GET, metadata PATCH (title/caption/hashtags) and DELETE (with `slideshow-lifecycle` publish guard). |
| `app/api/results/route.ts`, `lib/results.ts` | `ResultWorkflowType` becomes `"slideshow"` only; drop `ResultVideoPayload`, `deleteResultRecordsForAutomation`, and the `automationId` requirement. Replace the `JsonPathFilter` import from `lib/railway/domain-record-store`. |
| `components/realfarm/slideshow-viewer-modal.tsx` | Keep zoom/pan viewing (`InteractiveSlideStage`), zip download and metadata save. Remove slide text/image edit affordances. |
| `components/realfarm/template-showcase-preview.tsx` | Rename to `slide-preview.tsx`; keep `TemplateGeneratedPreview` as `SlidePreview`; delete `generatedExampleSlides`/`generatedExampleSlideshows`/`TemplateExample*`. |
| `app/api/public/slideshows/[id]/slides/[index]/route.ts`, `app/api/local-assets/[...assetPath]/route.ts`, `app/api/local-assets/upload/route.ts` | Replace `railwayFileResponse` (`lib/railway/storage-response`) with an Appwrite Storage stream/redirect helper. |
| `lib/asset-urls.ts` | Remove the `generated-video-share` / `public-generated-video-assets` imports and the video URL branch. |
| `lib/realfarm-data.ts` | Remove the `realfarm-automation` import and the `Automation` type/loaders; keep `LocalAsset` and media-library loading (rename to `lib/workspace-data.ts`). |
| `lib/realfarm-collections.ts`, `lib/media-library.ts` | Follow the realfarm-data rename; no automation references. |
| `app/api/image-collections/delete-preview/route.ts` | Remove the "used by automations" check (`listAutomationRecords`, `automationCollectionIds`, `automation-templates`). It becomes "used by N scheduled posts" or just a confirm. |
| `components/realfarm/collections-view.tsx`, `collections/use-collections-data.ts` | Remove `VariableCollectionsPanel`, `ProductCollectionsPanel`, `ProductCollection`, and the `/api/product-collections` fetch. |
| `components/realfarm/collections/collection-detail-view.tsx`, `pinterest-collection-search.tsx` | Remove the "Get image captions" flow (`/api/image-collections/captions`). |
| `components/realfarm/image-viewer-modal.tsx` | Remove AI image actions (`/api/image-collections/image-actions`, `realfarm-generation-model-registry`). |
| `components/realfarm/collection-selector.tsx`, `shared-media.tsx`, `creator-ui.tsx`, `collections/collection-loading-states.tsx` | Become the image-slot picker building blocks; fix the `LocalAsset` import path after the rename. |
| `app/api/calendar/route.ts` | Remove `automation-slots`, `automation-runner`, `automations`, `x-automation`, `x-automation-store` and the `/api/jobs` link. Source = PostFast posts (`postfastRequest`) + `listPublicationRecordsForRead` + queued `render-slideshow` jobs. |
| `lib/calendar-items.ts` | Drop automation/X item kinds. |
| `lib/calendar-summary.ts` | Replace the drizzle `domainRecords`/`jobs` query with Appwrite queries. |
| `lib/reminders.ts`, `lib/reminder-settings.ts` | Replace `ReminderChannel = "none" \| "telegram"` with the chosen channel (Q1); delete `telegramBotRequest`/`configureTelegramWebhook`/`telegramReminderConfiguration`; drop the `generated` event (nothing generates). |
| `app/api/postfast/integrations/route.ts` | Remove the post-connect sync into automations (`listAutomationRecords`, `patchAutomationRecord`) and X automations (`listXAutomations`, `upsertXAutomation`). |
| `components/realfarm/automation-settings/slideshow-publication-actions.tsx` | Move to `components/realfarm/publish/slideshow-publish-dialog.tsx`; replace `AutomationRunApiRecord` (`types.ts`) and `run-helpers.ts` with `SlideshowRecord`. |
| `lib/mcp/lumenclip-server.ts`, `tool-registry.ts` | Keep 16 tools (section 8). Delete 48 tool registrations and their 38 cut imports (section 3). |
| `lib/openapi-app.ts` | Add `POST /slideshows` (render from spec), `GET /slideshows/{id}`, `GET /slideshows/{id}/download`, `POST /specs/validate`, `GET /fonts`, collections/assets read, `POST /slideshows/{id}/publish`, `GET /jobs/{id}`. Auth = per-workspace API key or Clerk M2M token (Q2). `dataBackend: "railway"` → `"appwrite"`. |
| `scripts/lumenclip-mcp.mts`, `scripts/generate-mcp-docs.ts` | Follow the registry; regenerate `mcp/*.md`. |
| `lib/json-store.ts`, `lib/asset-storage.ts`, `lib/queue.ts`, `lib/output-publications.ts`, `lib/post-repository-store.ts`, `lib/workspace-members.ts`, `lib/consolidated-records.ts` | Appwrite TablesDB/Storage implementation, same exported API. `workspace-members` reads the drizzle `appUsers`/`domainRecords` today. |
| `lib/server-env.ts` | Replace `DATABASE_URL`/`PG_BOSS_SCHEMA` with `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_BUCKET_ID`. |
| `lib/test-helpers.ts`, `vitest.setup.ts`, `vitest.config.ts` | Replace the local-Postgres guard and table wiping with an in-memory store adapter (R3). Drop the `sharp/ffmpeg video` timeout comment. |
| `scripts/provision-consolidated-stores.mjs`, `clone-appwrite-schema.mjs`, `prune-appwrite-schema.mjs` | Provisioning for the new table set (`permanent_assets`, `outputs`, `output_media`, `posts`, `post_identities`, `jobs`, `workspace_members`, settings). Drop pre-consolidation legacy table names; prune becomes unnecessary on a fresh project (could be DELETE). |
| `components/realfarm-workspace.tsx`, `routes/workspace-route.tsx`, `navigation.tsx`, `workspace-navigation.ts`, `standalone-mobile-nav.tsx`, `home-view.tsx`, `user-settings-modal.tsx`, `app/app/page.tsx` | `ViewKey` becomes `"home" \| "render" \| "schedule" \| "collections"`. Remove the dynamic imports of compose-demo, analytics-view, automations-view, automation-settings, x-automation-studio, templates. Remove `loadInitialTemplateData` and `loadPublishedPostDates`. Home = recent renders grid (remove `ExampleSlideshowModal`, `GeneratedSlideshowViewer`, `PostFrequencyGraph`, video thumbnails, and `/api/generated-videos`). Settings tabs `models` and `demos` are deleted and `reminders` is rewritten (Telegram). |
| `proxy.ts` | Remove `internal-tools` and `INTERNAL_PATH_PREFIXES`. `PUBLIC_API_PATHS` loses `/api/telegram/webhook` and both `/api/tiktok-studio-analytics/*` entries. Make `/api/v1/*` key-authenticated rather than Clerk-gated (Q2). |
| `next.config.mjs` | `outputFileTracingIncludes` → `assets/fonts/**`. |
| `app/page.tsx`, `app/product/page.tsx`, `app/solutions/page.tsx`, `app/pricing/page.tsx`, `app/careers/page.tsx` | Rewrite marketing copy for the rendering engine (or reduce to `/` + legal). |

### 2.3 Full per-file inventory (every scanned code file, generated from the import graph)

Format: `#### <feature> — <decision> (files, tests)` then directory: basenames. Tests inherit their subject's decision unless listed elsewhere.

#### analytics-tiktok — DELETE (76 files, 25 tests)
- `app/analytics-preview/[platform]/`: page.tsx
- `app/api/analytics/report/`: route.test.ts, route.ts
- `app/api/tiktok-comments/capture/`: route.test.ts, route.ts
- `app/api/tiktok-comments/`: route.ts
- `app/api/tiktok-publications/`: route.ts
- `app/api/tiktok-studio-analytics/capture/`: route.ts
- `app/api/tiktok-studio-analytics/cloud-sync/`: route.test.ts, route.ts
- `app/api/tiktok-studio-analytics/`: route.test.ts, route.ts
- `app/app/analytics/`: error.tsx, loading.tsx, page.tsx
- `app/app/analytics/posts/[id]/`: loading.tsx, page.tsx
- `browser-extension/`: background.js, background.test.js, capture-bridge.js, capture-main.js, lumenclip-bridge.js, popup-context.js, popup.js, studio-content.js, studio-discovery-helpers.js, studio-discovery-helpers.test.js, tiktok.js
- `components/realfarm/analytics/`: account-profile-icon.tsx, analytics-sections.render.test.tsx, analytics-sections.tsx, analytics-selectors.test.ts, analytics-selectors.ts, analytics-view.tsx, pagination-controls.tsx, post-analytics-page.render.test.tsx, post-analytics-page.tsx, post-slides-strip.render.test.tsx, post-slides-strip.tsx, tiktok-studio-batch-dialog.tsx, tiktok-studio-import-dialog.tsx, use-analytics-data.ts
- `components/realfarm/`: post-frequency-graph.render.test.tsx, post-frequency-graph.tsx
- `lib/`: analytics-preview-data.ts, metric-registry.test.ts, metric-registry.ts, post-frequency.test.ts, post-frequency.ts, postfast-analytics.test.ts, postfast-analytics.ts, postfast-metric-snapshots.test.ts, postfast-metric-snapshots.ts, publication-link-state-migration.test.ts, publication-link-state-migration.ts, published-post-dates.test.ts, published-post-dates.ts, tiktok-comment-collection-client.test.ts, tiktok-comment-collection-client.ts, tiktok-comment-errors.ts, tiktok-comment-replies.ts, tiktok-comments-companion.ts, tiktok-comments.test.ts, tiktok-comments.ts, tiktok-publication-import.test.ts, tiktok-publication-import.ts, tiktok-studio-analytics.test.ts, tiktok-studio-analytics.ts, tiktok-studio-cloud-sync.test.ts, tiktok-studio-cloud-sync.ts, tiktok-studio-companion.ts, tiktok-studio-import.test.ts
- `lib/mcp/`: lumenclip-tiktok-server.ts, tiktok-studio-report.test.ts, tiktok-studio-report.ts
- `test/`: browser-extension-popup-context.test.js

#### api-mcp — KEEP (7 files, 1 tests)
- `app/api-reference/`: route.ts
- `app/api/settings/mcp/`: route.test.ts, route.ts
- `app/api/v1/[[...route]]/`: route.ts
- `app/mcp/`: route.ts
- `components/realfarm/`: mcp-settings-panel.tsx
- `lib/mcp/`: tool-access.ts

#### api-mcp — REWRITE (7 files, 2 tests)
- `lib/mcp/`: lumenclip-server.test.ts, lumenclip-server.ts, tool-registry.ts
- `lib/`: openapi-app.test.ts, openapi-app.ts
- `scripts/`: generate-mcp-docs.ts, lumenclip-mcp.mts

#### automations — DELETE (165 files, 58 tests)
- `app/api/automation-templates/`: route.ts
- `app/api/automations/[id]/experiment/`: route.ts
- `app/api/automations/[id]/hook-analytics/`: route.ts
- `app/api/automations/[id]/`: route.ts
- `app/api/automations/hooks/`: route.test.ts, route.ts
- `app/api/automations/`: route.test.ts, route.ts
- `app/api/automations/run/`: route.test.ts, route.ts
- `app/api/automations/runs/[id]/fork/`: route.test.ts, route.ts
- `app/api/automations/runs/`: route.test.ts, route.ts
- `app/api/automations/video-copy/`: route.ts
- `app/api/debug/automation-preview/`: route.test.ts, route.ts
- `app/api/debug/dump/`: route.ts
- `app/api/jobs/[id]/retry/`: route.test.ts, route.ts
- `app/api/temp/testing-center/generate/`: route.test.ts, route.ts
- `app/api/temp/testing-center/models/`: route.ts
- `app/api/templates/[id]/generate/`: route.ts
- `app/api/templates/[id]/`: route.ts
- `app/api/templates/`: route.ts
- `app/api/word-collections/[id]/`: route.ts
- `app/api/word-collections/`: route.ts
- `app/app/testing/`: page.tsx
- `app/app/workflows/slideshows/[id]/`: page.tsx
- `app/debug/`: page.tsx
- `components/debug/`: debug-automation-editor.tsx
- `components/realfarm/`: automation-settings.tsx, automations-view-preview.test.ts, automations-view.tsx, example-slideshow-modal.tsx, generation-loading.tsx, template-showcase-generated-preview.test.ts, templates.tsx, variable-collections-panel.tsx, video-automation-create-dialog.tsx
- `components/realfarm/automation-settings/`: automation-generation-grid.tsx, automation-video-generation.test.ts, automation-video-generation.ts, content-format-editor.tsx, demo-video-selector.test.tsx, demo-video-selector.tsx, drawer.tsx, format-helpers.test.ts, format-helpers.ts, format-preview-card.tsx, format-text-toolbar.tsx, general-settings.tsx, generated-slideshow-frame.tsx, generated-slideshow-viewer.tsx, generated-video-export-viewer.tsx, generated-video-viewer.tsx, generation-placeholder.test.ts, hook-analytics-panel.tsx, hook-rows-editor.tsx, hook-variable-editor.test.ts, hook-variable-editor.tsx, overview-panel.tsx, prompt-settings.tsx, run-helpers.test.ts, run-helpers.ts, run-publication-status-badge.tsx, schedule-helpers.ts, schedule-settings.tsx, settings-layout.tsx, settings-nav.tsx, slideshow-format-panel.tsx, slideshow-format-preview-stage.tsx, slideshow-workflow-view.tsx, slideshow-workflow.test.ts, slideshow-workflow.ts, social-platform-fields.tsx, social-settings-helpers.ts, social-settings.tsx, tiktok-publication-import-panel.tsx, types.ts, ugc-format-panel.test.tsx, ugc-format-panel.tsx, video-copy-fields.test.tsx, video-copy-fields.tsx, video-format-helpers.test.ts, video-format-helpers.ts, video-format-panel.tsx, video-template-panel.tsx, workflow-fork-panel.test.tsx, workflow-fork-panel.tsx, workflow-value-view.test.tsx, workflow-value-view.tsx
- `components/realfarm/workflow-artifacts/`: artifact-preview.test.tsx, artifact-preview.tsx, artifact-utils.ts
- `components/realfarm/workflow-inspector/`: types.ts, workflow-artifact-view.tsx, workflow-run-viewer.test.tsx, workflow-run-viewer.tsx
- `components/temp/`: slide-testing-center.tsx
- `components/ui/`: workflow-stage-map.tsx
- `lib/`: automation-experiment.test.ts, automation-experiment.ts, automation-hook-lint.test.ts, automation-hook-lint.ts, automation-hook-pool.test.ts, automation-hook-pool.ts, automation-hook-token-validation.test.ts, automation-hook-token-validation.ts, automation-output-qa.test.ts, automation-output-qa.ts, automation-readiness.test.ts, automation-readiness.ts, automation-run-contract.ts, automation-run-progress.ts, automation-runner-intents.test.ts, automation-runner-pinned-cta.test.ts, automation-runner-selection.test.ts, automation-runner.test.ts, automation-runner.ts, automation-slots.test.ts, automation-slots.ts, automation-template-defaults.ts, automation-templates-kind.test.ts, automation-templates.test.ts, automation-templates.ts, automation-upcoming-posts.test.ts, automation-upcoming-posts.ts, automation-variable-bindings.test.ts, automation-variable-bindings.ts, automation-versioning.test.ts, automations-normalization.test.ts, automations.test.ts, automations.ts, content-composition.test.ts, content-composition.ts, content-output-repository.ts, content-outputs.test.ts, content-outputs.ts, content-templates.test.ts, content-templates.ts, delete-automation.ts, internal-tools.ts, lifecycle-guard-read-modes.test.ts, pipeline-domain-storage.test.ts, pipeline-domain-storage.ts, pipeline-executor.test.ts, pipeline-executor.ts, pipeline-rendi.test.ts, pipeline-rendi.ts, pipeline-stages.ts, pipeline-ugc-rendi.ts, realfarm-automation-hooks.test.ts, realfarm-automation-normalization.test.ts, realfarm-automation-tone.test.ts, realfarm-automation-ugc.test.ts, realfarm-automation-web-search.test.ts, realfarm-automation.ts, realfarm-preview-text.test.ts, realfarm-preview-text.ts, slideshow-text-controls.test.ts, store-read-optimizations.test.ts
- `lib/mcp/`: production-pipeline-handlers.test.ts, production-pipeline-handlers.ts

#### backend — DELETE (53 files, 6 tests)
- `appwrite/functions/`: deploy.mjs
- `appwrite/functions/job-worker/src/`: automation-output-qa.js, deepl-translate.js, font-config.js, guards.js, hook-casing.js, hook-expansion.js, hook-variables.js, http.js, langfuse-config.js, langfuse-openrouter.js, langfuse-prompt-catalog.js, langfuse-prompts.js, llm-slop.js, main.js, main.test.js, openrouter.js, poll.js, postfast-client.js, postfast-provider-controls.js, provider-request-trace.js, publication-record-contract.node.test.js, publication-record.js, publishing-core.js, realfarm-generation-model-registry.js, realfarm-slideshow-text-style-config.js, rendi-client.js, slideshow-font-family.js, slideshow-generation-engine.js, slideshow-image-matching.js, slideshow-plan-core.js, slideshow-publishing-config.js, slideshow-raster-renderer.js, slideshow-renderer.js, slideshow-text-generation-payload.js, social-post-metadata.js, temp-slide-testing-shared.js, usage-core.js
- `appwrite/functions/template-scheduler/src/`: automation-slots.js, main.js, main.test.js
- `./`: drizzle.config.ts
- `lib/railway/`: database.ts, domain-record-store.ts, job-queue.ts, object-storage.test.ts, object-storage.ts, schema.test.ts, schema.ts, storage-response.ts
- `scripts/`: railway-migrate.mts, run-railway-function.test.ts, sync-function-shared.mjs

#### backend — REWRITE (21 files, 5 tests)
- `app/api/local-assets/[...assetPath]/`: route.test.ts, route.ts
- `app/api/local-assets/upload/`: route.ts
- `lib/`: asset-storage.ts, calendar-summary.test.ts, calendar-summary.ts, consolidated-records.test.ts, consolidated-records.ts, json-store.ts, output-publications.ts, post-repository-store.ts, queue.test.ts, queue.ts, results.test.ts, results.ts, server-env.ts, test-helpers.ts, workspace-members.ts
- `scripts/`: clone-appwrite-schema.mjs, provision-consolidated-stores.mjs, prune-appwrite-schema.mjs

#### compose-text — DELETE (11 files, 2 tests)
- `app/api/compose/publish/`: route.ts
- `app/api/outputs/`: route.ts
- `app/api/publish-gates/`: route.ts
- `app/app/compose/`: compose-demo.tsx, page.tsx
- `components/realfarm/composer/`: composer-types.ts, post-composer.test.tsx, post-composer.tsx
- `lib/`: compose-publishing.test.ts, compose-publishing.ts, compose-validation.ts

#### docs — DELETE (3 files, 0 tests)
- `components/docs/`: automation-template-assets.tsx, automation-template-catalog.tsx, pipeline-stage-json-enhancer.tsx

#### docs — KEEP (6 files, 0 tests)
- `app/api/search/`: route.ts
- `app/docs/[[...slug]]/`: page.tsx
- `app/docs/`: layout.tsx
- `components/docs/`: data-schema-group.tsx
- `./`: mdx-components.tsx, source.config.ts

#### editor — DELETE (1 files, 0 tests)
- `components/realfarm/`: fabric-slideshow-canvas.tsx

#### images — KEEP (28 files, 11 tests)
- `app/api/assets/caption/`: route.ts
- `app/api/assets/`: route.ts
- `app/api/assets/upload/`: route.test.ts, route.ts
- `app/api/image-collections/import/`: route.test.ts, route.ts
- `app/api/image-collections/`: route.test.ts, route.ts
- `app/api/image-proxy/`: route.test.ts, route.ts
- `app/api/media-library/`: route.ts
- `app/api/pexels/search/`: route.ts
- `app/api/pinterest/search/`: route.test.ts, route.ts
- `app/app/collections/[id]/`: page.tsx
- `app/app/collections/`: error.tsx, loading.tsx, page.tsx
- `lib/`: assets-delete.test.ts, assets.test.ts, assets.ts, image-collections-delete.test.ts, image-collections-import.test.ts, image-collections.ts, pexels-search.test.ts, pexels-search.ts, pinterest-search.test.ts, pinterest-search.ts

#### images — REWRITE (17 files, 3 tests)
- `app/api/image-collections/delete-preview/`: route.ts
- `components/realfarm/`: collection-selector.tsx, collections-view.tsx, creator-ui.tsx, image-viewer-modal.tsx, pinterest-collection-search.tsx, shared-media.tsx
- `components/realfarm/collections/`: collection-detail-view.tsx, collection-loading-states.tsx, use-collections-data.ts
- `lib/`: asset-urls.test.ts, asset-urls.ts, media-library.ts, realfarm-collections.test.ts, realfarm-collections.ts, realfarm-data.test.ts, realfarm-data.ts

#### llm-generation — DELETE (73 files, 32 tests)
- `app/api/image-collections/captions/`: route.test.ts, route.ts
- `app/api/image-collections/image-actions/`: route.ts
- `app/api/settings/generation-models/`: route.ts
- `app/api/slideshows/analyze-tone/`: route.test.ts, route.ts
- `components/realfarm/`: slideshow-tone-analyzer-dialog.tsx
- `lib/__live__/`: kie.live.test.ts, openrouter.live.test.ts, rendi.live.test.ts, slideshow-generation.live.test.ts
- `lib/`: brand-profile.test.ts, brand-profile.ts, debate-hook.test.ts, debate-hook.ts, deepl-translate.test.ts, deepl-translate.ts, elevenlabs-tts.test.ts, elevenlabs-tts.ts, fal-client.ts, generation-chain.test.ts, generation-chain.ts, generation-model-settings.ts, hook-casing.test.ts, hook-casing.ts, hook-expansion.test.ts, hook-expansion.ts, hook-publications.test.ts, hook-publications.ts, hook-variables.test.ts, hook-variables.ts, kie-image.test.ts, kie-image.ts, llm-slop.test.ts, llm-slop.ts, local-asset-download.ts, openrouter-models.test.ts, openrouter-models.ts, openrouter.test.ts, openrouter.ts, poll.test.ts, poll.ts, provider-fetch.test.ts, provider-fetch.ts, realfarm-generation-model-registry.ts, slideshow-generation-engine.ts, slideshow-image-matching.test.ts, slideshow-image-matching.ts, slideshow-oval-icons.test.ts, slideshow-oval-icons.ts, slideshow-plan-core.test.ts, slideshow-plan-core.ts, slideshow-text-generation-payload.ts, slideshow-text-generation.test.ts, slideshow-text-generation.ts, slideshow-tone-analysis.test.ts, slideshow-tone-analysis.ts, slideshow-workflow-fork.ts, social-post-metadata.test.ts, social-post-metadata.ts, temp-slide-testing-shared.ts, temp-slide-testing.test.ts, temp-slide-testing.ts, text-similarity.test.ts, text-similarity.ts, usage-core.ts, usage-ledger.test.ts, usage-ledger.ts, video-copy-prompt.test.ts, video-copy-prompt.ts, word-collections.ts, workflow-text-patch.test.ts, workflow-text-patch.ts

#### marketing — KEEP (4 files, 0 tests)
- `app/privacy/`: page.tsx
- `app/terms/`: page.tsx
- `components/marketing/`: marketing-mobile-menu.tsx, marketing-shell.tsx

#### marketing — REWRITE (5 files, 0 tests)
- `app/careers/`: page.tsx
- `app/`: page.tsx
- `app/pricing/`: page.tsx
- `app/product/`: page.tsx
- `app/solutions/`: page.tsx

#### platform — KEEP (36 files, 6 tests)
- `app/api/settings/team/accept/`: route.ts
- `app/api/settings/team/`: route.ts
- `app/`: global-error.tsx, layout.tsx, loading.tsx, not-found.tsx
- `app/login/[[...login]]/`: page.tsx
- `app/sign-up/[[...sign-up]]/`: page.tsx
- `app/team-invite/`: page.tsx
- `components/`: app-providers.tsx, clerk-auth-shell.tsx, team-invite-card.tsx, theme-provider.tsx
- `lib/`: api.test.ts, api.ts, auth.ts, clerk-auth-migration.test.ts, client-api.test.ts, client-api.ts, client-fetcher.ts, client-query.ts, data-store-errors.test.ts, data-store-errors.ts, data-url.ts, docs-layout.tsx, docs-source.ts, guards.ts, http.test.ts, http.ts, media-kind.ts, server-logger.ts, store-identity.ts, system-owner-context.ts, url-guard.test.ts, url-guard.ts, utils.ts

#### product-sales — DELETE (8 files, 3 tests)
- `app/api/product-collections/`: route.ts
- `components/realfarm/`: product-collections-panel.tsx, product-sales-inspiration.render.test.tsx, product-sales-inspiration.test.tsx, product-sales-inspiration.tsx
- `lib/`: product-collections.ts, product-sales-inspirations.test.ts, product-sales-inspirations.ts

#### publishing — KEEP (66 files, 21 tests)
- `app/api/calendar/items/[id]/`: route.test.ts, route.ts
- `app/api/calendar/summary/`: route.ts
- `app/api/postfast/connect-url/`: route.ts
- `app/api/postfast/posts/`: route.test.ts, route.ts
- `app/api/postfast/upload/`: route.ts
- `app/api/settings/reminders/`: route.test.ts, route.ts
- `components/realfarm/content-calendar/`: content-calendar-view.tsx
- `components/realfarm/`: delete-slideshow-dialog.tsx, publication-status-control.tsx, social-account-picker.tsx, social-account-selection.tsx, social-account-status.test.tsx, social-account-status.tsx, social-platform.tsx
- `components/realfarm/previews/`: facebook-preview.tsx, general-preview.tsx, instagram-preview.tsx, linkedin-preview.tsx, platform-preview.test.tsx, platform-preview.tsx, preview-parts.tsx, preview-types.ts, threads-preview.tsx, tiktok-preview.tsx, x-preview.tsx, youtube-preview.tsx
- `lib/`: manual-publication-linking.test.ts, manual-publication-linking.ts, manual-publication.test.ts, manual-publication.ts, post-content-type.test.ts, post-content-type.ts, post-repository-config.ts, post-repository-errors.ts, post-repository.test.ts, post-repository.ts, post-writer.test.ts, post-writer.ts, postfast-client.test.ts, postfast-client.ts, postfast-integrations.ts, postfast-media-upload.test.ts, postfast-media-upload.ts, postfast-posts.test.ts, postfast-posts.ts, postfast-provider-controls.ts, postfast-route.ts, posts.test.ts, posts.ts, publication-link-state.test.ts, publication-link-state.ts, publication-record.test.ts, publication-record.ts, publishing-core.ts, publishing-reminders.test.ts, publishing-stage4a.test.ts, publishing.test.ts, publishing.ts
- `lib/social/`: postfast-adapter.test.ts, postfast-adapter.ts, provider-contract.ts, registry.test.ts, registry.ts

#### publishing — REWRITE (4 files, 2 tests)
- `app/api/postfast/integrations/`: route.test.ts, route.ts
- `components/realfarm/automation-settings/`: slideshow-publication-actions.render.test.tsx, slideshow-publication-actions.tsx

#### render-core — KEEP (27 files, 11 tests)
- `app/api/public/slideshows/[id]/download/`: route.test.ts, route.ts
- `app/api/public/slideshows/[id]/slides/[index]/`: route.test.ts
- `app/share/slideshows/[id]/`: page.tsx
- `components/realfarm/`: public-slideshow-share.tsx
- `lib/`: font-config.test.ts, font-config.ts, public-slideshow-assets.test.ts, public-slideshow-assets.ts, realfarm-slideshow-text-style-config.ts, realfarm-ui-config.test.ts, slideshow-export.test.ts, slideshow-export.ts, slideshow-fabric-canvas.ts, slideshow-font-family.ts, slideshow-lifecycle.test.ts, slideshow-lifecycle.ts, slideshow-publishing-config.ts, slideshow-raster-renderer.test.ts, slideshow-raster-renderer.ts, slideshow-renderer.test.ts, slideshow-renderer.ts, slideshow-share.test.ts, slideshow-share.ts, slideshow-social-platforms.ts, slideshow-viewport.test.ts, slideshow-viewport.ts

#### render-core — REWRITE (12 files, 5 tests)
- `app/api/public/slideshows/[id]/slides/[index]/`: route.ts
- `app/api/results/`: route.test.ts, route.ts
- `app/api/slideshows/[id]/`: route.ts
- `app/api/slideshows/`: route.test.ts, route.ts
- `components/realfarm/`: slideshow-viewer-modal.render.test.tsx, slideshow-viewer-modal.tsx, template-showcase-preview.tsx
- `lib/`: slideshow-intents.test.ts, slideshows.test.ts, slideshows.ts

#### scheduling — REWRITE (8 files, 4 tests)
- `app/api/calendar/`: route.test.ts, route.ts
- `lib/`: calendar-items.test.ts, calendar-items.ts, reminder-settings.test.ts, reminder-settings.ts, reminders.test.ts, reminders.ts

#### scripts-misc — DELETE (9 files, 0 tests)
- `scripts/`: attach-astrology-product-sales-inspirations.mts, backfill-tiktok-canonical-urls.mts, capture-analytics-docs.mjs, capture-automations-docs.mjs, capture-hook-docs.mjs, import-amazon-home-improvement-products.mts, migrate-automation-variable-bindings.mts, migrate-publication-link-state.mts, package-companion-extension.mjs

#### shell — REWRITE (12 files, 4 tests)
- `app/app/`: page.tsx
- `components/`: mobile-navigation.test.tsx, realfarm-workspace.tsx
- `components/realfarm/`: heading-conventions.test.ts, home-view.test.tsx, home-view.tsx, navigation.tsx, standalone-mobile-nav.tsx, user-settings-modal.tsx, workspace-navigation.test.ts, workspace-navigation.ts
- `components/realfarm/routes/`: workspace-route.tsx

#### telegram — DELETE (4 files, 2 tests)
- `app/api/telegram/webhook/`: route.test.ts, route.ts
- `lib/`: reminder-actions.test.ts, reminder-actions.ts

#### tooling — DELETE (2 files, 0 tests)
- `./`: instrumentation.ts, vitest.live.config.ts

#### tooling — KEEP (6 files, 1 tests)
- `e2e/`: mobile-navigation.spec.ts
- `./`: playwright.config.ts
- `scripts/`: check-design-tokens.mjs, check-env.mjs, dev-local.mjs
- `test/`: server-only.ts

#### tooling — REWRITE (4 files, 0 tests)
- `./`: next.config.mjs, proxy.ts, vitest.config.ts, vitest.setup.ts

#### ui — KEEP (18 files, 3 tests)
- `components/ui/`: ag-data-table.tsx, app-toaster.tsx, button.tsx, confirm-dialog.tsx, form-controls.tsx, json-viewer.test.tsx, json-viewer.tsx, loading-skeleton.tsx, media-card.test.tsx, media-card.tsx, modal.tsx, sheet.tsx, spinner.tsx, tabs.tsx, upload-dropzone.tsx, use-dirty-guard.tsx, view-mode-toggle.test.tsx, view-mode-toggle.tsx

#### video-ugc — DELETE (48 files, 16 tests)
- `app/api/generated-videos/[id]/`: route.ts
- `app/api/generated-videos/`: route.ts
- `app/api/public/videos/[id]/media/`: route.test.ts, route.ts
- `app/api/settings/demos/[id]/`: route.ts
- `app/api/settings/demos/`: route.ts
- `app/api/ugc-runs/[id]/retry/`: route.ts
- `app/api/ugc-runs/[id]/`: route.ts
- `app/api/ugc-runs/estimate/`: route.ts
- `app/app/ugc/[id]/`: page.tsx
- `app/share/videos/[id]/`: page.tsx
- `components/realfarm/`: generated-video-exports.tsx, generated-video-renderer.ts, generated-video-thumbnail.tsx, generated-video-workflow.ts, greenscreen-view.tsx, use-video-thumbnail-frame.ts
- `components/realfarm/ugc/`: ugc-run-status.render.test.tsx, ugc-run-status.tsx, workflow-step-details.test.ts, workflow-step-details.ts
- `lib/`: demos.ts, generated-video-deletion.test.ts, generated-video-deletion.ts, generated-video-intents.test.ts, generated-video-share.test.ts, generated-video-share.ts, generated-video-types.ts, generated-videos.test.ts, generated-videos.ts, public-generated-video-assets.test.ts, public-generated-video-assets.ts, rendi-client.test.ts, rendi-client.ts, rendi-ffmpeg.test.ts, rendi-ffmpeg.ts, ugc-automation-runner.test.ts, ugc-automation-runner.ts, ugc-cost.test.ts, ugc-cost.ts, ugc-rendi-compositor.test.ts, ugc-rendi-compositor.ts, ugc-run-status.test.ts, ugc-run-status.ts, ugc-video-generation.test.ts, ugc-video-generation.ts, video-automation-templates.test.ts, video-automation-templates.ts

#### x-threads-linkedin — DELETE (28 files, 7 tests)
- `app/api/linkedin-automations/generate/`: route.ts
- `app/api/x-automations/[id]/derive-brief/`: route.test.ts, route.ts
- `app/api/x-automations/[id]/`: route.ts
- `app/api/x-automations/discover/`: route.ts
- `app/api/x-automations/generate/`: route.ts
- `app/api/x-automations/image/`: route.ts
- `app/api/x-automations/publish/`: route.ts
- `app/api/x-automations/`: route.ts
- `app/app/x-automations/`: page.tsx
- `components/realfarm/`: x-threads-brand-icon.tsx
- `components/`: x-automation-studio.test.tsx, x-automation-studio.tsx
- `lib/`: linkedin-automation-generation.ts, linkedin-post-presets.ts, x-automation-generation.test.ts, x-automation-generation.ts, x-automation-platform.test.tsx, x-automation-platform.ts, x-automation-publishing.test.ts, x-automation-publishing.ts, x-automation-runner.ts, x-automation-store.ts, x-automation.test.ts, x-automation.ts, x-post-presets.test.ts, x-post-presets.ts, x-trend-discovery.ts

## 3. Cut lines: kept files that import deleted modules

Each row is a KEEP/REWRITE file, the deleted module(s) it imports (with line), and what to do. Fix these **in the same commit that deletes the target**, or earlier, or typecheck breaks.

### 3.1 Import cut lines (35 files; 30 non-test)

| Kept file (owner) | Deleted import @ line | Sever by |
|---|---|---|
| `lib/mcp/lumenclip-server.ts` (B) | 38 deleted modules: `pipeline-executor`, `mcp/production-pipeline-handlers`, `pipeline-stages`, `automation-output-qa`, `automation-experiment`, `automation-variable-bindings`, `automations`, `automation-templates`, `automation-hook-pool`, `automation-hook-lint`, `automation-hook-token-validation`, `automation-runner`, `automation-run-progress`, `automation-slots`, `generated-videos`, `delete-automation`, `slideshow-workflow-fork`, `metric-registry`, `postfast-analytics`, `postfast-metric-snapshots`, `realfarm-automation`, `product-collections`, `generated-video-deletion`, `slideshow-tone-analysis`, `tiktok-publication-import`, `tiktok-studio-analytics`, `mcp/tiktok-studio-report`, `tiktok-comments`, `tiktok-comment-replies`, `x-automation`, `x-automation-runner`, `x-automation-store`, `word-collections`, `hook-variables`, `ugc-cost`, `ugc-automation-runner`, `ugc-run-status`, `hook-publications` (plus the `Automation` type from `realfarm-data`, which is rewritten) | Delete 48 tool registrations (section 8), then the imports. Rewrite `lumenclip_slideshow_generate` → `lumenclip_slideshow_render` on `lib/slideshows`. |
| `lib/mcp/lumenclip-server.test.ts` (B) | `automations`, `generated-videos`, `ugc-run-status`, `automation-runner`, `postfast-metric-snapshots`, `realfarm-automation`, `x-automation`, `word-collections` | Rewrite the test around the 16 kept tools (3,359 lines today; most are deleted). |
| `components/realfarm-workspace.tsx` (A) | `realfarm-automation`@23, `x-automation`@29, `automations`@30, `composer/composer-types`@35 (`ConnectedComposerAccount`), dynamic `app/app/compose/compose-demo`@47, `analytics/analytics-view`@50, `automations-view`@65, `automation-settings`@70, `x-automation-studio`@75, `templates`@90 | Remove the views and the `/api/automations/runs`, `/api/templates`, `/api/x-automations*` fetches. Move `ConnectedComposerAccount` to `lib/social/provider-contract.ts` (or `components/realfarm/publish/types.ts`). |
| `components/realfarm/routes/workspace-route.tsx` (A) | `automation-templates`@14, `published-post-dates`@16, `composer/composer-types`@19 | Drop `loadInitialTemplateData` and `loadPublishedPostDates`; re-point the account type. |
| `components/realfarm/home-view.tsx` (A) | `example-slideshow-modal`@29, `automation-settings/generated-slideshow-viewer`@33, `automation-settings/types`@34, `generated-video-types`@41, `post-frequency-graph`@43, `use-video-thumbnail-frame`@46 | Home = recent slideshow renders (use `SlidePreview` + `SlideshowViewerModal`). |
| `components/realfarm/automation-settings/slideshow-publication-actions.tsx` (A) | `automation-settings/run-helpers`@27, `automation-settings/types`@28 | Move file; type against `SlideshowRecord`. |
| `components/realfarm/automation-settings/slideshow-publication-actions.render.test.tsx` (A) | `automation-settings/types`@5 | Move with the component. |
| `components/realfarm/collections-view.tsx` (A) | `variable-collections-panel`@34, `product-collections-panel`@35, `product-collections`@46 | Remove the "Variables" and "Products" tabs. |
| `components/realfarm/collections/use-collections-data.ts` (A) | `product-collections`@17 | Remove product state and fetch. |
| `components/realfarm/image-viewer-modal.tsx` (A) | `realfarm-generation-model-registry`@15 | Remove the AI image-actions menu. |
| `app/docs/[[...slug]]/page.tsx` (A) | `components/docs/pipeline-stage-json-enhancer`@11 | Remove `<PipelineStageJsonEnhancer/>`. |
| `proxy.ts` (A) | `internal-tools`@4 | Remove the internal-path 404 block. |
| `app/api/calendar/route.ts` (B) | `automation-slots`@7, `automation-runner`@11, `automations`@15, `x-automation`@39, `x-automation-store`@40 | Rewrite the projection (section 2.2). |
| `app/api/image-collections/delete-preview/route.ts` (B) | `automation-templates`@8, `automations`@9, `realfarm-automation`@11 | Drop the automation-usage check. |
| `app/api/image-collections/route.test.ts` (B) | `usage-ledger`@54 | Delete the usage-ledger assertion. |
| `app/api/postfast/integrations/route.ts` (B) | `automations`@9, `x-automation-store`@12 | Drop the post-connect automation sync. |
| `app/api/slideshows/[id]/route.ts` (B) | `automation-runner`@13 | Drop the slide-edit PATCH branches. |
| `lib/slideshows.ts` (B) | `rendi-ffmpeg`@24 | Drop the mp4 export functions. |
| `lib/asset-urls.ts` (B) | `generated-video-share`@8, `public-generated-video-assets`@9 | Drop the video URL branch. |
| `lib/asset-urls.test.ts` (B) | `generated-video-share`@9 | Drop the video cases. |
| `lib/realfarm-data.ts` (B) | `realfarm-automation`@11 | Drop the `Automation` type/loaders. |
| `lib/post-repository.ts` (B) | `postfast-metric-snapshots`@19 (`type PostFastMetricSnapshot`) | Drop the metrics field from the post read projection (or inline a minimal type). |
| `lib/postfast-posts.ts` (B) | dynamic `import("@/lib/hook-publications")`@305 (`recordPublishedHookUsage`) | Delete the dynamic import block (lines 305–307). |
| `lib/json-store.ts` (C) | `railway/domain-record-store`@28 | Appwrite TablesDB implementation. |
| `lib/asset-storage.ts` (C) | `railway/object-storage`@16 | Appwrite Storage implementation. |
| `lib/queue.ts` (C), `lib/queue.test.ts` (C) | `railway/database`@7/@9, `railway/schema`@8/@10 | Appwrite `jobs` table with lease columns. |
| `lib/results.ts` (C) | `railway/domain-record-store`@10 (`JsonPathFilter`) | Re-export a filter type from json-store. |
| `lib/output-publications.ts` (C) | `railway/domain-record-store`@10 | Via json-store. |
| `lib/post-repository-store.ts` (C) | `railway/domain-record-store`@12 | Via json-store. |
| `lib/calendar-summary.ts` (C) | `railway/database`@7, `railway/schema`@8, `railway/domain-record-store`@9 | Appwrite queries. |
| `lib/workspace-members.ts` (C) | `railway/database`@7, `railway/schema`@8 | Appwrite table (or Clerk Organizations, Q5). |
| `lib/test-helpers.ts` (C) | `railway/database`@5, `railway/schema`@6 | In-memory store reset. |
| `app/api/local-assets/[...assetPath]/route.ts` (C) | `railway/storage-response`@6 | Appwrite file response helper. |
| `app/api/public/slideshows/[id]/slides/[index]/route.ts` (C) | `railway/storage-response`@7 | Same helper. |

### 3.2 String-URL cut lines (fetches from kept files to deleted routes; tsc will NOT catch these)

| Kept file | URL → deleted route |
|---|---|
| `components/realfarm-workspace.tsx` | `/api/automations/runs`, `/api/templates`, `/api/x-automations`, `/api/x-automations/generate` |
| `components/realfarm/home-view.tsx` | `/api/generated-videos` |
| `components/realfarm/collections/collection-detail-view.tsx` | `/api/image-collections/captions` (line ~258) |
| `components/realfarm/pinterest-collection-search.tsx` | `/api/image-collections/captions` |
| `components/realfarm/collections/use-collections-data.ts` | `/api/product-collections` |
| `components/realfarm/image-viewer-modal.tsx` | `/api/image-collections/image-actions` (line 59) |
| `components/realfarm/user-settings-modal.tsx` | `/api/settings/demos`, `/api/settings/generation-models` (plus Telegram fields in the reminders tab) |
| `app/api/calendar/route.ts` | `/api/jobs` link (route never existed as a list; `/api/jobs/[id]/retry` is deleted) |
| `proxy.ts` | `/api/telegram/webhook`, `/api/tiktok-studio-analytics/capture`, `/api/tiktok-studio-analytics/cloud-sync`, `/debug`, `/api/debug` |

### 3.3 Side-effect / CSS / config cut lines

- `app/layout.tsx:9` `import "@xyflow/react/dist/style.css"`: remove (only `components/ui/workflow-stage-map.tsx` used xyflow).
- `app/globals.css:7` `@import "jsoneditor/dist/jsoneditor.min.css"`: remove (jsoneditor is used only by the deleted debug editor and the docs JSON enhancer).
- `railway.worker.json`: `buildCommand: pnpm railway:worker:check`, `startCommand: pnpm railway:worker:once`. **Neither script exists**, so the deploy is already broken at HEAD. Point it at the new worker script.
- `appwrite.json`: declares `template-scheduler` + `job-worker` functions (deleted). Reduce it to project/table/bucket declarations or delete it in favor of `scripts/provision-consolidated-stores.mjs`.
- `source.config.ts` excludes `ui-audit-2026-07-29/**`, which no longer exists; harmless.

## 4. Non-code inventory

### 4.1 `appwrite/`, `appwrite.json`, `assets/`, `infra/`, `data/`, `hooks/`, `test/`, `e2e/`

| Path | Decision | Reason |
|---|---|---|
| `appwrite/functions/job-worker/assets/fonts/*.otf` (21: Angelina, Backind-Maldina, Buffalo-Regular, CasualHuman-Bold/Regular, HerticalSans-Regular/Rough/Smooth/Texture, HerticalSerif-Regular/Rough/Smooth/Texture, Respano, Rossen-Serif, Sunset-Script, Superbusy-Activity-Outline/Regular/Text, Thumpa, Yoriglo) | **MOVE → `assets/fonts/`** | The only display fonts in the repo. Register them in a font registry that replaces the Inter-only `resolveSlideshowFont`. License check (Q4). |
| `appwrite/functions/job-worker/assets/fonts/Inter-Variable.ttf` | DELETE | Duplicate of `assets/fonts/Inter-Variable.ttf`. |
| `appwrite/functions/job-worker/package.json`, `appwrite/functions/template-scheduler/package.json` | DELETE | Functions are retired; the worker runs on Railway. |
| `appwrite/functions/**/*.js` (41) | DELETE | See the backend group. Port the lease/retry/dead-letter loop from `job-worker/src/main.js` into `scripts/worker.mts` on top of `lib/queue.ts`. |
| `appwrite.json` | REWRITE | Drop the `functions` array; keep `projectId`/`projectName` and optionally declare tables/buckets. The project id `6a503d670029246bca10` is probably the old self-hosted/local project: confirm or replace with the Cloud project (Q3). |
| `assets/fonts/Inter-Variable.ttf` | KEEP | Bundled fallback font. |
| `infra/railway/migrations/0001…0004_*.sql` (4) | DELETE | Postgres schema, no longer used. |
| `data/backups/publication-link-state-2026-07-26T07-08-39.095Z.json` | DELETE | Migration backup for a deleted migration; fresh start. |
| `data/product-collections/amazon-home-improvement-sg.json` | DELETE | Product-sales seed. |
| `hooks/.gitkeep` | DELETE | Empty directory. |
| `test/server-only.ts` | KEEP | Vitest alias stub. |
| `test/browser-extension-popup-context.test.js` | DELETE | Extension removed. |
| `e2e/mobile-navigation.spec.ts` | KEEP (update nav labels) | Only e2e spec. |
| `browser-extension/` (19 files: 11 JS incl. 2 tests, README.md, manifest.json, popup.css, popup.html, icons/icon16/32/48/128.png) | DELETE | TikTok Studio/comments companion. |
| `public/downloads/lumenclip-companion.zip`, `public/downloads/lumenclip-tiktok-studio-analytics.zip` | DELETE | Companion packages. |
| `lidojs-text-editor-2.0.0.tgz` (untracked, root) | Owner decision | Untracked tarball of a text-editor library. If it was meant for the removed editor, delete it locally; not tracked, so no repo change. |
| `tmp/pdfs` (untracked, gitignored by tsconfig exclude) | Ignore | Not tracked. |

### 4.2 `public/` (58 tracked files)

| Path | Decision | Reason |
|---|---|---|
| `public/.gitkeep`, `public/brand/lumenclip-brandkit.png`, `public/brand/lumenclip-mark.png` | KEEP | Brand. |
| `public/docs/collections/*.png` (4: collections-grid, collections-table, variable-collections, video-collections) | KEEP 2 / DELETE 2 | Keep grid + table; delete `variable-collections.png`, `video-collections.png`. |
| `public/docs/scheduling/*.png` (2) | KEEP (re-export after the calendar rewrite) | Schedule docs. |
| `public/docs/workflows/collection-crud-0[1-8]-*.jpg` (8) | KEEP | Collection CRUD walkthrough still valid. |
| `public/docs/workflows/*` other 39 (astrology-blank-01…13, study-template-01…12, greenscreen-01…03, ugc-reaction-01…03, threads-automation-02/03, x-automation-02/03, social-text-01, content-analysis-01, video-01-formats, workflow-home) | DELETE | Automation/video/text walkthroughs. |
| `public/downloads/*.zip` (2) | DELETE | See above. |

### 4.3 `docs/` (151 files): 68 kept/rewritten, 83 deleted

| Path | Decision | Reason |
|---|---|---|
| `docs/index.mdx`, `docs/meta.json` | REWRITE | New IA: Rendering spec, API/MCP, Publishing & schedule, Collections, Backend. |
| `docs/data/automations.mdx`, `docs/data/railway-migration.md` | DELETE | Automations; Railway Postgres. |
| `docs/data/backend-architecture.md`, `backend-endpoints.md`, `generation-outputs.mdx` (→ render outputs), `index.md`, `meta.json`, `operations-access.mdx`, `persistence.mdx`, `publishing-analytics.mdx` (strip analytics), `schema-reference.md`, `workspace-assets.mdx` | REWRITE (10) | Appwrite tables/buckets; render outputs. |
| `docs/jobs/index.mdx`, `backend.md`, `reminders.md` | REWRITE (3) | Calendar without automation slots; worker on Railway; reminder channel. |
| `docs/jobs/manual-linking.md`, `docs/jobs/meta.json` | KEEP (2) | Manual-post flow stays. |
| `docs/libraries/index.md`, `docs/libraries/meta.json` | REWRITE (2) | Dependency list changes (section 5). |
| `docs/reference/agent-github-publishing.md` | KEEP | Still governs commits/PRs. |
| `docs/reference/railway-worker-operations.md` | REWRITE | It references Windmill, the retired scheduler and missing scripts. |
| `docs/reference/workflow-inspector-design-contract.md` | DELETE | Contract for deleted automation run viewer. |
| `docs/ui-paper-audit-2026-08-01/README.md` | DELETE | Audit of removed surfaces. |
| `docs/uiux.md` | KEEP (review) | Generic UI guidelines. |
| `docs/ui/index.md`, `docs/ui/routes.md`, `docs/ui/meta.json` | REWRITE (3) | New route map. |
| `docs/ui/analytics/*` (4), `docs/ui/automations/*` (10), `docs/ui/templates/*` (11), `docs/ui/testing/*` (3), `docs/ui/compose/*` (2) | DELETE (30) | Removed surfaces. |
| `docs/ui/collections/collection-detail.md`, `collections.md` | REWRITE (2) | No captions/variables/products. |
| `docs/ui/collections/meta.json` | KEEP | |
| `docs/ui/home/home.md`, `published-posts.md` | REWRITE (2) | Home = renders. |
| `docs/ui/home/meta.json` | KEEP | |
| `docs/ui/public/auth.md`, `docs.md`, `public-slideshow.md` | KEEP (3) | |
| `docs/ui/public/index.md`, `landing.md`, `legal.md`, `meta.json` | REWRITE (4) | Marketing copy; `legal.md` lists internal system pages (debug/analytics-preview) being deleted. |
| `docs/ui/public/public-generated-video.md` | DELETE | Video share removed. |
| `docs/ui/schedule/schedule.md` | REWRITE | |
| `docs/ui/schedule/meta.json` | KEEP | |
| `docs/ui/settings/ai-models.md` | DELETE | |
| `docs/ui/settings/notifications.md`, `docs/ui/settings/meta.json` | REWRITE (2) | Telegram removed. |
| `docs/ui/workspace/app-shell.md`, `media-viewers.md`, `navigation.md` | REWRITE (3) | New nav. |
| `docs/ui/workspace/ui-primitives.md`, `docs/ui/workspace/meta.json` | KEEP (2) | |
| `docs/ui/assets/screenshots/*.png` (62) | KEEP 21 / DELETE 41 | Keep `{desktop,mobile}-collection-detail`, `-collection-view-options`, `-collections-add-modal`, `-collections-detail`, `-collections-index`, `-collections`, `-public-slideshow`, `-schedule`, `-workspace-notifications`, `-landing-page` (20) + `desktop-login-page` (1); re-export landing/schedule/notifications after the rewrite. Delete everything else (analytics, automations-*, compose, dashboard*, home-published-posts, template-slideshow-detail, testing*, workspace-ai-models, x-automations). |
| `docs/workflows/*` (6: index.mdx, meta.json, linkedin-generation.md, slideshow-generation.md, ugc-video-generation.md, x-threads-generation.md) | DELETE | Generation pipelines. Replace with `docs/rendering/spec.md`. |

Count check: deleted = data 2 + reference 1 + audit 1 + ui sections 30 + public-generated-video 1 + ai-models 1 + screenshots 41 + workflows 6 = **83 of 151 deleted, 68 kept or rewritten**.

### 4.4 `mcp/` (16 markdown files)

| Path | Decision |
|---|---|
| `mcp/README.md`, `mcp/tool-index.md`, `mcp/shared-contracts.md` | REWRITE (regenerated by `pnpm mcp:docs`) |
| `mcp/collections/README.md` | REWRITE (drop variable/product tools) |
| `mcp/outputs/README.md`, `mcp/publishing/README.md`, `mcp/scheduling/README.md`, `mcp/slideshow/README.md`, `mcp/exports/README.md`, `mcp/workspace/README.md` | REWRITE (6) |
| `mcp/analytics/README.md`, `mcp/automations/README.md`, `mcp/templates/README.md`, `mcp/videos/README.md`, `mcp/workflows/README.md`, `mcp/social-media/README.md` | DELETE (6) |

### 4.5 Root files

| File | Decision | Reason |
|---|---|---|
| `AGENTS.md` | REWRITE | Keep "This is NOT the Next.js you know" and "GitHub publishing". Delete "Workflow run viewer layout" (lines 12–89) and keep only the generic UI rules from it (Button/Tabs primitives, button sizes, text tabs, no floating actions, 360px rule). Rewrite "Railway backend and Clerk authentication" (lines 91–116) as "Appwrite Cloud data/storage, Railway runtime (web + worker), Clerk auth"; remove `pnpm railway:db:migrate`, `LUMENCLIP_DATA_BACKEND`/`LUMENCLIP_ASSET_BACKEND`, `RAILWAY_BUCKET_*`, and "Do not add Railway SDKs…" (replace with the Appwrite equivalent). |
| `README.md` | REWRITE | Every section changes. "Further documentation" points at files that do not exist (`docs/README.md`, `docs/STATE.md`, `docs/roadmap/`, `docs/tabs/`, `docs/reference/backend-architecture.md`, `docs/reference/data-objects.md`). |
| `DESIGN.md` | REWRITE (2 subsections) | "Product surfaces → Home" ("quick-start workflows") and "Cards" ("automation templates"). Keep brand, color, type, shape, motion and accessibility. |
| `drizzle.config.ts` | DELETE | |
| `railway.worker.json` | REWRITE | Broken scripts (section 3.3). |
| `appwrite.json` | REWRITE | Section 4.1. |
| `components.json`, `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json`, `pnpm-workspace.yaml`, `mdx-components.tsx`, `source.config.ts`, `next-env.d.ts`, `playwright.config.ts` | KEEP | `pnpm-workspace.yaml` has placeholder values (`sharp: set this to true or false`) to fix. |
| `vitest.live.config.ts` | DELETE (or keep with new Appwrite/PostFast live smoke tests) | All 4 live tests are deleted. |
| `instrumentation.ts` | DELETE | Empty `register()`. |
| `.env.example` | REWRITE | Section 6. |

## 5. `package.json`

### 5.1 Scripts (25)

| Script | Decision |
|---|---|
| `env:check` | KEEP (update `requiredLocal` in `scripts/check-env.mjs`: `DATABASE_URL`, `OPENROUTER_API_KEY` → `APPWRITE_*`, Clerk) |
| `dev`, `dev:web`, `build`, `start`, `lint`, `lint:design-tokens`, `test`, `e2e`, `e2e:ui`, `e2e:live`, `format`, `typecheck` | KEEP (12) |
| `mcp`, `mcp:docs`, `mcp:docs:check` | KEEP (3) |
| `test:live` | REWRITE (no live tests remain; add Appwrite + PostFast live smoke, which matches the standing live-test authorization) |
| `products:import:home-improvement`, `companion:package`, `tiktok-studio:package`, `tiktok-studio:backfill-urls`, `migrate:publication-link-state`, `migrate:automation-variable-bindings` | DELETE (6) |
| `railway:db:migrate`, `railway:db:generate`, `railway:db:studio` | DELETE (3) |
| *new* `appwrite:provision` (`node scripts/provision-consolidated-stores.mjs`), `worker:once` + `worker:check` (Railway cron), `fonts:check` (optional) | ADD |

### 5.2 Dependencies

| Package | Verdict | Evidence (importers after strip) |
|---|---|---|
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | **REMOVE** | Only `lib/railway/object-storage.ts`, `storage-response.ts` |
| `drizzle-orm`, `drizzle-kit`, `postgres` | **REMOVE** | Only `lib/railway/*` + 5 backend-seam files being rewritten + 3 deleted scripts |
| `pg-boss` | **REMOVE** | Only `lib/railway/job-queue.ts` (0 importers today) |
| `@xyflow/react` | **REMOVE** | `workflow-stage-map.tsx` + the `layout.tsx` CSS import |
| `jsoneditor`, `@types/jsoneditor` | **REMOVE** | Debug editor + docs JSON enhancer + `globals.css` import. Spec paste uses a textarea + server validation; read-only display uses `@uiw/react-json-view` |
| `konva`, `react-konva` | **REMOVE** | Only `fabric-slideshow-canvas.tsx` (editor) |
| `recharts` | **REMOVE** | Only analytics components |
| `p-retry` | **REMOVE** | Only `lib/provider-fetch.ts` |
| `ag-charts-types`, `ag-stack` | **REMOVE** | Zero imports anywhere today |
| `@clerk/testing` | REMOVE or keep-dev | Only the deleted `scripts/capture-hook-docs.mjs`; keep if logged-in e2e is planned |
| `node-appwrite` | **ADD** | Imported by 3 provisioning scripts already; needed by the backend seam |
| `@langfuse/client`, `@langfuse/tracing` | n/a | Only in deleted `appwrite/functions/job-worker/package.json` |
| `canvas`, `fabric`, `sharp`, `jszip` | KEEP | Renderer, image normalization, zip export |
| `@fullcalendar/{core,daygrid,interaction,react,timegrid}`, `luxon`, `@types/luxon` | KEEP | `content-calendar-view.tsx` |
| `ag-grid-community`, `ag-grid-react` | KEEP (optional drop) | Collections table view only (`ag-data-table.tsx`, `collections-view.tsx`) |
| `@mantine/core`, `@mantine/notifications` | KEEP (consolidation candidate) | Only `loading-skeleton.tsx`, `spinner.tsx`, layout, providers |
| `react-icons` | KEEP (consolidation candidate → `@tabler/icons-react`) | 4 kept files |
| `@hono/zod-openapi`, `hono`, `@scalar/nextjs-api-reference`, `@modelcontextprotocol/sdk`, `zod` | KEEP | Public API + MCP |
| `@clerk/nextjs`, `@clerk/ui`, `@t3-oss/env-nextjs`, `pino`, `@tanstack/react-query`, `@uiw/react-json-view`, `radix-ui`, `react-dropzone`, `sonner`, `next-themes`, `class-variance-authority`, `clsx`, `tailwind-merge`, `fumadocs-*` (3), `@tabler/icons-react`, `server-only`, `shadcn`, `tw-animate-css` | KEEP | `shadcn` and `tw-animate-css` are CSS-only imports in `globals.css` |
| `typescript`, `tsx`, `vitest`, `@playwright/test`, eslint/prettier/tailwind toolchain, `@types/*` | KEEP | |

Net: **−16 packages** (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `drizzle-orm`, `drizzle-kit`, `postgres`, `pg-boss`, `@xyflow/react`, `jsoneditor`, `@types/jsoneditor`, `konva`, `react-konva`, `recharts`, `p-retry`, `ag-charts-types`, `ag-stack`, `@clerk/testing`), **+1** (`node-appwrite`). `pnpm-workspace.yaml` `onlyBuiltDependencies` stays (canvas, sharp).

## 6. `.env.example` (56 variables: 15 keep, 40 delete, 1 conditional)

| Variable(s) | Decision |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`, `CLERK_TESTING_TOKEN` | KEEP (7) |
| `LOG_LEVEL`, `LUMENCLIP_SYSTEM_OWNER_ID`, `LUMENCLIP_MCP_OWNER_ID`, `APIFY_KEY` (Pinterest search uses it), `PEXELS_KEY`, `POSTFAST_API_KEY`, `BASE_URL`, `SLIDESHOW_SHARE_SECRET` | KEEP (8) |
| `ENABLE_INTERNAL_TOOLS` | DELETE |
| `AUTOMATIONS_DOCS_URL`, `AUTOMATIONS_DOCS_EMAIL`, `AUTOMATION_DOCS_URL`, `AUTOMATION_DOCS_EMAIL` | DELETE (4) (doc-capture scripts deleted) |
| `DATABASE_URL`, `PG_BOSS_SCHEMA`, `RAILWAY_BUCKET_NAME`, `RAILWAY_BUCKET_ENDPOINT`, `RAILWAY_BUCKET_ACCESS_KEY_ID`, `RAILWAY_BUCKET_SECRET_ACCESS_KEY`, `RAILWAY_BUCKET_REGION` | DELETE (7) |
| `POST_REPOSITORY_READ_MODE`, `POST_REPOSITORY_WRITE_MODE` | DELETE (2): fresh start means canonical only; simplify `lib/post-repository-config.ts` to constants |
| `TIKTOK_STUDIO_CLOUD_ORIGIN`, `TIKTOK_STUDIO_CAPTURE_SECRET`, `TIKTOK_COMMENTS_CAPTURE_SECRET` | DELETE (3) |
| `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, `FAL_KEY`, `FAL_WHISPER_MODEL`, `ELEVENLABS_API_KEY`, `ENABLE_UGC_AUTOMATION`, `DEEPL_KEY`, `KIE_KEY`, `RENDI_API_KEY` | DELETE (10) |
| `APIFY_YOUTUBE_ACTOR`, `APIFY_REDDIT_ACTOR`, `APIFY_TWITTER_ACTOR`, `APIFY_TIKTOK_ACTOR`, `APIFY_TIKTOK_SLIDESHOW_ACTOR`, `APIFY_INSTAGRAM_ACTOR`, `AMAZON_ASSOCIATE_TAG`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | DELETE (9) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` | DELETE (3) |
| `OUTPUT_SHARE_SECRET` | DELETE (video share only) |
| `RUN_LIVE` | KEEP if `test:live` is rebuilt; else DELETE |
| *new* `APPWRITE_ENDPOINT` (e.g. `https://<region>.cloud.appwrite.io/v1`), `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_BUCKET_ID`, plus the notification-channel var(s) (Q1) and the API-key signing secret (Q2) | ADD |

## 7. Railway services

| Service | Decision | Notes |
|---|---|---|
| `web` | KEEP | No `railway.json` in the repo (deleted in b853662), so Railpack defaults apply. Add one with an explicit `pnpm build`/`pnpm start` and a healthcheck on `/api/v1/health`. Swap vars per section 6. |
| `worker` (`railway.worker.json`, cron `*/5`) | REWRITE | Currently points at missing scripts. New `scripts/worker.mts` drains Appwrite `jobs`: `render-slideshow` (async renders from API/MCP) and `send-notification`. Cron every minute, or a continuous worker if renders must be prompt (Q6). |
| `scheduler` | DELETE | Retired no-op (`docs/reference/railway-worker-operations.md`). PostFast schedules posts natively. |
| Railway PostgreSQL | DELETE after cutover | Fresh start on Appwrite; nothing to migrate. |
| Bucket `lumenclip-assets` | DELETE after cutover | Same. |

## 8. MCP tools (64 → 16)

- **KEEP (15):** `lumenclip_collections_list`, `lumenclip_collection_save`, `lumenclip_collection_add_assets`, `lumenclip_collection_delete`, `lumenclip_assets_list`, `lumenclip_outputs_list`, `lumenclip_output_get`, `lumenclip_output_delete`, `lumenclip_operations_list`, `lumenclip_operation_get`, `lumenclip_accounts_list`, `lumenclip_workspace_members_list`, `lumenclip_output_publish`, `lumenclip_output_mark_published`, `lumenclip_schedule_get` (rewritten to the new calendar).
- **REWRITE (1):** `lumenclip_slideshow_generate` → `lumenclip_slideshow_render` (spec in, render out).
- **ADD (suggested):** `lumenclip_spec_validate`, `lumenclip_fonts_list`, `lumenclip_spec_schema_get`.
- **DELETE (48):** `lumenclip_pipeline_catalog`, `_pipeline_stage_run`, `_pipeline_run`, `_workflow_fork`, `_automations_list`, `_automation_templates_list`, `_automation_create`, `_automation_clone`, `_automation_get`, `_automation_variable_bindings_get`, `_automation_experiment_dimensions`, `_automation_experiment_run`, `_automation_schema_update`, `_automation_formatting_update`, `_automation_text_item_update`, `_automation_delete`, `_automation_hooks_get`, `_automation_hooks_update`, `_automation_hook_upsert`, `_automation_hook_set_enabled`, `_automation_hook_delete`, `_hook_performance`, `_hook_variants_generate`, `_hook_variant_select`, `_run_plan_get`, `_automation_run`, `_automation_update`, `_slideshow_analyze`, `_ugc_estimate`, `_ugc_generate`, `_product_collection_get`, `_variable_get`, `_variable_save`, `_variable_delete`, `_output_validate`, `_output_slide_text_update`, `_analytics_report`, `_tiktok_import_start`, `_tiktok_import_preview`, `_tiktok_publications_link`, `_tiktok_studio_analytics_import_start`, `_tiktok_studio_analytics_report`, `_tiktok_studio_analytics_batch_start`, `_tiktok_comments_collect_start`, `_tiktok_comments_list`, `_tiktok_comment_replies_draft`, `_tiktok_comment_replies_approve`, `_tiktok_comment_replies_send` (all prefixed `lumenclip`).
- `lib/mcp/tool-access.ts` (per-workspace tool enablement) and the `mcp` settings tab stay. Tool categories shrink to `slideshows`, `collections`, `outputs`, `publishing`, `scheduling`.

## 9. Safe deletion order

Rule: delete **consumers before providers**. A deleted module may be removed only when every remaining importer is deleted in the same batch or already fixed (section 3). After every batch run `pnpm typecheck && pnpm lint`. Run `pnpm test` from batch 5 on, or earlier against a local Postgres. Also run the orphan check below.

Orphan check (run after each batch; it must print nothing). It lists deleted-module names still imported by remaining files:

```sh
rg -n --glob '!node_modules' -e '@/lib/(automation|automations|realfarm-automation|pipeline-|x-automation|linkedin-|ugc-|generated-video|rendi-|openrouter|kie-image|fal-client|elevenlabs|deepl|debate-hook|llm-slop|generation-|hook-|word-collections|tiktok-|metric-registry|postfast-analytics|postfast-metric-snapshots|product-|slideshow-(generation-engine|image-matching|plan-core|text-generation|tone-analysis|workflow-fork|oval-icons)|temp-slide-testing|usage-|video-|content-(templates|outputs|composition|output-repository)|demos|published-post-dates|internal-tools|railway/)' app components lib scripts proxy.ts
```

| Batch | Owner | Contents | Why it stays green |
|---|---|---|---|
| **1 — Inert assets** | C | Delete `browser-extension/` (19), `test/browser-extension-popup-context.test.js`, `public/downloads/*` (2), the 39 `public/docs/workflows/*` and 2 `public/docs/collections/*` images, 83 `docs/` files, 6 `mcp/*/README.md`, `data/*` (2), `hooks/.gitkeep`, the 9 `scripts-misc` scripts, the 6 matching `package.json` scripts, and `ENABLE_INTERNAL_TOOLS`, the generation, Telegram, TikTok and doc-capture vars from `.env.example`. **Move** the 21 `.otf` fonts to `assets/fonts/`; `next.config.mjs` tracing → `assets/fonts/**`. Delete `appwrite/functions/**`. | Nothing imports these (the scripts are leaves, and `appwrite/functions/*.js` are outside the `@/` graph; `tsconfig` does not include `.js`). |
| **2 — UI surfaces** | A | Delete all `app/app/{analytics,compose,testing,ugc,workflows,x-automations}`, `app/analytics-preview`, `app/debug`, `app/share/videos`, and every DELETE file under `components/` (automation-settings except the moved publish dialog, analytics, ugc, workflow-inspector, workflow-artifacts, temp, debug, docs automation/pipeline, templates, generated-video*, greenscreen, product panels, variable panel, composer, tone dialog, x-studio, fabric canvas, post-frequency graph, `ui/workflow-stage-map.tsx`). **Pulled-in crossings:** `lib/analytics-preview-data.ts`, `app/api/analytics/` (route + test import `analytics-selectors`), `app/api/compose/publish`, `app/api/publish-gates`, `lib/compose-publishing.ts` (+test), `lib/compose-validation.ts`; these import components deleted here. Do the shell surgery (section 3.1, owner A rows) and the CSS cut lines (3.3). | All cross edges from `lib/` and `app/api/` into deleted components are deleted in the same batch. |
| **3 — API routes + MCP** | B | Delete all remaining DELETE dirs under `app/api/` (automations, automation-templates, templates, word-collections, temp, jobs, debug, settings/generation-models, settings/demos, image-collections/captions, image-collections/image-actions, slideshows/analyze-tone, generated-videos, ugc-runs, public/videos, x-automations, linkedin-automations, tiktok-*, telegram, product-collections, outputs). Gut `lib/mcp/lumenclip-server.ts` (+test) and `tool-registry.ts`. Delete `lib/mcp/production-pipeline-handlers.ts` (+test), `tiktok-studio-report.ts` (+test), `lumenclip-tiktok-server.ts`. Fix route cut lines (calendar, delete-preview, postfast/integrations, slideshows/[id], image-collections test). | Routes have no importers; the MCP server is the only importer of production-pipeline-handlers and tiktok-studio-report. |
| **4 — Orphaned domain libs** | B | Delete the remaining 201 DELETE files in `lib/` (llm-generation 66 incl. `__live__/*`, automations 61 incl. `internal-tools`, video-ugc 27, analytics/tiktok 27, x/linkedin 15, product 3, telegram 2; tests included) plus `vitest.live.config.ts`. Fix lib cut lines: `slideshows.ts` (rendi), `asset-urls.ts` (+test), `realfarm-data.ts`, `post-repository.ts`, `postfast-posts.ts`. | After batches 2–3 every importer of these libs is itself in the delete set. Verify with the orphan check before deleting. |
| **5 — Backend swap** | C | Add `node-appwrite`. Reimplement `json-store`, `asset-storage`, `queue`, `results`, `output-publications`, `post-repository-store`, `calendar-summary`, `workspace-members`, `server-env`, `test-helpers`, `consolidated-records`, local-assets routes, and the public slide route on Appwrite **with unchanged exports**. Add the in-memory adapter for tests. Then delete `lib/railway/*`, `drizzle.config.ts`, `infra/railway/migrations/*`, `scripts/railway-migrate.mts`, `scripts/run-railway-function.test.ts`, `scripts/sync-function-shared.mjs`, and the `railway:db:*` scripts. New `scripts/worker.mts` + fix `railway.worker.json`. | `lib/railway/*` importers outside the seam (demos, ugc-cost, ugc-run-status, pipeline-domain-storage, telegram, public/videos) are already gone after batches 3–4. |
| **6 — Dependency prune + docs** | C | Remove the 16 packages (section 5.2), regenerate the lockfile, run `pnpm mcp:docs` (B provides the registry), rewrite AGENTS/README/DESIGN/docs. | Done last so earlier batches never need lockfile merges. |

Rendering-engine **additions** (spec schema/validation, font registry, render API, visual image-slot UI, publish dialog) happen after batch 4 (B: API/spec; A: UI). They are out of scope for this manifest.

## 10. Parallel split (3 agents, disjoint ownership)

Ownership is by path. An agent never edits a path it does not own. Cross-owner needs go through the hotspot owner listed below.

| Agent | Owns (exclusive) | Batches |
|---|---|---|
| **A — Surface/UI** | `app/**` except `app/api/**` and `app/mcp/**`; `components/**`; `proxy.ts`; `app/layout.tsx`; `app/globals.css`; `e2e/**`. Plus these crossings in batch 2 only: `lib/analytics-preview-data.ts`, `app/api/analytics/**`, `app/api/compose/**`, `app/api/publish-gates/**`, `lib/compose-publishing*.ts`, `lib/compose-validation.ts` | 2, then new UI |
| **B — Domain/API/MCP** | `app/api/**` (minus A's crossings), `app/mcp/**`, `lib/**` **except** C's backend seam list, `lib/mcp/**`, `scripts/lumenclip-mcp.mts`, `scripts/generate-mcp-docs.ts`, `mcp/**` regeneration (after C's batch-1 deletes) | 3, 4, then spec/API |
| **C — Backend/infra/docs** | Backend seam: `lib/json-store.ts`, `lib/asset-storage.ts`, `lib/queue.ts`(+test), `lib/results.ts`(+test), `lib/output-publications.ts`, `lib/post-repository-store.ts`, `lib/calendar-summary.ts`(+test), `lib/workspace-members.ts`, `lib/server-env.ts`, `lib/test-helpers.ts`, `lib/consolidated-records.ts`(+test), `lib/railway/**`, `app/api/local-assets/**`, `app/api/public/slideshows/[id]/slides/[index]/route.ts`. Plus `appwrite/**`, `appwrite.json`, `infra/**`, `assets/**`, `data/**`, `docs/**`, `public/**`, `browser-extension/**`, `test/**`, every other `scripts/*`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.env.example`, `next.config.mjs`, `vitest*.ts`, `drizzle.config.ts`, `instrumentation.ts`, `railway.worker.json`, `AGENTS.md`, `README.md`, `DESIGN.md`, and the 6 dead `mcp/*/README.md` | 1, 5, 6 |

**Shared hotspots (single owner, others request changes):**

| Hotspot | Owner | Notes |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` | C | A and B send "script/dep X now unused" notes. Prune only in batch 6. `node-appwrite` is added in batch 5. |
| `components/realfarm/navigation.tsx`, `workspace-navigation.ts`, `realfarm-workspace.tsx`, `routes/workspace-route.tsx`, `user-settings-modal.tsx` | A | Nav/view keys. |
| `lib/mcp/lumenclip-server.ts`, `lib/mcp/tool-registry.ts` | B | |
| `lib/openapi-app.ts`, `app/api/v1/[[...route]]/route.ts` | B | |
| `proxy.ts` | A | B sends the public-path list (`/api/v1/*` key auth, removed webhooks). |
| `lib/slideshows.ts`, `lib/slideshow-*.ts`, `lib/font-config.ts`, `lib/slideshow-font-family.ts` | B | C moves font files and A must not touch these; the font registry is B's. |
| `lib/results.ts` | C | B specifies the product change (slideshow-only payload). |
| `.env.example`, `next.config.mjs`, `vitest.setup.ts` | C | |
| `AGENTS.md` | C | Must happen before A's new UI work, so the obsolete run-viewer contract stops binding A. |
| `mcp/*.md` | C deletes 6 dead files in batch 1; B regenerates the rest in batch 6 | |

**Sequencing:** batches 1 (C), 2 (A) and 3 (B) can run **in parallel**. Each typechecks alone, because A owns every crossing into components. Merge into `refactor/base` in any order. Batch 4 (B) and batch 5 (C) can run in parallel after batches 2 and 3 are merged. C must not delete `lib/railway/*` until B's batch 4 is merged; until then C only rewrites the seam. Batch 6 is last. Each agent runs `git status --short` and `git diff --cached --name-status` before commits, per AGENTS.md (shared index).

## 11. Open questions for the owner

1. **Q1 Notification channel.** Telegram is removed, but it is the only reminder channel (`ReminderChannel = "none" | "telegram"`). Options: email (Resend/Postmark), in-app only, a generic webhook, or drop reminders and rely on PostFast. This decides the shape of the `send-notification` worker job.
2. **Q2 Public API/MCP auth.** Options: per-workspace API keys (hashed in Appwrite) or Clerk machine/OAuth tokens. `/mcp` uses Clerk today plus `lib/mcp/tool-access.ts`. `/api/v1/*` is Clerk-gated by `proxy.ts`, except health and openapi.
3. **Q3 Appwrite Cloud project.** Should we reuse `appwrite.json` projectId `6a503d670029246bca10` (likely the old local/self-hosted project) or create a new Cloud project? Which region? One bucket or several (uploads vs renders)?
4. **Q4 Font licensing.** Are the 21 `.otf` display fonts licensed for server-side rendering in a commercial SaaS? Otherwise ship OFL fonts only.
5. **Q5 Team/workspace.** Keep the custom `workspace_members` + invite flow (`/team-invite`, `app/api/settings/team`) or move to Clerk Organizations?
6. **Q6 Render execution.** Synchronous in the web request (today's `POST /api/slideshows`) or async via the Railway worker queue? This affects API shape (`202 + job id`), max slides per spec, and whether the worker runs on cron or continuously.
7. **Q7 MP4 export.** Is it gone for good? Removing Rendi/ffmpeg removes slideshow → video.
8. **Q8 Spec model.** Adopt the current `SlideshowSlide` shape as spec v1? Or design a layered model (`layers: [image|text|shape]`, named image slots) for the "more customizability" goal? Image-slot picking needs named slots, which don't exist today.
9. **Q9 Marketing/billing.** Rewrite `/product`, `/solutions`, `/pricing`, `/careers`, or cut to landing + legal? The settings "Billing & plans" tab exists: keep it?
10. **Q10 UI library consolidation.** Drop ag-grid (collections table view), Mantine (2 primitives), react-icons (4 files) now or later?

## 12. Risks

1. **R1 Silent breakage tsc can't see.** 11 string-URL fetches to deleted routes (section 3.2), proxy path lists, docs links and `meta.json` nav. Mitigation: add an e2e click-through of every nav item and settings tab, and grep for `"/api/` per batch.
2. **R2 The worker is already broken at HEAD.** `railway.worker.json` calls nonexistent `railway:worker:*` scripts. Deploying `refactor/base` to the Railway `worker` service fails, and production reminders are not running. Do not deploy the worker until batch 5.
3. **R3 Tests require local Postgres.** `vitest.setup.ts` throws without a localhost `DATABASE_URL`. After the swap, 79 kept test files need an in-memory store adapter; otherwise they would hit Appwrite Cloud with shared-state wipes.
4. **R4 Font loss.** Deleting `appwrite/functions/` without first moving its 21 fonts permanently removes the only display fonts.
5. **R5 Publishing UI loss.** The only slideshow publish UI is inside `automation-settings/`. If it is deleted rather than moved, publishing works only via API/MCP.
6. **R6 Appwrite data-model limits.** `results.ts` filters on JSON paths (`JsonPathFilter`); TablesDB cannot query inside `longtext` JSON. The fields filtered on (slideshow id, status, created) must be denormalized into columns. Watch attribute size limits for large specs, Clerk `owner_id` length vs `string(36)` columns in the provisioning script, and the per-request query/row limits that `listJsonArrayStore`-style "read whole table" calls assume.
7. **R7 Post-repository dual modes.** `POST_REPOSITORY_READ_MODE`/`WRITE_MODE` legacy/dual/canonical paths are still in `lib/post-repository*.ts`. On a fresh Appwrite start, pin canonical and delete the legacy branches. Otherwise the swap has to implement both table layouts.
8. **R8 Native rendering on Railway.** `canvas` (cairo/pango) + fontconfig must build and run in the Railway web image. Rendering used to run in Appwrite Functions/Windmill, so verify a Railpack build renders text with the bundled fonts before cutting over.
9. **R9 Merge conflicts on hotspots.** Mitigated by the ownership table. The riskiest file is `components/realfarm-workspace.tsx` (1,336 lines, 23 imports).
10. **R10 Lost regression coverage.** 151 test files are deleted (79 kept or rewritten). The kept render tests (`slideshow-renderer`, `slideshow-raster-renderer`, `slideshow-export`, `font-config`, `public-slideshow-assets`, `slideshow-share`) are the safety net, so spec-validation tests must be added before the spec format changes.
