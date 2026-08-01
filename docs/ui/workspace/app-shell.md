---
title: Application shell
description: Authenticated workspace chrome and responsive content framing for CFarm.
---

Route: `/app?view=home`

![Desktop dashboard](../assets/screenshots/desktop-dashboard.png)

![Mobile dashboard](../assets/screenshots/mobile-dashboard.png)

## Layout

Owner: `components/realfarm/routes/workspace-route.tsx` loads the authenticated
workspace, and `components/realfarm-workspace.tsx` owns the chrome and active
surface.

`WorkspaceRoute` redirects a signed-out visitor to `/login`, then loads the
initial workspace data, automation templates, connected compose accounts, and
published-post dates before rendering the client workspace. The root layout
supplies the application theme, the Fumadocs provider used by documentation,
and one global top-right toaster.

The workspace fills the viewport and prevents the document itself from
scrolling. On desktop, a persistent 224px sidebar sits beside a content region
that scrolls vertically. On mobile, the sidebar is hidden, a fixed 56px branded
header occupies the top edge, and the content region adds enough top padding to
clear it. An open automation editor can use the full content region without the
standard page padding.

The active destination is initialized from the `view` query parameter. Home,
Compose, Schedule, Analytics, Collections, and Automations render inside the
same shell. An automation or run deep link adds `automation=<id>` or `run=<id>`
to the Automations workspace address.

## Interactions

Choosing a destination updates the active client surface while preserving an
addressable workspace location. Browser back and forward events restore the
destination and any selected collection represented by the current URL.

New Automation opens the template browser over the current workspace, and the
account row opens workspace settings without changing the selected
destination. Log out posts to `/api/auth/logout` and then sends the browser to
`/`. On Home, an account without a verified email also receives the shared
verification notice above the workspace.

## MCP coverage

No. Session redirects, workspace navigation, settings-overlay visibility, and
sign-out have no matching registered tools. Opening a destination or overlay is
UI navigation and is not expected to have an MCP tool.
