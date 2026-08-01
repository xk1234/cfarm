---
title: Automation settings
description: General generation language, video export, sound, transition, duration, and web search settings.
---

Route: `/app?view=automations&automation=<id>`

![Desktop automations settings Paper export](../assets/screenshots/desktop-automations-settings.png)

![Mobile automations settings Paper export](../assets/screenshots/mobile-automations-settings.png)

## Layout

Owner: `components/realfarm/automation-settings/general-settings.tsx` inside
`components/realfarm/automation-settings/drawer.tsx`.

The desktop editor places Generate and its section navigation in a 246 pixel
left rail, with Duplicate and Delete automation at the bottom. The Settings
panel uses labeled rows for generation language and AI web search. Slideshow
automations also expose Export as video. Enabling that setting activates
transition style, slide duration, and sound selection. Video automations omit
those slideshow export controls because their output is already video.

Mobile replaces the rail with a sticky Back control, current-section menu, and
Generate action. The menu opens the same editor sections in a bottom sheet.
Settings rows stack their labels above controls, and Cancel and Save Changes
share the available width.

Opening Format replaces the desktop navigation rail with format controls and a
live preview. Slideshow controls are split into Hook, Content, and CTA sections;
video templates expose the media sources, music, segments, and text elements
their renderer supports. On mobile, slideshow formatting separates Design and
Preview into explicit views, while video controls and preview flow vertically.

## Interactions

Language changes generated slide text or video copy. Export as video switches
the slideshow publish output to a video file; transition, duration, and sound
then configure that export. AI web search allows the generation model to search
for current facts when it decides the output needs them.

Settings remain a local draft until Save Changes persists the complete schema
and returns to Overview. Cancel discards the draft. Leaving with an unsaved name
or schema change enters the dirty-state confirmation. Duplicate creates a new
copy of the automation schema and opens it, while Delete automation removes the
selected automation. Generate refuses to run while settings changes remain
unsaved, validates the required media inputs, and then returns to Overview with
the in-progress or completed output.

## MCP coverage

Yes for the saved settings through `lumenclip_automation_get` and
`lumenclip_automation_schema_update`. `lumenclip_automation_clone` duplicates an
automation and `lumenclip_automation_delete` removes one. The editor menu and
dirty-state confirmation are UI-only.
