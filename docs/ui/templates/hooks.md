---
title: Template text
description: Configure the text agent, optional hooks, variables, and slide-count range.
---

Route: `/app?view=templates&template=<id>`

## Layout

Owner: `components/realfarm/automation-settings/prompt-settings.tsx`.

Text is one of the three top-level template tabs. It contains text instructions,
sequence-planning instructions, the permitted minimum and maximum slide count,
tone, variables, and an optional hook pool. A template with no enabled hooks is
valid: the text agent creates an original topic and opening from its saved
instructions.

When hooks are present, each keeps a stable ID and enabled state. Published hooks
show their usage and are locked so historical attribution stays intact. If usage
cannot be loaded, existing rows are safety-locked and the panel offers a retry.

## Generation behavior

The text model first plans the sequence. It chooses the final number of slides
within the saved range and assigns one Editor slide-design ID to every planned
slide. It then generates the text boxes for that planned sequence. The plan can
reuse a design, and every planned slide includes a purpose so adjacent slides
develop the topic instead of repeating it.

An enabled hook supplies the topic seed when available. An exact hook supplied to
a manual run overrides the pool for that run. With no hook, the text agent uses
the template name, text instructions, and sequence instructions. All changes
autosave.

## MCP coverage

`lumenclip_template_get` returns text rules, optional hooks, slide designs, and
the most recent draft. `lumenclip_template_hooks_get`,
`lumenclip_template_hooks_update`, `lumenclip_template_hook_upsert`,
`lumenclip_template_hook_set_enabled`, and `lumenclip_template_hook_delete`
manage the optional pool. `lumenclip_template_run` and
`lumenclip_slideshow_generate` generate unpublished drafts and accept an optional
exact hook.
