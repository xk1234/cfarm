---
title: "Create a study-tips slideshow from a template [AI Agent via MCP]"
description: "Proposed agent workflow for inspecting the Study Tips template, cloning it, previewing finals-specific overrides, and generating a reviewed draft."
---

> **Proposed only.** The LumenClip MCP server and template customization tools are
> not implemented yet.

## Outcome

The agent finds and inspects the **Study Tips** catalog template, previews a
finals-specific customization, creates a paused user-owned automation, generates
an unpublished draft, and returns it for review without modifying the catalog
template.

## Before you start

- Authorize `lumenclip:read`, `lumenclip:write`, and `lumenclip:generate`.
- Provide `lumenclip:publish` only if a later approved step should publish.
- Confirm the workspace exposes slideshow templates and the inherited study
  collection is available.

## 1. Find and inspect the template

1. Call `lumenclip_workspace_get` and verify template-backed slideshow generation.
2. Call `lumenclip_templates_list` with `automation_kind=slideshow` and study-related
   terms.
3. Resolve the exact **Study Tips** template with `lumenclip_template_get`.
4. Inspect its version, examples, hooks, collection IDs, slide structure,
   required capabilities, and `allowed_overrides_schema`.

## 2. Prepare the finals customization

Propose overrides that:

- rename the owned automation to **Finals Study Tips**;
- keep the inherited study collection and six-slide list structure;
- replace broad hooks with finals, active-recall, revision-plan, and study-reset
  hooks;
- preserve lowercase text and the two-level heading/explanation hierarchy;
- remove grade guarantees, invented statistics, and vague motivation;
- keep the new automation paused.

## 3. Preview the resolved automation

1. Call `lumenclip_automation_preview` with the template ID/version and overrides.
2. Validate the effective hooks, text directions, collection compatibility,
   slide count, style, and publishing policy.
3. Show the user the template-to-copy field diff and all warnings.
4. Do not create the automation until the user approves the resolved diff.

## 4. Create the user-owned copy

1. Call `lumenclip_automation_create_from_template` with the approved overrides and
   an idempotency key.
2. Read the returned automation resource and verify:
   - `status=paused`;
   - source template ID and version are recorded;
   - the catalog template resource is unchanged;
   - the owned automation contains the approved overrides.

## 5. Generate and review the draft

1. Call `lumenclip_automation_run` with a new idempotency key.
2. Poll `lumenclip_operation_get` until success or failure.
3. Read the output resource and validate hook payoff, numbering, advice,
   lowercase style, media relevance, caption, hashtags, and publication state.
4. Return the draft URI and warnings to the user.

## 6. Publish only after separate approval

If the user later asks to publish, resolve exact accounts with
`lumenclip_accounts_list`, restate the output and destinations, and call
`lumenclip_output_publish` only with `confirm_publish: true`.

## Success check

- The agent inspected a versioned template rather than guessing its structure.
- A preview diff was approved before mutation.
- The catalog template remained immutable.
- The new automation is user-owned and paused.
- The manual run is unpublished and unscheduled.
- Any later publishing action requires separate explicit approval.
