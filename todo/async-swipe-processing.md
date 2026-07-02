# Task: Async Swipe Processing With Processing State

## Goal

When a user swipes an ad with the extension, insert a swipe record immediately, then continue transcription and analysis asynchronously. If the user reloads the Swipes tab before processing finishes, the swipe should still appear with a `processing...` state.

## Current Behavior

Checked first for TikTok Creative Center.

- The extension builds a `tiktok-creative` payload from the Top Ads card.
- `background.js` waits for optional TikTok analytics enrichment before posting to `/api/swipes`.
- `/api/swipes` calls `createSwipe()`.
- `createSwipe()` waits for screenshot save, media save, and `analyzeSwipe()`.
- Only after all that does it write the record to `data/swipes/swipes.json`.
- `SwipeRecord` has no processing status field.
- `SwipesView` has only page-level statuses: `loading`, `ready`, and `error`.

Result: a user who reloads while enrichment/transcription/analysis is running will not see a processing card. The swipe only appears after the synchronous save/analyze path finishes.

## Desired Behavior

1. Insert swipe immediately with a durable processing status.
2. Show the swipe in the Swipes tab even while analysis is pending.
3. Render a visible `processing...` state on the swipe card/details.
4. Finish TikTok Creative Center analytics enrichment, transcription, and UGC analysis in the background.
5. Update the existing record when processing completes or fails.

## Suggested Data Shape

Add fields to `SwipeRecord`:

```ts
processingStatus?: "processing" | "complete" | "failed"
processingStartedAt?: string
processingCompletedAt?: string
processingError?: string
```

Optional split if useful:

```ts
analyticsStatus?: "pending" | "complete" | "failed"
analysisStatus?: "pending" | "complete" | "failed"
```

## Likely Files

- `lib/swipes.ts`
- `app/api/swipes/route.ts`
- `components/realfarm/swipes-view.tsx`
- `extension/background.js`
- `extension/content.js`
- `data/swipes/swipes.json`

## Implementation Notes

- Create an initial `SwipeRecord` before running expensive work.
- Add an update function that patches an existing swipe by ID.
- Return the inserted swipe ID immediately to the extension.
- Run enrichment/analysis after insertion.
- Avoid filtering processing records out of `listSwipes()`.
- Keep screenshot/media available as early as possible so the card has a visual preview.
- For TikTok Creative Center, decide whether analytics enrichment belongs in the extension background worker or the local app. The current enrichment happens before insertion, which blocks the desired behavior.

## Acceptance Criteria

- Swiping a TikTok Creative Center Top Ads card immediately creates a record in `data/swipes/swipes.json`.
- Reloading the Swipes tab during processing shows the new swipe.
- The card clearly says `processing...`.
- When analysis completes, the same record updates to `complete`.
- If analysis fails, the card remains visible and shows a failed or partial state.
- Existing completed swipes still render normally.
