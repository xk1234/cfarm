---
title: Post analytics
description: Inspect one social post's stored metrics, history, source details, and platform-specific measurements.
---

Route: `/app/analytics/posts/[id]`

## Layout

Owner: `components/realfarm/analytics/post-analytics-page.tsx`.

This authenticated standalone page loads the publication identified by `id`,
its dated metric snapshots, the connected account, and any source automation
run. The header returns to `/app?view=analytics` and provides account sync plus
TikTok-only actions when applicable. The lead card shows content type,
platform, publication date, caption, account, last capture time, live-post link,
and a thumbnail or text fallback. Slideshow and automation sources can add a
strip of rendered slides.

Four summary cards adapt to the content type. Video uses exposure, average
watch time, completion rate, and engagement rate. Slideshow uses exposure,
saves, shares, and engagement rate. Other posts use exposure, likes, comments,
and engagement rate. A selectable area chart plots available canonical metrics
across stored captures. Platform-specific numeric fields, measurement notes,
snapshot count, source, and the platform or local post ID follow below.

When a saved TikTok Studio snapshot exists, the page adds per-slide retention
and like distribution, traffic sources, viewer countries, and search discovery.
On smaller screens the lead content, preview, metric cards, and lower detail
areas stack; a standalone mobile navigation bar remains available.

## Interactions

Sync this account requests a 90 day PostFast refresh for the post's connected
account and refreshes the route. Metric buttons change the performance curve,
and Open live post opens the provider URL in a new tab. For TikTok, Import from
TikTok Studio starts a linked Chrome companion capture. Collect in extension is
available only when a platform post ID exists and sends comment collection to
the companion.

The companion's **Connect this post** action includes the post's native TikTok
ID. Both `/video/` and slideshow `/photo/` URLs are supported. Analytics
resolves the ID against published or manually linked posts,
opens the matching post analytics page, and starts collection automatically.
An inline status confirms the handoff; an unmatched video returns a specific
linking prerequisite on the Analytics page.

## MCP coverage

Partial. `lumenclip_analytics_report` returns stored per-post analytics entries.
`lumenclip_tiktok_studio_analytics_import_start` and
`lumenclip_tiktok_studio_analytics_report` cover the linked Studio capture, and
`lumenclip_tiktok_comments_collect_start` covers comment collection. The
PostFast account refresh behind Sync this account has no registered MCP tool.
