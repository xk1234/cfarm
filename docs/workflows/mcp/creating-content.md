---
title: "Creating content tools [Partial MCP]"
description: "Tools for discovering templates, creating and editing automations, generating drafts, reviewing outputs, and publishing with approval."
---

## Purpose

This family covers reusable content creation: slideshow templates, video
automations, AI UGC, X/Threads/LinkedIn drafts, generation, review, scheduling, and
publication evidence.

## Discovery and inspection

| Tool                         | Behavior                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `lumenclip_workspace_get`    | Return workspace defaults, limits, timezone, and enabled capabilities.               |
| `lumenclip_templates_list`   | Search catalog templates by content type, platform, format, and requirements.        |
| `lumenclip_template_get`     | Return one immutable template, editable fields, examples, and required capabilities. |
| `lumenclip_automations_list` | **Implemented:** list user-owned automations by type, status, or name.               |
| `lumenclip_automation_get`   | **Implemented:** inspect normalized schedule, collections, accounts, and last run.   |
| `lumenclip_collections_list` | **Implemented:** resolve image, video, word, and product collections.                |
| `lumenclip_accounts_list`    | **Implemented:** return safe account metadata and publishing capabilities.           |
| `lumenclip_outputs_list`     | **Implemented:** find generated drafts by automation, status, type, or date.         |

## Create and edit

| Tool                                        | Behavior                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `lumenclip_automation_create_from_template` | Clone a catalog template into a paused, user-owned automation and apply validated overrides.         |
| `lumenclip_automation_save`                 | Create a paused automation from a normalized brief when no template fits.                            |
| `lumenclip_automation_preview`              | Resolve the effective configuration and return a diff without saving or charging generation credits. |
| `lumenclip_automation_update`               | **Implemented:** pause/resume, rename, favorite, or change common schedule fields.                   |

Catalog templates are never edited in place. The agent clones a template,
previews user-specific changes, shows the diff, and updates only the user-owned
copy.

## Generate, review, and publish

| Tool                              | Behavior                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `lumenclip_automation_run`        | **Implemented:** generate one unpublished slideshow/UGC/X/Threads draft.              |
| `lumenclip_slideshow_generate`    | **Implemented:** generate an unpublished draft from an existing slideshow automation. |
| `lumenclip_ugc_estimate`          | **Implemented:** estimate itemized UGC provider cost without starting work.            |
| `lumenclip_ugc_generate`          | **Implemented:** queue an unpublished UGC draft and return a pollable operation.        |
| `lumenclip_slideshow_create`      | Create a deterministic slideshow from explicit slide text, media, and layout inputs.  |
| `lumenclip_operation_get`         | **Implemented:** inspect slideshow, UGC, social, or generated-video operation state.  |
| `lumenclip_output_publish`        | **Implemented:** publish/schedule a ready output after literal confirmation.          |
| `lumenclip_output_mark_published` | **Implemented:** attach a verified external post URL without sending content.         |

Manual generation never inherits an automatic publish date. Publishing requires
named account IDs and `confirmPublish: true`.

## Typical sequence

1. List existing automations and required collections.
2. Inspect the selected automation and its linked accounts.
3. Apply any approved safe update.
4. Generate one unpublished draft with a stable `requestId`.
5. Inspect the operation and list the output.
6. Ask for publication approval only after review.
7. Publish with `confirmPublish: true`, or record an external URL with
   `confirmLink: true`.

Template cloning/preview remains proposed. Saved non-UGC video automations can
be listed and edited but do not yet have a server-side MCP run path. LinkedIn's
current generator is stateless and therefore is not exposed as a saved
automation run.
