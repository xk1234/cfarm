# Creators Tab

Route key: `creators`

Component: `CreatorsView` in `components/realfarm-workspace.tsx`

## Functionality

Creators is currently a placeholder/simple creator library view. It is separate from AI UGC avatars and does not load persisted creator records.

Main actions:

- Display the creator area.
- Provide visual scaffolding for a future creator library.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| None currently required | N/A | The current view does not fetch local JSON or consume `RealFarmData` directly. |

## Persistence

No persistence and no API calls.

## Hardcoded / Demo Behavior

- The tab is mostly hardcoded UI.
- There is no creator data model in `lib/`.
- No create/edit/delete flow is wired to storage.
