# Agent 2 Coordination: Generated Video Exports + AI UGC Ads Export

## Assigned Tasks

- No active tasks.

## Working Agreement

- I am Agent 2.
- Treat the repo as shared with other active Codex agents.
- Before editing any listed file, re-read its current contents and check `git status --short`.
- Keep changes scoped to the files below unless implementation proves a small adjacent edit is required.
- Do not reformat unrelated code and do not revert changes made by other agents.
- Follow `AGENTS.md`: before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`.
- Binary generated media should stay out of git; use JSON metadata plus ignored local asset files until Supabase Storage is wired.

## Files I Am Likely To Modify

### Generated Video Export Data / API

- `lib/generated-videos.ts`
  - Likely new helper for generated video export records.
  - Define `GeneratedVideoExport`, create/list/update helpers, status transitions, and local file paths.
  - Persist metadata under `data/generated-videos/exports.json` or a similar JSON DB.

- `app/api/generated-videos/route.ts`
  - Likely new route.
  - `GET` lists persisted generated video exports.
  - `POST` creates an export record immediately with `status: "processing"`.

- `app/api/generated-videos/assets/[file]/route.ts`
  - Optional new route only if generic `/api/local-assets` is not enough.
  - Serve local generated export media/preview files.

- `data/generated-videos/exports.json`
  - Likely new local metadata DB.
  - JSON should be trackable; generated `.mp4`, `.webm`, images, and thumbnails should remain ignored by `.gitignore`.

### Greenscreen Export UI

- `components/realfarm/greenscreen-view.tsx`
  - Replace no-op `Create` flow with export API call.
  - Capture caption, selected greenscreen meme video, background image, placement, and related config.
  - Show processing/ready/failed export records instead of relying only on seeded `data.videos`.
  - Keep the current canvas chroma-key preview behavior intact unless export wiring requires a small prop change.

- `components/realfarm-workspace.tsx`
  - Avoid if possible.
  - Preferred refactor boundary: make generated export creation/listing owned by `UGCAdsView`, `GreenscreenMemesView`, or their own workflow hooks/components instead of expanding the global `createDraft()` callback.
  - Only touch if shared workspace-level state is genuinely required.

### AI UGC Ads Export UI

- `components/realfarm/ugc-ads-view.tsx`
  - Replace no-op `Create` flow with generated-video export creation.
  - Use `data.ugcAds.avatars` and `data.ugcAds.demos` instead of hardcoded empty/mock arrays.
  - Capture hook, avatar, demo, sound, text placement, and preview config into export payload.
  - Show processing/ready/failed export records or pass them to a shared video grid.

- `lib/realfarm-data.ts`
  - Only if the `RealFarmData` type needs to expose existing `ugcAds.avatars`/`ugcAds.demos` more accurately.
  - Avoid touching if current types already support the required data.

- `lib/realfarm-data.test.ts`
  - Add/adjust tests only if `RealFarmData` type/loading behavior changes.

### UGC Avatar Image / Video Generation Data / API

- `lib/character-generated-assets.ts`
  - Likely new helper for avatar image/video generation records.
  - Define asset types, prompt/model config, status fields, local DB reads/writes, and media paths.
  - Persist metadata under `data/characters/generated-assets.json`.

- `app/api/characters/generated-assets/route.ts`
  - Likely new route.
  - `GET /api/characters/generated-assets?characterId=...` lists persisted image/video generations.
  - `POST /api/characters/generated-assets` creates image/video generation records.

- `data/characters/generated-assets.json`
  - Likely new local metadata DB.
  - JSON should be trackable; generated media files should stay ignored.

- `data/characters/generated-assets/`
  - Likely local ignored asset folder for generated images/videos/thumbnails.
  - Do not commit binary files from this folder.

### UGC Avatar UI

- `components/realfarm/characters-view.tsx`
  - Replace local-only `generations` state with persisted generated asset loading.
  - Add image/video mode control.
  - Wire image mode to image generation model list.
  - Wire video mode to video generation model list.
  - Show processing/ready/failed cards with real media when available.
  - Update generation modal to preview images/videos rather than placeholders.

- `components/realfarm/character-create.tsx`
  - Wire full-page `Re-render Preview` button to `/api/characters/headshot`.
  - Add loading/error state for preview regeneration.
  - Save updated `preview_url` with the character.
  - Keep existing new-character headshot flow intact.

- `lib/realfarm-character-ui.ts`
  - Expose generation model metadata in a shape useful for image/video mode selection.
  - Avoid changing hardcoded labels unless required for API mapping.

- `lib/characters.ts`
  - Only if character records need a generated asset relationship or helper.
  - Prefer keeping generated assets in a separate helper to avoid broad churn.

### Existing Local Asset API

- `app/api/local-assets/[...assetPath]/route.ts`
  - Only if generated video/avatar media needs additional MIME types or path handling.
  - Avoid if current route already serves generated asset paths correctly.

### Tests

- `lib/generated-videos.test.ts`
  - Likely new tests for export record creation, list ordering, updates, and status transitions.

- `lib/character-generated-assets.test.ts`
  - Likely new tests for avatar generated asset creation, filtering by character, updates, and failed states.

- `lib/realfarm-data.test.ts`
  - Only if UGC ad avatar/demo data loading changes.

- `components/ui/button.test.ts`
  - Should not be touched unless button variants unexpectedly need changes.

### Docs / Tasks

- `docs/tabs/greenscreen-memes.md`
  - Update from mock/no-op export behavior to persisted generated export behavior.

- `docs/tabs/ai-ugc-ads.md`
  - Update UGC avatar/demo data usage and generated export behavior.

- `docs/tabs/ai-ugc-avatars.md`
  - Update generated image/video persistence, status states, and headshot regeneration behavior.

- `docs/data-objects.md`
  - Add generated video export and character generated asset objects.

- No completed Agent 2 todo docs remain.

## High-Collision Files

These are likely shared with other agents and need extra care:

- `components/realfarm-workspace.tsx`
  - Avoid through workflow-local ownership where possible.
  - Agent 1 should keep swipe detail state inside the Swipes workflow unless a global view key is unavoidable.
  - Agent 2 should keep generated export state inside the generated media workflows unless workspace-level orchestration is unavoidable.

- `components/realfarm/ugc-ads-view.tsx`
  - Possible overlap with export, styling, PostFast, or generated video work.

- `components/realfarm/greenscreen-view.tsx`
  - Possible overlap with export, styling, and generated video work.

- `components/realfarm/characters-view.tsx`
  - Possible overlap with avatar generation and UI cleanup.

- `components/realfarm/character-create.tsx`
  - Possible overlap with headshot generation and character editing work.

- `app/api/local-assets/[...assetPath]/route.ts`
  - Shared serving route for many local assets.

- `data/realfarm.json`
  - Avoid editing unless absolutely necessary; prefer new generated metadata files.

## Files I Intend To Avoid Unless Required

- `lib/swipes.ts`
- `app/api/swipes/route.ts`
- `components/realfarm/swipes-view.tsx`
- `extension/background.js`
- `extension/content.js`
- `extension/manifest.json`
- `data/swipes/swipes.json`
- `workflows/*-swipe.md`

These appear to be Agent 1's active area.

## Initial QA Targets

- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm test`
- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm run typecheck -- --pretty false`
- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm run lint`
- Manual browser QA on:
  - Greenscreen Memes create/export
  - AI UGC Ads create/export
  - AI UGC Avatars image generation
  - AI UGC Avatars video generation
  - Character edit `Re-render Preview`
  - Reload behavior for processing/ready/failed records
