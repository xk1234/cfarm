---
title: "Configure an astrology greenscreen meme [AI Agent via MCP]"
description: "Proposed agent workflow for pairing a reusable greenscreen clip with a captioned astrology image collection."
---

> **Proposed only.** Requires stable video-automation fields in the public MCP
> automation schema.

## Outcome

The agent combines a reusable greenscreen reaction clip with captioned
astrology backgrounds, generates an unpublished meme video, checks the key and
text placement, and publishes only after approval.

## Before you start

- Provide a greenscreen video collection and a separate astrology image
  collection.
- Ensure image captions describe the subject well enough for semantic matching.
- Authorize publishing only if the agent may post after review.

## 1. Choose both collections

1. Resolve workspace capabilities with `lumenclip_workspace_get`.
2. Find and inspect the greenscreen catalog template with
   `lumenclip_templates_list` and `lumenclip_template_get`.
3. Call `lumenclip_collections_list` twice:
   - `media_type=video` for a greenscreen reaction collection;
   - `media_type=image` for at least one captioned astrology background.
4. Inspect collection resources for usable items, aspect ratios, and captions.

## 2. Configure the automation

1. Propose a paused `greenscreen_meme` automation with both collection IDs and
   a topic-specific hook set.
2. Explain that the clip is reused while the background is selected from the
   the image collection per run.
3. Call `lumenclip_automation_preview` and show the resolved collection,
   hook, media-policy, and format diff.
4. After approval, call `lumenclip_automation_create_from_template` for a new
   paused copy or `lumenclip_automation_update` for an existing user-owned
   automation.

## 3. Generate and review the draft

1. Call `lumenclip_automation_run` and poll `lumenclip_operation_get`.
2. Check chroma-key quality, subject crop, hook readability, background fit,
   licensed audio, and unpublished state.
3. Present the result URI and warnings for review.

## 4. Publish after approval

1. Resolve explicit account IDs and restate the selected output and timing.
2. Call
   `lumenclip_output_publish` with confirmation and provider-specific disclosures.
3. Return the live URL and provider post ID.

## Success check

- Both collections have the correct media type and usable assets.
- The selected background supports the generated joke.
- The key, subject crop, and hook remain readable.
- No external post is created without explicit approval.
