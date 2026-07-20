---
title: "Configure and run an astrology X automation [AI Agent via MCP]"
description: "Proposed unified MCP workflow for saving an X automation, generating a draft, and publishing a supported single post."
---

> **Proposed only.** The MCP server should use the normalized Automation model,
> not expose a separate X-specific tool family.

## Outcome

The agent creates or updates an astrology X automation, generates an
unpublished draft, validates it, and publishes a supported single post only
after approval.

## Before you start

- Connect an X account if publishing is required.
- Decide the audience, voice, content pillars, and optional schedule.
- Keep multi-post threads as drafts until reply-chain publishing is supported.

## 1. Find the account and automation

1. Call `lumenclip_workspace_get`, then `lumenclip_accounts_list` to learn X publishing
   capabilities without exposing credentials.
2. Search X templates with `lumenclip_templates_list` and inspect candidates with
   `lumenclip_template_get`.
3. Call `lumenclip_automations_list` with `platform=x` and niche terms.

## 2. Configure the automation

1. Propose or update a paused X automation with astrology niche, audience,
   content pillars, hook styles, voice, optional topic, media policy, and
   schedule.
2. Call `lumenclip_automation_preview` and show the resolved configuration,
   compatibility warnings, and field-level diff.
3. After approval, use `lumenclip_automation_create_from_template` for a new paused
   copy or `lumenclip_automation_update` for an existing user-owned automation.

## 3. Generate and review the draft

1. Run the automation with `lumenclip_automation_run` and an idempotency key.
2. Poll `lumenclip_operation_get` and inspect the output resource.
3. Validate character limits, hook payoff, unsupported claims, invented proof,
   link policy, and publication state.

## 4. Publish after approval

1. For an approved supported single post, restate the X account and timing,
   then call `lumenclip_output_publish` with `confirm_publish: true`.
2. Poll and return the live URL or structured failure.

## Success check

- The automation is saved paused unless the user requested a schedule.
- The draft fits X constraints and contains no invented proof.
- Multi-post drafts are not collapsed into a single post.
- The exact output and account are confirmed before publishing.
