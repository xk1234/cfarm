---
title: Testing facility
description: Leave LumenClip for the external LumenLab workflow testing surface.
---

Route: `/app/testing`

![Desktop testing facility](../assets/screenshots/desktop-testing.png)

![Mobile testing facility](../assets/screenshots/mobile-testing.png)

## Layout

Owner: `app/app/testing/page.tsx`.

`/app/testing` renders no local layout. It performs a server redirect to
`https://lumenlab-one.vercel.app/testing`. Testing facility does not appear in
the LumenClip desktop or mobile workspace navigation.

The captures above show the comparison form as it stood on 29 July 2026, before
the 1 August handoff to LumenLab. They are historical reference imagery, not the
shipped screen.

LumenClip mounts no testing component, so the raw TikHub environment error
flagged by the July audit has nowhere to render. Error presentation in the
destination application is outside this repository and is not asserted here.

## Interactions

Opening `/app/testing` leaves LumenClip for the LumenLab testing URL. This route
mounts no controls for choosing an automation, selecting dimensions, setting
repeats, running a sweep, or opening a result trace.

The backend experiment engine is retained. It accepts one saved slideshow
automation, a Cartesian set of hook, variable, tone, model, collection, or
content-direction variations, and 1 to 20 repeats. It previews without
persisting or publishing, and caps synchronous work at 200 cells. Each cell
returns its variant, generation plan, QA report, warnings, and error when one
occurs. The engine is reachable through MCP only; no LumenClip page mounts it.

## MCP coverage

Yes for the underlying experiment operation via
`lumenclip_automation_experiment_dimensions` and
`lumenclip_automation_experiment_run`. Following the browser redirect and
opening controls in another application are UI navigation.
