---
title: "Analytics Tab"
---

Route key: `analytics`

Component: `AnalyticsView` in `components/realfarm/analytics/analytics-view.tsx`

The current implementation follows this hierarchy and replaces the previous
three-mode layout.

The canonical metric definitions and detailed UX contract are in the
[Analytics overview](../analytics/overall.md), with one guide per platform.

## Page hierarchy

Analytics is one continuous overview instead of three separate
`overview | account | posts` modes:

1. Header controls: report range and Sync analytics.
2. Connected-account rail: profile-picture selectors with platform badges.
3. Three portfolio charts: Total audience, Total impressions, and Total
   engagement.
4. Recent posts across every selected platform.
5. Account performance table with Followers, Impressions, and Engagement rate.

The page defaults to all accounts. Selecting an account avatar filters the
charts and recent posts without navigating to another tab. Selecting it again,
or choosing All accounts, restores the portfolio view.

Platform names and account rows also provide a secondary “View platform
analytics” path. This opens a platform-specific drill-down on the same
Analytics route. It is not another permanent top-level tab. The complete
interaction and visualization contract is documented in
[Platform comparison](../analytics/platform-comparison.md).

## Account identity pattern

Every account is represented by the same reusable identity component:

- the PostFast `picture` is the primary profile image;
- initials are the fallback when the image is missing or fails to load;
- a much smaller provider icon overlaps the avatar at the bottom-left;
- compact selectors and recent-post headers are icon-only; the account name and
  platform appear on avatar hover, while data tables keep a visible Account
  column for scanning;
- the platform badge is decorative when the adjacent text already names the
  platform, but it still receives an accessible label in icon-only contexts;
- selected accounts have a visible ring and `aria-pressed` state.

Do not replace profile pictures with large generic platform icons. Platform is
secondary context; the account is the primary object.

## Main interactions

- Change the report window: 7, 30, 60, or 90 days; default 30.
- Sync analytics with `POST /api/analytics/report` and refresh the SWR report.
- Filter the entire overview using profile-picture account selectors.
- Open a recent post to inspect its stored detail and performance curve.
- On a linked TikTok slideshow, import the authenticated TikTok Studio
  Overview, Viewers, and Engagement metrics through the persistently connected
  Chrome companion.
- On the TikTok platform page, sync new, recent, or all linked posts in one
  sequential Chrome companion batch.
- Page through recent posts four at a time in one horizontal row.
- Page through account tables eight rows at a time.
- Select or keyboard-activate an account row to filter to that account.
- Open a platform drill-down, multi-select accounts on that platform, and
  compare any metric PostFast exposes for the selection.

## Data contract

- `GET /api/analytics/report?days=` returns integrations, post snapshots,
  follower snapshots, and provider capabilities.
- `POST /api/analytics/report` triggers `syncPostFastAnalytics`; Sync analytics
  is a real provider request rather than a cosmetic refresh.
- `POST /api/tiktok-studio-analytics` queues a single capture or account batch;
  validated captures save automatically, while `GET` polls an `importId` or
  `batchId`.
- `GET|POST /api/tiktok-studio-analytics/capture` is the bearer-token-protected
  Chrome companion manifest and intake. It is the only unauthenticated route in
  this workflow. The device credential is capture-only; pending jobs remain
  short-lived and resolve to an explicit server-side post allowlist.
- Metrics come from `lib/metric-registry.ts`.
- Post series are grouped by `integrationId + postId`, retaining the latest
  snapshot for totals.
- History is limited by `since = now - days` and is built from stored capture
  timestamps, not invented publication-date points.

## Objects used

| Object                        | Source                            | Usage                                                    |
| ----------------------------- | --------------------------------- | -------------------------------------------------------- |
| Analytics report              | `GET /api/analytics/report?days=` | Entire overview.                                         |
| `PostFastSocialIntegration[]` | Report `integrations`             | Account image, name, provider, and filter identity.      |
| `PostFastMetricSnapshot[]`    | `postfast_metric_snapshots`       | Impression, engagement, recent-post, and trend values.   |
| `AccountFollowerSnapshot[]`   | `account_follower_snapshots`      | Latest audience and audience history.                    |
| Canonical metrics             | `lib/metric-registry.ts`          | Metric normalization, labels, and provider availability. |
| Recharts `AreaChart`          | Derived report series             | The three portfolio trend charts and post detail.        |
| Recharts comparison charts    | Derived per-account series        | Platform metric comparison across selected accounts.     |

## Persistence

Metric and follower history persist in `postfast_metric_snapshots` and
`account_follower_snapshots`. Snapshots are appended by analytics sync. Appwrite
is authoritative; there is no filesystem fallback.

Linked TikTok Studio captures use the same metric snapshot series with
`source: "tiktok_studio"` and a typed `tiktokStudio` detail object. Pending
capture sessions live as owner-scoped
`permanent_assets/source_key=tiktok_studio_analytics_import` rows. Raw TikTok
responses and signed CDN URLs are not persisted. Account sync parents use
`source_key=tiktok_studio_analytics_batch`; each authorized post still has its
own import record so partial batches remain retryable.

When capture happens against the local app, the completed typed snapshot is
also sent to the protected cloud-sync route. That route uses the production MCP
owner and upserts the same deterministic snapshot ID into cloud Appwrite.
Chrome receives neither the cloud Appwrite endpoint nor an Appwrite API key.

## Required states

- Loading uses skeletons matching the account rail, three charts, post strip,
  and account table.
- No accounts directs the user to Settings.
- Connected accounts with no snapshots provide a Sync analytics action.
- Missing profile pictures fall back to deterministic initials.
- Missing provider metrics render as unavailable (`—`), never numeric zero.
- A temporarily failed PostFast integration refresh keeps stored analytics and
  shows one inline warning.
- One stored snapshot shows a current value and explains that another sync is
  required for a trend.
