# Analytics Tab

Route key: `analytics`

Component: `AnalyticsView` in `components/realfarm-workspace.tsx`

## Functionality

Analytics renders a dashboard that can sync platform analytics from Postiz for a selected connected channel.

Main actions:

- Switch time range between 7, 30, 60, and 90 days.
- Fetch connected Postiz integrations from `/api/postiz/integrations`.
- Fetch platform analytics from `/api/postiz/analytics/platform`.
- Render the first views/impressions-style metric in the area chart.
- Show table/grid controls visually.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `PostizIntegration[]` | `/api/postiz/integrations` | Channel selector. |
| `PostizMetric[]` | `/api/postiz/analytics/platform` | Chart and table metric rows. |
| Recharts data object | Local `chartData` | Area chart input. |

## Persistence

Platform analytics is fetched from Postiz. Post-level analytics fetched through `/api/postiz/analytics/post` can be cached on `PostizPostRecord.analytics` in `data/postiz-posts.json`.

## Hardcoded / Demo Behavior

- Table/grid toggle is visual only.
- Refresh button has no handler.
- Table headers are hardcoded.
- If Postiz is not configured or no channel is connected, the tab renders an actionable empty state.
