# Hardcoded Automation Default Template

## Problem
The default automation template is embedded directly in `lib/realfarm-automation.ts`. It still includes placeholder content like `hook text, all lowercase` and `short supporting text, all lowercase`, plus fixed slide counts, default timing, default overlay values, and default scheduling.

## Found examples
- `lib/realfarm-automation.ts`
  - `defaultAutomationSchema(...)` defaults posting time to `11:00 AM`.
  - `defaultAutomationTemplate(...)` maps theme names to tones inline.
  - `prompt_formatting.style`, `prompt_formatting.narrative`, slide counts, text item defaults, overlay opacity, word lengths, and text positions are all hardcoded.
  - `defaultImageCollectionConfig()` defaults language, overlay, CTA, and image mode fields inline.

## Implementation target
- Move default automation template data into a versioned config/data file, e.g. `data/default-automation-template.json` or `lib/automation-template-defaults.ts`.
- Make placeholder instructions explicit as prompt directions, not user-visible/generated slide text fallbacks.
- Keep schema normalization in `lib/realfarm-automation.ts`, but load defaults from one source of truth.

## Acceptance criteria
- Creating a new automation does not persist placeholder strings as actual hook/body/CTA copy.
- Defaults can be edited without touching normalization logic.
- Tests cover default schema creation and imported template normalization.
