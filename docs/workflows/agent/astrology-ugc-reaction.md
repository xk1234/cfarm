---
title: "Configure an astrology AI UGC reaction video [AI Agent via MCP]"
description: "Proposed agent workflow for a full-length React & Reveal automation and approval-gated publishing."
---

> **Proposed only.** The MCP automation schema must first expose stable video
> template and demo-asset contracts.

## Outcome

The agent configures a React & Reveal automation using one full anticipation
clip and one full demo video, generates a draft, reviews the payoff, and posts
only after approval.

## Before you start

- Provide a reaction or talking-head video collection.
- Provide an approved astrology demo/reveal video.
- Authorize publishing only if the agent may post an approved result.

## 1. Choose the two videos

1. Call `lumenclip_workspace_get` and verify video automation support.
2. Find the React & Reveal catalog template with `lumenclip_templates_list`, then
   inspect its media requirements and allowed overrides with
   `lumenclip_template_get`.
3. Find a reaction collection with `lumenclip_collections_list` and
   `media_type=video`.
4. Resolve the approved reveal asset through the proposed demo-asset contract.
   Do not substitute a random image.

## 2. Configure the automation

1. Propose a paused `react_reveal` automation:
   - Anticipation: one collection video, played in full;
   - Reveal: one selected demo video, played in full;
   - hook: a curiosity claim that the reveal answers;
   - copy: astrology framed as interpretation, not scientific fact.
2. Preview the template overrides and resolved configuration with
   `lumenclip_automation_preview`.
3. Show media IDs, durations, audio assumptions, and the field-level diff.
4. After approval, create the paused copy with
   `lumenclip_automation_create_from_template`, or use `lumenclip_automation_update`
   when adapting an existing user-owned automation.

## 3. Generate and review the draft

1. Call `lumenclip_automation_run`, then poll `lumenclip_operation_get`.
2. Inspect the output for full source playback, hook payoff, caption placement,
   audio, duration, and unpublished state.
3. Return the draft resource and warnings for human review.

## 4. Publish after approval

1. Resolve exact destination accounts with `lumenclip_accounts_list`.
2. Restate the output, account, and timing before calling
   `lumenclip_output_publish` with explicit confirmation.
3. Poll the operation and return the live URL or structured failure.

## Success check

- Both source videos play in full.
- The reveal directly pays off the anticipation hook.
- The generated result remains unpublished until approval.
- The returned publication evidence identifies the exact provider post.
