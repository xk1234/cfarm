# Task: Implement AI UGC Avatar Image And Video Generation

Status: open
Created: 2026-07-02

## Finding

The AI UGC Avatars tab has partial character/headshot support, but the main image/video generator is not implemented.

## Evidence

- `components/realfarm/characters-view.tsx`
  - The selected character prompt bar has a `Generate` button.
  - Clicking `Generate` only appends an in-memory item to local `generations` state.
  - Generated cards render the selected character avatar/placeholder, not generated media.
  - Generated cards disappear on reload because they are not persisted.
  - The model menu uses `characterGenerationModels`, which currently maps only image model labels.
  - There is no video generation mode or video output path in this view.
- `components/realfarm/character-create.tsx`
  - New character creation can call `/api/characters/headshot` for a profile headshot.
  - The full-page edit modal has a `Re-render Preview` button, but it has no `onClick` generation action.
  - The `Images` and `Videos` editor tabs show empty states only.
- `app/api/characters/headshot/route.ts`
  - A Flux/KIE headshot route exists and can download a generated headshot to `data/characters/headshots`.
  - This route only creates a profile/headshot image; it does not create prompt-based scene images or videos.
- `lib/realfarm-character-ui.ts`
  - Image and video model links are hardcoded for display.
  - `videoGenerationModels` exists, but it is not wired into the generator UI.
- No API route or local DB exists for avatar image/video generation jobs, status, media assets, or history.

## Goal

Make AI UGC Avatars generate real persisted character images and videos from the selected character, prompt, reference images, assets, and selected model.

## Implementation Scope

1. Define a generated avatar asset model.
   - Include `id`, `characterId`, `type` (`image` or `video`), `status`, `prompt`, `model`, `createdAt`, `updatedAt`, `mediaUrl`, `thumbnailUrl`, `referenceAssetIds`, `sourceConfig`, and optional `error`.
   - Store records in `data/characters/generated-assets.json` or a similar local DB.
   - Store downloaded media under `data/characters/generated-assets/`.

2. Add API routes.
   - `GET /api/characters/generated-assets?characterId=...`
   - `POST /api/characters/generated-assets`
   - Optional `GET /api/characters/generated-assets/[file]` if local assets should not use the generic local-assets route.

3. Implement image generation.
   - Use selected character attributes and prompt to build a generation prompt.
   - Support selected image model labels from `imageGenerationModels`.
   - Persist a record immediately with `status: "processing"`.
   - Poll provider task status and update to `ready` or `failed`.
   - Download result media locally and expose a stable URL.

4. Implement video generation.
   - Add an explicit image/video mode in the prompt bar.
   - Wire `videoGenerationModels` into the video mode.
   - Use selected character, prompt, optional reference image, and optional source image as input.
   - Persist processing/ready/failed states the same way as images.
   - Store final video and thumbnail URLs.

5. Wire UI to persisted assets.
   - Load generated assets for the selected character.
   - Replace local `generations` state with persisted API data.
   - Show `processing`, `ready`, and `failed` cards.
   - Open generated images/videos in the existing generation modal.
   - Keep edit/upscale actions disabled or clearly unavailable until those workflows are implemented.

6. Wire character preview regeneration.
   - Connect the full-page edit modal's `Re-render Preview` button to `/api/characters/headshot`.
   - Show loading/error state.
   - Save updated `preview_url` when the user saves the character.

## Acceptance Criteria

- Clicking `Generate` in AI UGC Avatars creates a persisted generation record.
- Reloading the tab still shows previous generated image/video records.
- New generations show `processing` before media is ready.
- Completed image generations display a real generated image.
- Completed video generations display a playable video or thumbnail with a playable detail view.
- Failed generations remain visible with an error state.
- Image mode uses image generation models.
- Video mode uses video generation models.
- The character edit `Re-render Preview` button actually regenerates the character headshot.
- Reference uploads/assets are either persisted and sent to generation, or explicitly disabled until implemented.
