---
title: Schedule
description: Review provider drafts, scheduled posts, failures, and published content.
---

Route: `/app?view=schedule`

## Layout

Owner: `components/realfarm/content-calendar/content-calendar-view.tsx`.

The page is a publication calendar. It combines locally tracked publication
records with live PostFast drafts, schedules, failures, and published posts.
Templates no longer contribute projected generation slots or recurring runs.

## Interactions

Create a future publication through Compose or from a completed output by
selecting accounts and a future provider time. Locally tracked scheduled items
with a stored content snapshot can be dragged to reschedule or opened to cancel.
These actions do not modify the source template.

## MCP coverage

`lumenclip_output_publish` can publish a completed output now or at a future
provider time. Template schedule tools are not registered because generation is
manual.
