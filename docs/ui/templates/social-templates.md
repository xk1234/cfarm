---
title: X and Threads templates
description: Generate, discover, and preview X and Threads drafts in a separate strategy workspace.
---

Route: `/app/social-templates`

![Desktop X automations production capture](../assets/screenshots/desktop-x-automations.png)

![Mobile X automations production capture](../assets/screenshots/mobile-x-automations.png)

![Desktop X automations empty Paper export](../assets/screenshots/desktop-automations-x-empty.png)

![Mobile X automations empty Paper export](../assets/screenshots/mobile-automations-x-empty.png)

## Layout

Owner: `app/app/social-templates/page.tsx`, with the workspace in
`components/x-automation-studio.tsx`.

This authenticated standalone route loads all saved X and Threads templates
and runs. Desktop uses a setup rail, a draft workspace, and, when the selected
section supports it, a native preview and benchmark column. The rail links
Overview and Settings. An empty workspace
offers separate New X template and New Threads template actions.

Overview contains content strategy, niche, topic, hook and voice controls, and a
trend radar with query, lookback, minimum-view, minimum-engagement, and reaction
settings. The preview renders a generated single post, thread, or article,
optional source quote and image, AI or objective benchmark checks, revision
results, factual risks, and publication outcome.

The X and Threads preview is an in-app approximation, not an embedded provider
view. Its avatar, `Template` display name, `@operator` handle, `now`
timestamp, and interaction glyphs are fixed presentation placeholders.

On mobile a sticky Setup, Draft, and Preview workflow replaces the desktop
columns. Only the active stage is shown. The standalone route also includes the
fixed mobile application navigation.

Saved engines persist in `x_automations`. Their generated runs are owner-scoped
`outputs` rows with `source_key=social_template_run`. The trend radar calls the
configured Apify actors for X, TikTok, and Instagram, then filters candidates
by lookback, views, engagement, and relevance.

## Interactions

Users create an X or Threads engine, add a niche, generate or regenerate its
strategy, choose hooks and voice, and generate a draft. Trend search returns
candidates that can seed a quote reaction or repost draft. A generated draft can
request an image, open in its native platform, or publish to selected accounts.
The platform is fixed when the engine is created. Saving can derive a missing
strategy from a non-empty niche; generation saves the engine first and moves
the mobile workflow to Preview when the run completes.

Templates only generate drafts. Account selection, scheduling, and publishing
belong to the downstream publication workflow and are not template settings.
Settings controls language, model, voice override, proof, excluded topics,
image generation, and discovery defaults.

## MCP coverage

Partial. `lumenclip_templates_list`, `lumenclip_template_get`,
`lumenclip_template_run`, and `lumenclip_template_update` cover saved X and
Threads engines, manual drafts, and common updates. `lumenclip_accounts_list` reads connected
accounts. Creating an X or Threads engine, deriving strategy, trend discovery,
and the provider connection redirect have no matching registered tools.
