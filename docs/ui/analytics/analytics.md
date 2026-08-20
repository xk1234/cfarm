---
title: Analytics
description: Compare connected-account audience, post performance, and trends from stored social analytics snapshots.
---

Route: `/app/analytics`

![Desktop analytics](../assets/screenshots/desktop-analytics.png)

![Mobile analytics](../assets/screenshots/mobile-analytics.png)

## Layout

Owner: `features/analytics/ui/analytics-view.tsx`.

Connected accounts use the PostFast profile picture as the primary identity,
with deterministic initials when no picture is available. A smaller provider
badge overlaps the avatar so the account remains the primary object and the
platform remains secondary context.

The overview header contains a 7, 30, 60, or 90 day range. Three cards show
total audience from the latest follower
snapshot for every account, total impressions from recent posts, and total
engagement from their canonical interaction totals. Each card shows data
coverage and a trend when more than one dated point is available.

Recent posts appear four at a time. A generated slideshow uses its persisted
first rendered slide as the preview, preserves the slide aspect ratio, and
shows the deck size; other formats use the provider thumbnail. Account identity,
publication date, content type, primary exposure metric, and engagement rate
remain below the media. The redundant overview Accounts table is intentionally
omitted. Mobile stacks the metric and post cards.

The report endpoint combines connected PostFast account metadata with stored
publication records, `postfast_metric_snapshots`, and
`account_follower_snapshots`. The chosen range filters stored snapshots by
capture time and publications by their published, scheduled, or updated time.
For recent slideshow publications, it also resolves persisted automation-run
output images so the UI does not substitute the caption for unavailable media.
Post totals use the latest snapshot for each integration and post pair. Missing
provider values render as unavailable instead of being converted to zero. One
snapshot shows its current value but asks for another sync before drawing a
trend.

TikTok Studio captures join the metric history with `source: "tiktok_studio"`.
Pending single-post imports and account batches are owner-scoped
`permanent_assets` rows. The server persists the parsed capture and typed
snapshot, not the raw TikTok response or signed media URLs.

The current loading layout constrains every skeleton with `min-w-0` and
`max-w-full`, hides overflow at the wrapper, and uses one column on narrow
screens. Analytics has no manual import or sync controls. No-account and
no-snapshot states direct the user to connect accounts and wait for the first
automatic refresh. If a PostFast integration refresh fails temporarily,
stored analytics remain visible with an inline warning.

## Interactions

Changing the range reloads stored report data. When the newest PostFast capture
is missing or at least 15 minutes old, Analytics requests fresh metrics for all
connected accounts in the background and reloads the report. Recent-post cards
open the per-post analytics route, where the shared interactive slideshow
viewer displays the persisted deck.

Compare platform opens an in-place platform drill-down. There the user can
select multiple accounts, choose any metric exposed for those accounts, switch
the comparison chart between absolute values and indexed growth, inspect an
account breakdown, and page through recent posts. TikTok additionally supports
a Chrome companion import for every post visible in TikTok Studio Content.
The extension scrolls the virtualized post list, deduplicates native post URLs,
and restores the user's previous Studio scroll position. LumenClip creates
missing publication records as published external TikTok posts, then captures
the private analytics reports. The user does not paste post URLs or IDs.

Opening Analytics from the companion on TikTok Studio Content carries a
`companion=tiktok-studio` intent. LumenClip opens the import dialog and starts
post discovery immediately. With one connected TikTok account the import
continues without another click. With multiple accounts, the detected TikTok
handle is matched against the account profile; the chooser remains available
when that match is ambiguous. If no TikTok account is connected, the page names
that prerequisite in an inline alert.

## MCP coverage

Partial. `lumenclip_analytics_report` reads the stored account and post report.
`lumenclip_tiktok_studio_analytics_import_start` starts a single-post Studio
capture, `lumenclip_tiktok_studio_analytics_batch_start` starts a batch, and
`lumenclip_tiktok_studio_analytics_report` reads the results. The automatic
PostFast provider refresh has no registered MCP tool.
