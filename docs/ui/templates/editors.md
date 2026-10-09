---
title: "Template editors"
description: "Editor behavior for slideshow, video, and post templates."
---

# Template editors

## Slideshow

The existing canvas, hook/style controls, collections, and generation preview remain intact.
Schedule and account controls are not part of the template editor.

## Video

The video editor treats each segment as an ordered block. A block owns its media source, duration,
transition, and text overlays. Reordering or editing blocks changes future outputs without changing
previously generated videos.

## Text

The text editor stores niche, strategy, format, voice, benchmark, discovery, and optional image
generation settings. Generate creates a text output in draft status. Scheduling and account
selection only appear after the output enters a publish gate.
