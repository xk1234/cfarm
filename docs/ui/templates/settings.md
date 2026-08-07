---
title: Template settings
description: Configure generation language, video export, sound, transition, duration, and web search for an template.
---

Route: `/app?view=templates&template=<id>`

![Desktop automations settings Paper export](../assets/screenshots/desktop-automations-settings.png)

![Mobile automations settings Paper export](../assets/screenshots/mobile-automations-settings.png)

## Layout

Owner: `components/realfarm/automation-settings/general-settings.tsx` inside
`components/realfarm/automation-settings/drawer.tsx`.

The editor has exactly three top tabs: Editor, Text, and Settings. Its header
contains Back, editable template name, autosave state, duplicate, delete, and
Generate. The Settings panel uses labeled rows for generation language and AI web search. Slideshow
templates also expose Export as video. Enabling that setting activates
transition style, slide duration, and sound selection. Video templates omit
those slideshow export controls because their output is already video.

On mobile the same three tabs remain visible below the compact action header.
Settings rows stack their labels above controls.

Editor shows an ordered catalog of slide designs beside a live preview. Every
design has its own collection, visual preset, aspect ratio, image grid, overlay,
AI image-matching setting, text boxes, and text styling. Designs can be added,
duplicated, removed, and reordered. There are no Hook, Content, or CTA format
blocks.

## Interactions

Language changes generated slide text or video copy. Export as video switches
the slideshow publish output to a video file; transition, duration, and sound
then configure that export. AI web search allows the generation model to search
for current facts when it decides the output needs them.

Changes autosave. Duplicate creates a new
copy of the template schema and opens it, while Delete template removes the
selected template. Generate waits for autosave, validates the required media
inputs, and creates an unpublished draft. It never schedules another run or
publishes to an account.

## MCP coverage

Yes for the saved settings through `lumenclip_template_get` and
`lumenclip_template_schema_update`. `lumenclip_template_clone` duplicates an
template and `lumenclip_template_delete` removes one. The editor menu and
dirty-state confirmation are UI-only.
