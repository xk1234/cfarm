# Swipes Tab

Route key: `swipes`

Component: `SwipesView` in `components/realfarm/swipes-view.tsx`

## Functionality

Swipes shows locally saved ad swipe records. It supports browsing/filtering saved swipes and rendering attached screenshots/media when present.

Main actions:

- Load saved swipe records from the local API.
- Display captured media and swipe metadata.
- Filter/search records in UI state.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `SwipeRecord[]` | `GET /api/swipes` | Primary records shown in the tab. |
| `SwipePlatform` | `lib/swipes.ts` | Platform filter/classification. |
| `SwipeFormat` | `lib/swipes.ts` | Media format classification. |
| `metadata` / `stats` | `SwipeRecord` | Supplementary display fields. |

## Persistence

Backing file: `data/swipes/swipes.json`

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
- Some analysis fields are optional and only present if analysis ran during swipe creation.
