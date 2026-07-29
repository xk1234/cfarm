# Dashboard slideshow viewer

Parent route: `/app`

![Slideshow viewer on desktop](../../screenshots/desktop/dashboard-slideshow-viewer.png)

## Purpose

Inspect a generated slideshow, review or edit publishing copy, navigate slides, and perform output-level actions without leaving the dashboard.

## Desktop layout

- A large centered dialog preserves a narrow margin around the dashboard.
- The header contains Close slideshow, output identity/status, and actions for linking, posting, exporting, and deleting.
- The main canvas provides previous/next navigation, per-slide controls, zoom, drag/pan guidance, and slide dots.
- Publishing details below the canvas contain editable title and description/hashtags with copy controls.

## Mobile layout

The viewer becomes a near-full-screen task. Controls must wrap or move into an overflow menu while keeping Close, slide navigation, and the primary output action reachable. A clean mobile production screenshot remains pending because the current account returned no generated output during the mobile pass.

## Interactions

- Navigate by previous/next buttons or slide dots.
- Zoom and reset the current slide.
- Edit/delete the current slide where supported.
- Copy or edit publishing metadata.
- Link a published post, post to social, export PNGs, or delete the output.

## MCP support

| UI action | MCP support |
| --- | --- |
| Read output | `lumenclip_output_get` |
| Validate output | `lumenclip_output_validate` |
| Update slide text | `lumenclip_output_slide_text_update` |
| Publish output | `lumenclip_output_publish` |
| Link/mark published | `lumenclip_output_mark_published` |
| Delete output | `lumenclip_output_delete` |
| Zoom, pan, slide navigation, clipboard copy | Browser-only presentation actions |
| Export PNGs | No matching MCP tool documented in the current registry |

## Audit notes

- This is a deep, multi-purpose modal rather than a bounded confirmation task.
- The visible relationship between output metadata and the currently selected slide is useful, but the action density is high at smaller widths.
