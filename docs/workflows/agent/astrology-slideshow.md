---
title: "Generate and publish an astrology slideshow [AI Agent via MCP]"
description: "Proposed agent workflow for selecting media, saving an automation, generating a draft, and publishing only after approval."
---

> **Proposed only.** Requires `lumenclip:read`, `lumenclip:write`, and
> `lumenclip:generate`; publishing additionally requires `lumenclip:publish`.

## Outcome

The agent finds suitable astrology media, creates or reuses a slideshow
automation, generates an unpublished draft, reviews every slide, and publishes
only after the user approves an exact account and output.

## Before you start

- Authorize read, write, and generation scopes.
- Provide publishing scope only if the agent should publish after review.
- Have a captioned astrology image collection with at least seven vertical
  images.

## 1. Find the template, automation, and media

1. Call `lumenclip_workspace_get` and verify slideshow generation is available.
2. Search `lumenclip_templates_list` for slideshow templates, then inspect likely
   candidates with `lumenclip_template_get`, including their examples and allowed
   overrides.
3. Find image collections with `lumenclip_collections_list` using astrology terms
   and `minimum_item_count=7`.
4. Inspect captions and aspect ratios; reject collections that do not support
   the topic.
5. Search `lumenclip_automations_list` for a compatible user-owned astrology
   slideshow.

## 2. Configure the automation

1. Propose these changes to an existing automation or as overrides to the chosen
   catalog template:
   - niche: astrology education for beginners;
   - seven slides;
   - qualified informational content direction;
   - selected collection ID;
   - several reusable hooks;
   - paused status.
2. If creating an automation, call `lumenclip_automation_create_from_template` with
   the template ID/version, overrides, and an idempotency key. Use
   `lumenclip_automation_save` only when no catalog template fits.
3. If editing an existing automation, call
   `lumenclip_automation_preview`, show the resolved configuration and
   field-level diff, then call `lumenclip_automation_update` after approval.

## 3. Generate an unpublished draft

1. Call `lumenclip_automation_run`. A manual run must be unpublished and
   unscheduled even when the automation is live.
2. Poll `lumenclip_operation_get` until success or failure.

## 4. Review the result

1. Read `lumenclip://outputs/{id}` and validate all slide text, collection matches,
   title, caption, hashtags, and publication state.
2. Present the draft resource URI, warnings, and concise review findings.

## 5. Publish after approval

1. If the user explicitly approves publication, call `lumenclip_accounts_list`,
   resolve exact account IDs, restate destinations and timing, then call
   `lumenclip_output_publish` with `confirm_publish: true` and a new idempotency
   key.
2. Poll the publish operation and return provider IDs and release URLs.

## Success check

- The saved automation is paused unless the user requested a schedule.
- The generated draft is unpublished and has no automatic publication date.
- All seven slides use relevant images and qualified astrology language.
- A publish action occurs only for an unambiguous output, account, and explicit
  confirmation.
