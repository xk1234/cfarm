# Analytics Tab

Route key: `analytics`

Component: `AnalyticsView` in `components/realfarm-workspace.tsx`

## Functionality

Analytics renders a dashboard that can sync platform analytics from PostFast for a selected connected channel.

Main actions:

- Switch time range between 7, 30, 60, and 90 days.
- Fetch connected PostFast integrations from `/api/postfast/integrations`.
- Fetch platform analytics from `/api/postfast/analytics/platform`.
- Render the first views/impressions-style metric in the area chart.
- Show table/grid controls visually.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `PostFastIntegration[]` | `/api/postfast/integrations` | Channel selector. |
| `PostFastMetric[]` | `/api/postfast/analytics/platform` | Chart and table metric rows. |
| Recharts data object | Local `chartData` | Area chart input. |

## Persistence

Platform analytics is fetched from PostFast. Local post mappings can be cached on `PostFastPostRecord` in `data/postfast-posts.json`.

## Hardcoded / Demo Behavior

- Table/grid toggle is visual only.
- Refresh button has no handler.
- Table headers are hardcoded.
- If PostFast is not configured or no channel is connected, the tab renders an actionable empty state.
