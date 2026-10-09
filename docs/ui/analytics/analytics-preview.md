---
title: Analytics preview
description: Render fixture analytics for internal visual review across supported platform variants.
---

Route: `/analytics-preview/[platform]`

## Layout

Owner: `app/analytics-preview/[platform]/page.tsx`.

This is an internal preview surface, not a user-facing analytics destination.
It is available outside production or when `ENABLE_INTERNAL_TOOLS=true`; other
requests receive a not-found response. The supported parameter values are
`overall`, each configured social provider, and the TikTok Creative and TikTok
Seller variants.

The page renders the production `AnalyticsView` without the authenticated
workspace shell, using generated account identities, artwork, publications,
metric histories, follower histories, and provider capabilities from
`lib/analytics-preview-data.ts`. The overall variant keeps one fixture account
per provider. A provider variant opens that platform's comparison view with all
of its fixture accounts selected. No workspace or PostFast data is read.

## Interactions

Account selection, metric selection, pagination, and chart-mode controls operate
against the in-memory fixtures. Sync analytics is intentionally a no-op when
preview data is supplied. Selecting a fixture post still targets the normal
`/app/analytics/posts/[id]` detail route; the preview does not persist those
fixture posts.

## MCP coverage

No. This route only renders internal fixture data and has no matching registered
operation. Opening the preview is UI navigation and is not expected to have an
MCP tool.
