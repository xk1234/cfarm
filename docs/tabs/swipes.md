# Swipes Tab

Route key: `swipes`

Component: `SwipesView` in `components/realfarm/swipes-view.tsx`

## Functionality

Swipes shows locally saved ad swipe records. It supports browsing/filtering saved swipes and rendering attached screenshots/media when present.

Main actions:

- Load saved swipe records from the local API.
- Display captured media and swipe metadata.
- Filter/search records in UI state.
- Open a page-style Inspect Swipe detail view from a saved card.
- Play captured video assets with native video controls.
- View captured mobile and desktop landing-page screenshots when present.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `SwipeRecord[]` | `GET /api/swipes` | Primary records shown in the tab. |
| `SwipePlatform` | `lib/swipes.ts` | Platform filter/classification. |
| `SwipeFormat` | `lib/swipes.ts` | Media format classification. |
| `metadata` / `stats` | `SwipeRecord` | Supplementary display fields. |
| `processingStatus` | `SwipeRecord` | Shows `processing...`, `complete`, or `failed` states while async analysis runs. |
| `landingPageMobileScreenshotPath` / `landingPageDesktopScreenshotPath` | `SwipeRecord` | Landing-page screenshots shown on the Inspect Swipe page. |

## Persistence

Appwrite `swipes` table (via `lib/json-store.ts`); working file `data/swipes/swipes.json` (filesystem fallback). Swipe media/screenshots mirror to the `misc` Storage bucket.

Assets: `data/swipes/assets`

API:

- `GET /api/swipes`
- `POST /api/swipes`
- `GET /api/swipes/assets/[file]`

`listSwipes()` filters out records without captured media, so a JSON record may not appear if it has no `screenshotPath` or usable `mediaUrl`.

## Hardcoded / Demo Behavior

- Empty-state and error copy are hardcoded.
- The swipe extension/source may send partial data; the UI depends on whatever fields are present.
- Saved media is capped and downloaded locally by `lib/swipes.ts`.
- Video analysis can complete after the initial swipe record is inserted.
- Some analysis fields are optional and only present after processing completes.
- Facebook records may include noisy raw card text; the Swipes UI normalizes that into readable display fields before rendering.
