---
title: Templates overview
description: Review reusable content configurations and their recent output, then open the editor.
---

Route: `/app?view=templates`

![Desktop templates production capture](../assets/screenshots/desktop-automations.png)

![Mobile templates production capture](../assets/screenshots/mobile-automations.png)

## Layout

Owner: `components/realfarm/automations-view.tsx`.

The destination places Match slideshow and New template beside the Templates
heading, followed by a responsive card grid. The grid is one column by default,
two columns from the medium breakpoint, and three columns from the large
breakpoint.

Slideshow and video cards show their type, favorite state, editable name, and
three recent-generation slots. A slideshow slot prefers the newest run's
exported thumbnail, then its rendered first slide, then its planned first slide.
A video run with a video URL renders a video thumbnail. Failed runs remain
visible, while missing slots say that there is no recent generation. A
generation blocker adds a destructive border and shows its first message.

X and Threads templates use the same grid but replace media thumbnails with up
to three recent post excerpts, platform, content type, and benchmark score. The
empty destination renders a single dashed No templates yet panel.

Railway stores these records in `templates`, `template_runs`, and
`social_templates`. Migration `0002_templates_canonical_names.sql` moves the
existing rows without rewriting their stable IDs, so schedules, publications,
and analytics joins remain intact.

## Interactions

Match slideshow opens the tone analyzer, while New template opens the template
browser. A slideshow or video template can be renamed inline, favorited, and
opened in the shared editor. Schedule lifecycle and account selection belong in
the editor rather than on the reusable-template card.

Selecting a successful preview opens the generated slideshow or video viewer.
The editor is addressable at `/app?view=templates&template=<id>`, and a specific
persisted run can be requested with `&run=<id>`.

## MCP coverage

Yes. `lumenclip_templates_list`, `lumenclip_template_get`,
`lumenclip_starter_templates_list`, and `lumenclip_outputs_list` read the
template and recent-output data. The removed `lumenclip_automation_*` names are
not advertised or registered.
