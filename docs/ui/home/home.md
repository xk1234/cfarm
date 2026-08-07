---
title: Home
description: Track posting activity, recent generated output, and reusable templates.
---

Route: `/app?view=home`

![Desktop dashboard](../assets/screenshots/desktop-dashboard.png)

![Mobile dashboard](../assets/screenshots/mobile-dashboard.png)

## Layout

Owner: `components/realfarm/home-view.tsx`.

Home begins with a 26-week posting activity grid built from linked publication
dates and explicit manual-publish dates. It shows the total published posts,
the current daily streak when one exists, and the relative posting count for
each day. Beside it, the dashboard shows the next expected scheduled post,
the number of scheduled templates, and the number of calendar items that
need action or have failed. Desktop places the graph and metric cards in two
columns. Mobile keeps the graph horizontally scrollable and stacks the metrics
in a compact grid.

Recent generated output appears below the dashboard actions. Slideshows is the
initial selection, with Videos as the alternate view. Both views paginate five
items at a time and use five columns on large screens, three at the medium
breakpoint, and two on phones. Slideshow cards show the first rendered slide
and a generation or publication label. Video cards show a playable poster,
pending state, or failure state. Shared output is marked separately. Videos
load only after Videos is selected for the first time.

Template definitions and examples are shared `permanent_assets` rows with
`source_key=automation_template` and
`source_key=automation_template_example`. Slideshow previews come from
`automation_runs`; generated videos load lazily from owner-scoped `outputs`
rows with `source_key=generated_video`.

The final section, Start from a proven workflow, displays six reusable
templates per page. Each template contains generated example covers, its name,
its slideshow or video type, and a Use action. The grid has three columns on
large screens, two at the small breakpoint, and one on phones.

## Interactions

New template opens the template browser, while View templates changes the
workspace to the template list. Selecting a successful
slideshow card opens its generated slideshow viewer. Selecting a ready video
plays or pauses it in place. An owned video can be deleted after confirmation
unless a scheduled or published record blocks deletion; shared videos cannot
be deleted here.

The output and quick-start pagers move independently. Selecting an example
cover on a template opens that example slideshow. Use creates a user-owned copy,
changes the workspace to Templates, and opens the new template for editing.

## MCP coverage

Partial. `lumenclip_automations_list`, `lumenclip_automation_templates_list`,
`lumenclip_automation_create`, `lumenclip_schedule_get`,
`lumenclip_outputs_list`, `lumenclip_output_get`,
`lumenclip_output_delete`, and `lumenclip_analytics_report` cover the main
automation, schedule, output, and publication data operations. No registered
tool returns the Home-only outstanding-action aggregate. Opening Home,
switching output tabs, paging cards, and opening viewers are UI navigation.
