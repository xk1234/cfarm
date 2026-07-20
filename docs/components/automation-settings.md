---
title: Automation settings components
description: Internal structure of the shared slideshow/video editor shell and format-specific panels.
---

`AutomationSettingsDrawer` is the editor root. It owns the selected settings
page, editable schema, dirty state, save/cancel behavior, and generated output
viewer state.

The screenshot-backed product guide currently documents the
[slideshow automation editor](../automations/slideshow-automations.mdx).
[Video automations](../automations/video-automations.mdx) are marked WIP because
the same shell exists but runner and format coverage vary by template. X and
Threads use a separate social editor model.

## Editor structure

| Component                                       | Responsibility                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `AutomationSettingsDrawer`                      | Editor orchestration and persistence boundary                           |
| `AutomationSettingsNavButton`                   | Left-rail section navigation                                            |
| `SettingsPage`, `SettingsRow`, `SettingsFooter` | Shared page spacing, row alignment, and save/cancel controls            |
| `AutomationOverviewPanel`                       | Automation summary, generation actions, and recent runs                 |
| `AutomationGeneralSettingsPanel`                | Name, language, source, and general automation configuration            |
| `PromptConfigPanel`                             | Hook catalog, casing, prompt instructions, and variable badges          |
| `HookRowsEditor`                                | Single-row editing, multiline paste, enable state, and used-hook locks  |
| `HookAnalyticsPanel`                            | Publication-backed hook metrics table and empty/error/loading states    |
| `SchedulePanel` / `PostingSchedulePanel`        | Cadence, timezone, generation lead time, and auto-publish configuration |
| `SocialMediaSettingsPanel`                      | Connected accounts and provider-specific publishing settings            |

## Slideshow format system

| Component                       | Responsibility                                                 |
| ------------------------------- | -------------------------------------------------------------- |
| `AutomationFormatPanel`         | Slideshow layout, typography, media fit, and text styling      |
| `SlideshowFormatPreviewStage`   | Interactive visual preview and text-editing surface            |
| `AutomationContentFormatEditor` | Ordered hook/body/CTA formatting sections                      |
| `AutomationCtaFormatEditor`     | CTA-specific content settings                                  |
| `AutomationFormatPreviewCard`   | Compact section preview                                        |
| `AutomationFormatTextToolbar`   | Inline typography and background/highlight controls            |
| `HookRowsEditor`                | Edits stable hook items while preserving `[[VARIABLE]]` tokens |

The preview and export paths must share normalization helpers. Settings that
only affect the editor but not the renderer are misleading and should not be
added.

## Video format system

| Component                    | Responsibility                                         |
| ---------------------------- | ------------------------------------------------------ |
| `VideoAutomationFormatPanel` | High-level video format configuration                  |
| `VideoTemplateFormatPanel`   | Segment ordering and media-source selection            |
| `DemoVideoSelector`          | Selects a demo video that must play in full            |
| `VideoCopyFields`            | Caption, title, hashtag, and per-segment copy controls |
| `AutomationGenerationGrid`   | Generated output grid and empty state                  |

Video segments that select a demo or reveal video use a single full-length
asset. Slideshow-style clip-count, seconds-per-clip, and cut controls do not
belong on these segments unless the renderer actually consumes them.

## Helper modules

The directory also contains non-visual modules for normalization and tests:

- `format-helpers.ts` and `video-format-helpers.ts`
- `run-helpers.ts`
- `schedule-helpers.ts`
- `social-settings-helpers.ts`
- `types.ts`

Keep schema-to-form conversion in these helpers so save, preview, and reset
paths use the same behavior.
