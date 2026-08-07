---
title: Templates overview
description: Review reusable content configurations and their recent output, then open the editor.
---

Route: `/app?view=templates`

![Desktop templates production capture](../assets/screenshots/desktop-automations.png)

![Mobile templates production capture](../assets/screenshots/mobile-automations.png)

## Layout

Owner: `components/realfarm/automations-view.tsx`.

The destination places Match slideshow beside the Templates heading, followed
by Active and Hidden tabs and one responsive card grid. The grid is one column
by default, two columns from the medium breakpoint, and three columns from the
large breakpoint.

Saved and built-in templates use the same `AutomationRecord` shape. The only
catalog distinction is `hidden`: user-created templates default to `false`,
while built-in starter definitions are materialized into the owner's template
catalog with `hidden: true`. There is no separate starter-template card type.

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

Match slideshow opens the tone analyzer. Any template can be moved between
Active and Hidden, renamed inline, favorited where supported, and opened in the
same editor. A template only defines generation. Publishing a completed output
to connected accounts is a separate post-processing action.

Selecting a successful preview opens the generated slideshow or video viewer.
The editor is addressable at `/app?view=templates&template=<id>`, and a specific
persisted run can be requested with `&run=<id>`.

## MCP coverage

Yes. `lumenclip_templates_list` accepts `visibility: active | hidden | all`;
`lumenclip_template_update` mutates `hidden`; and `lumenclip_template_get` plus
`lumenclip_outputs_list` read template and recent-output data. There is no
separate starter-template tool. The removed `lumenclip_automation_*` names are
not advertised or registered.
