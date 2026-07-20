---
title: "Configure and run an astrology LinkedIn automation [AI Agent via MCP]"
description: "Proposed MCP workflow for a persistent LinkedIn automation after the product surface and normalized contract ship."
---

> **Proposed only.** Persistent LinkedIn automations do not exist yet, so the
> agent must not call the internal stateless preview endpoint and claim it saved
> an automation.

## Outcome

Once persistent LinkedIn automation is supported, the agent will configure an
astrology strategy, generate an unpublished post, review its claims and opening,
and publish only after approval.

## Before you start

- The normalized LinkedIn automation capability must exist.
- Connect a LinkedIn account if publishing is required.
- Prepare real proof or examples before enabling proof-dependent hooks.

## 1. Check capability and account

1. Call `lumenclip_workspace_get` and verify the future normalized LinkedIn
   automation capability is enabled.
2. Resolve compatible LinkedIn accounts through `lumenclip_accounts_list`.
3. Search LinkedIn templates with `lumenclip_templates_list` and inspect their
   schemas and examples with `lumenclip_template_get`.
4. Search existing automations with `lumenclip_automations_list`.

If the capability is absent, return `CAPABILITY_UNAVAILABLE`; do not use an
internal preview endpoint and claim an automation was saved.

## 2. Configure the automation

1. Propose a paused automation containing niche, audience, pillars, voice,
   proof bank, allowed hook archetypes, schedule, account IDs, and visibility.
2. Exclude proof-dependent archetypes when the user supplied no proof.
3. Call `lumenclip_automation_preview` and show the effective configuration,
   warnings, and field-level diff.
4. After approval, call `lumenclip_automation_create_from_template` for a new paused
   copy or `lumenclip_automation_update` for an existing user-owned automation.

## 3. Generate and review the draft

1. Generate through `lumenclip_automation_run`, poll the operation, and inspect the
   output resource.
2. Validate the first 200 characters, total length, plain-text formatting,
   claims, proof usage, emoji count, and unpublished state.
3. Return the draft and warnings for review.

## 4. Publish after approval

1. Publish or schedule only with explicit account, visibility, timing, and
   `confirm_publish: true`.
2. Return the live URL and provider post ID.

## Success check

- A real persistent automation exists rather than a stateless preview.
- The post uses only supplied proof and appropriate LinkedIn formatting.
- The draft remains unpublished until the account and visibility are approved.
