---
title: UI field guide
description: Current CFarm destinations, interaction states, and shared interface rules.
---

This section documents the current CFarm interface contract. It is organized by
destination and visible interaction state rather than by source file.

Production screenshots were captured at 1440 x 900 for desktop and 390 x 844
for mobile on 29 July 2026. The remaining imagery was exported from the
LumenClip Paper design file on 1 August 2026 from boards traced against the
shipped UI. Screenshots are reference imagery, and the written behavior takes
precedence where they disagree.

## Current workspace layout contract

- `/app` is one authenticated, tabbed workspace. Its visible destination is
  addressed by the `view` query parameter rather than by a route per
  destination.
- The six workspace destinations are Home, Compose, Schedule, Analytics,
  Collections, and Automations. Their query values are `home`, `compose`,
  `schedule`, `analytics`, `collections`, and `automations`.
- Automation deep links keep the Automations destination selected and add
  `automation=<id>` or `run=<id>` to the workspace query.
- Collection detail at `/app/collections/[id]`, post analytics at
  `/app/analytics/posts/[id]`, the testing facility at `/app/testing`, X and
  Threads automations at `/app/x-automations`, UGC run status at
  `/app/ugc/[id]`, and analytics previews at
  `/analytics-preview/[platform]` are separately routed surfaces.
- Public, authentication, documentation, shared slideshow, legal, and system
  pages also use their own routes outside the authenticated workspace.
- In-app page and section headings stand alone. The interface does not add
  explanatory subtitles beneath them.

## Route reference

- [Browser routes](/docs/ui/routes)

## Page map

### Workspace shell

- [Application shell](/docs/ui/workspace/app-shell)
- [Navigation](/docs/ui/workspace/navigation)
- [UI primitives](/docs/ui/workspace/ui-primitives)
- [Media viewers](/docs/ui/workspace/media-viewers)

### Home

- [Home](/docs/ui/home/home)
- [Published posts](/docs/ui/home/published-posts)

### Automations

- [Automations overview](/docs/ui/automations/overview)
- [Templates](/docs/ui/automations/templates)
- [Hooks](/docs/ui/automations/hooks)
- [Hook analytics](/docs/ui/automations/hook-analytics)
- [Automation schedule](/docs/ui/automations/schedule)
- [Automation settings](/docs/ui/automations/settings)
- [Social settings](/docs/ui/automations/social-settings)
- [X automations](/docs/ui/automations/x-automations)
- [UGC video](/docs/ui/automations/ugc)

### Compose, Schedule, Analytics

- [Compose](/docs/ui/compose/compose)
- [Schedule](/docs/ui/schedule/schedule)
- [Analytics](/docs/ui/analytics/analytics)
- [Post analytics](/docs/ui/analytics/post-analytics)
- [Analytics preview](/docs/ui/analytics/analytics-preview)

### Collections and Testing

- [Collections](/docs/ui/collections/collections)
- [Collection detail](/docs/ui/collections/collection-detail)
- [Testing facility](/docs/ui/testing/testing)
- [Output trace](/docs/ui/testing/output-trace)

### Workspace settings

- [Notifications](/docs/ui/settings/notifications)
- [AI models](/docs/ui/settings/ai-models)

### Public and system

- [Landing](/docs/ui/public/landing)
- [Authentication](/docs/ui/public/auth)
- [Shared slideshow](/docs/ui/public/public-slideshow)
- [Documentation shell](/docs/ui/public/docs)
- [Legal and system](/docs/ui/public/legal)

## Reading MCP coverage

`Yes` means the underlying data operation is registered. `Partial` means some
underlying operations exist but a UI-only step remains. `No` means there is no
matching registered operation.

Opening a destination, expanding a card, and opening or closing a dialog are UI
navigation and are not expected to have MCP tools.
