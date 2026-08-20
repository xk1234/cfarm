---
title: Post analytics
description: Inspect one social post's stored metrics, history, source details, and platform-specific measurements.
---

Route: `/app/analytics/posts/[id]`

## Layout

Owner: `features/analytics/ui/post-analytics-page.tsx`.

This authenticated standalone page loads the publication identified by `id`,
its dated metric snapshots, the connected account, and any source automation
run. The header only returns to `/app/analytics`; data-ingestion controls
do not compete with the report. The lead card shows content type, platform,
publication date, account, last capture time, live-post link, and the shared
interactive slideshow viewer when rendered slides exist. Other formats retain
their thumbnail or text fallback.

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

PostFast refreshes automatically when the newest provider capture is at least
15 minutes old. Metric buttons change the performance curve, and Open live post
opens the provider URL in a new tab. TikTok Studio capture and comment drafting
belong to the extension rather than this page.

The companion's **Load comments** action uses the native TikTok ID from the
open `/video/` or `/photo/` URL. Its existing device credential resolves that
ID against published or manually linked posts and starts collection directly.
It does not navigate through Analytics or require a per-post web connection.

## MCP coverage

Partial. `lumenclip_analytics_report` returns stored per-post analytics entries.
`lumenclip_tiktok_studio_analytics_import_start` and
`lumenclip_tiktok_studio_analytics_report` cover the linked Studio capture, and
`lumenclip_tiktok_comments_collect_start` covers agent-initiated comment
collection. The normal UI refreshes PostFast automatically.
