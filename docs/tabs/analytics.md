# Analytics Tab

Route key: `analytics`

Component: `AnalyticsView` in `components/realfarm-workspace.tsx`

## Functionality

Analytics renders a dashboard shell with a daily views chart and an empty table state.

Main actions:

- Switch time range between 7, 30, 60, and 90 days.
- Render a zero-value area chart for the selected range.
- Show table/grid controls visually.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| Generated chart rows | `DateTime.now()` and selected range | Chart dates and `views: 0`. |
| Recharts data object | Local `chartData` | Area chart input. |

## Persistence

No analytics API calls and no persisted metrics.

## Hardcoded / Demo Behavior

- Views are always `0`.
- Table/grid toggle is visual only.
- Refresh button has no handler.
- Empty-state copy says no TikToks have been published from ReelFarm.
- Table headers are hardcoded.
