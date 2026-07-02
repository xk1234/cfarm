# Task: Implement Greenscreen And AI UGC Video Export Workflows

Status: open
Created: 2026-07-02

## Finding

The Greenscreen Memes and AI UGC ads editors are currently preview/mock workflows, not real export workflows.

## Evidence

- `components/realfarm-workspace.tsx`
  - `createDraft()` currently returns `undefined`.
  - Both `GreenscreenMemesView` and `UGCAdsView` receive `onCreate={createDraft}`.
- `components/realfarm/greenscreen-view.tsx`
  - The preview is partially real: `ChromaKeyGreenscreenVideo` draws the selected meme video into a canvas and removes green pixels client-side.
  - The `Create` button only calls `onCreate`.
  - `My Videos (99)` renders `data.videos`, which is seeded from `data/realfarm.json`, not from generated exports.
- `components/realfarm/ugc-ads-view.tsx`
  - The editor keeps hook/text placement state locally.
  - `avatars` is hardcoded to an empty array, even though `data/realfarm.json` has `ugcAds.avatars`.
  - `demos` is hardcoded to `["None", "Add"]`, even though `data/realfarm.json` has demo options.
  - The preview is a static composition, and the `Create` button only calls `onCreate`.
- There is no app API route or lib function for rendering, saving, listing, or downloading generated video exports.

## Goal

Make both editors create real video export records and renderable media assets instead of no-op/mock entries.

## Implementation Scope

1. Define a generated video/export data model.
   - Include `id`, `type` (`greenscreen` or `ugc_ad`), `status`, `createdAt`, `title`, `caption`, `sourceConfig`, `previewUrl`, `videoUrl`, and optional `error`.
   - Store records under `data/generated-videos/` or a similar local DB path.

2. Add API routes.
   - `GET /api/generated-videos` lists generated videos.
   - `POST /api/generated-videos` creates an export job from editor config.
   - Optional `GET /api/generated-videos/assets/[file]` serves rendered video assets.

3. Implement Greenscreen export.
   - Capture selected caption, meme video, background image, text placement, and sound if applicable.
   - Render or queue a video composition from the same visual rules used by the preview.
   - Persist an export record immediately with `status: "processing"`.
   - Update to `ready` when the video file is available.

4. Implement AI UGC export.
   - Use `data.ugcAds.avatars` and `data.ugcAds.demos` instead of hardcoded empty/mock arrays.
   - Capture selected hook, avatar, demo, sound, and text placement.
   - Render or queue a video composition and persist status the same way as Greenscreen.

5. Wire UI to real exports.
   - Replace `createDraft()` no-op with calls into the generated-video API.
   - Show pending exports as `processing`.
   - Show completed exports in `VideoGrid` or a dedicated generated video list.
   - Surface failures with retry or error messaging.

## Acceptance Criteria

- Clicking `Create` in Greenscreen creates a persisted export record.
- Clicking `Create` in AI UGC creates a persisted export record.
- Reloading the page still shows the export records.
- New exports appear as `processing` before the render finishes.
- Completed exports have a playable/downloadable video URL.
- UGC avatar/demo pickers use real configured data rather than hardcoded empty arrays.
- The static `data.videos` list is no longer the source of truth for newly generated videos.
