---
title: "Configure and run an astrology Threads automation [AI Agent via MCP]"
description: "Proposed unified MCP workflow for platform-specific Threads drafts and approval-gated publishing."
---

> **Proposed only.** Uses the common Automation and Output contracts rather
> than direct Threads-specific MCP tools.

## Outcome

The agent creates or updates an astrology Threads automation, generates and
reviews an unpublished draft, and publishes a supported single post only after
approval.

## Before you start

- Connect a Threads account if publishing is required.
- Decide the audience promise, voice, pillars, and optional schedule.
- Treat reply-chain publishing as unavailable until the provider supports it.

## 1. Find the account and automation

1. Inspect workspace and account capabilities with `lumenclip_workspace_get` and
   `lumenclip_accounts_list`.
2. Search Threads templates with `lumenclip_templates_list` and inspect a candidate
   with `lumenclip_template_get`.
3. Search `lumenclip_automations_list` for `platform=threads`.

## 2. Configure the automation

1. Propose a paused Threads automation with astrology niche, audience promise,
   content pillars, Threads-compatible hook formulas, voice, optional topic,
   and schedule.
2. Resolve and validate the proposed patch with
   `lumenclip_automation_preview`, then show the field-level diff.
3. After approval, use `lumenclip_automation_create_from_template` for a new paused
   copy or `lumenclip_automation_update` for an existing user-owned automation.

## 3. Generate and review the draft

1. Call `lumenclip_automation_run` and poll `lumenclip_operation_get`.
2. Inspect the output for hook payoff, tone, unsupported claims, post count,
   and not-published state.
3. Return the draft and warnings.

## 4. Publish after approval

1. If it is a supported single post and the user approves a named account, call
   `lumenclip_output_publish` with explicit confirmation.
2. Leave multi-post Threads outputs as drafts until reply-chain publishing is
   supported.

## Success check

- The automation is saved paused unless scheduling was requested.
- The generated output is reviewed as a Threads draft.
- Multi-post drafts remain intact and unpublished when reply chains are
  unsupported.
- The account and output are explicit before any publish call.
