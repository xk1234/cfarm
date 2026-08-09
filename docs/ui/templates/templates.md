---
title: Template browser
description: Search reusable content configurations or start from a blank template.
---

Route: `/app?view=templates`

![Desktop automation template browser production capture](../assets/screenshots/desktop-automation-template-browser.png)

![Desktop automations templates Paper export](../assets/screenshots/desktop-automations-templates.png)

![Mobile automations templates Paper export](../assets/screenshots/mobile-automations-templates.png)

## Layout

Owner: `components/realfarm/templates.tsx`.

New template opens a modal with the visible Templates title, a
search field, Slideshow, Video, and Other social media filters, a sort control,
and the matching template count. Newest, Oldest, A to Z, and Z to A sorts are
available. The modal is bounded to the viewport and its content scrolls inside
the panel. On phones it uses almost the full viewport height, keeps the type and
sort controls horizontally scrollable, and renders each template as a compact
horizontal card. Desktop uses a two-column image-led grid.

The browser initially shows ten matching templates and adds another batch of up
to ten when Show more is selected. Video also shows repository-owned starting
formats above its saved templates. Empty states distinguish an empty catalog
from a search with no matches.

## Interactions

Changing search, kind, or sort resets the visible batch to ten. Open shows the
selected template's generated examples. Create copies the template settings into
a new user-owned template and opens its editor. Each kind also offers a blank
template. Other social media provides separate New X template and New Threads
template actions.

Selecting a built-in video format opens a setup dialog for its generation
inputs. Scheduling and publishing are not template settings. Its Back action
returns to the template browser and unsaved changes are guarded.

## MCP coverage

Partial. `lumenclip_templates_list` with `visibility: "hidden"` reads the
built-in starting points through the same template contract, and
`lumenclip_template_create` creates slideshow, video, or UGC templates from a
template or blank schema. X and Threads creation in this browser has no
matching registered create tool. The MCP prefix remains unchanged for backwards
compatibility. Search, sort, example previews, and dialogs are UI-only.

## PIN Set 34A typography

The editor bundles every font package supplied for `PIN SET 34A 2022` and
offers each face in the slideshow font control. Text elements persist their own
`font` and `fontWeight`, allowing one template to combine headline,
handwritten, and script faces.

The PDF embeds subset names, while several supplied packages are intentionally
different families. The template mapping uses the closest visual match rather
than trusting a similar archive name:

| PDF role                            | Editor family        | Decision                                                                  |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| Glacial Indifference Regular / Bold | Inter                | Existing geometric sans fallback; no complete Glacial file was supplied.  |
| Jenthill Light                      | Yoriglo              | Closest connected monoline script in the supplied set.                    |
| Angelina                            | Angelina             | Exact family.                                                             |
| Hertical Sans Smooth                | Hertical Sans Smooth | Exact family and style.                                                   |
| Rumba                               | Sunset Script        | Closest loose handwritten script; Respano is a condensed display sans.    |
| Sunflower                           | Casual Human         | Closest tall, narrow hand-lettered face; Rossen is a high-contrast serif. |
| Maldina                             | Buffalo              | Closest bold brush script; Backind Maldina is a different serif family.   |
| Seattle                             | Casual Human         | Closest tall handwritten sans.                                            |
| Buffalo                             | Buffalo              | Exact family.                                                             |

Source archives remain unchanged in the owner's Drive folder. The app stores
normalized OTF copies for browser preview and native rendering; worker bundles
are generated from the same source directory so previews and exports resolve
the same font files.
