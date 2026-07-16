# Analytics Tab

Route key: `analytics`

Component: `AnalyticsView` in `components/realfarm/analytics/analytics-view.tsx`

## Functionality

A multi-platform analytics dashboard driven by a canonical metric registry and persisted metric snapshots. It reads a single report endpoint and can trigger a fresh sync.

- `GET /api/analytics/report?days=` (via SWR) returns the report.
- `POST /api/analytics/report` triggers a sync (`syncPostFastAnalytics`).
- The metric set is driven by `lib/metric-registry.ts` (`canonicalMetricOrder`, `metricLabel`, `providerMetricCapabilities`, `providerSupportsPostAnalytics`).
- History comes from snapshot tables, time-windowed by `since = now - days`.

Three levels (`AnalyticsLevel = overview | account | posts`): overview, per-account, and a sortable per-post table (joined with slideshow benchmarks). Day ranges `[7, 30, 60, 90]`, default 30.

Main actions:

- Switch level (overview / account / posts) and select an account.
- Filter by source type; sort the per-post table.
- Change the day range.
- Refresh — `POST /api/analytics/report` runs a real sync (this is not a no-op button).

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| Analytics report | `GET /api/analytics/report?days=` | All dashboard data. |
| `PostFastMetricSnapshot[]` | `listMetricSnapshots` (`postfast_metric_snapshots` table) | Metric history. |
| `AccountFollowerSnapshot[]` | `listFollowerSnapshots` (`account_follower_snapshots` table) | Follower history. |
| Canonical metrics | `lib/metric-registry.ts` | Metric ordering/labels/capabilities per provider. |
| Recharts `AreaChart` + `ScatterChart` | Local chart data | Trend and per-post scatter. |

## Persistence

Metric and follower history persist in the `postfast_metric_snapshots` and `account_follower_snapshots` tables; the report joins slideshow benchmarks. Snapshots are appended by the analytics sync (see the `sync-post-analytics` job, currently drained only by the local Next.js worker — see [../STATE.md](../STATE.md#5-known-gaps-stubs--half-built-features)). Appwrite is authoritative — no filesystem fallback.

## Hardcoded / Demo Behavior

- If PostFast is not configured or no channel is connected, the tab renders an actionable empty state.
- Provider capability gaps (a metric a platform doesn't report) are driven by the metric registry, not hardcoded per view.
