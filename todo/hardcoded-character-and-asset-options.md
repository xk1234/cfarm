# Hardcoded Character And Asset Options

## Problem
Character attributes, editor tabs, asset tabs, summary fields, default prompts, and generation model options are hardcoded in UI support files.

## Found examples
- `lib/realfarm-character-ui.ts`
  - `characterAttributeOptions`
  - `characterEditorTabs`
  - `characterSummaryFields`
  - `defaultCharacterPreviewUrl`
  - `defaultCharacterHeadshotPrompt`
  - image/edit/video/upscale model arrays
  - `characterImageAspectRatios`
- `components/realfarm/characters-view.tsx`
  - `assetTabs`
  - `assetCategoryByTab`
- `components/realfarm/slideshow-preview.tsx`
  - editor font, color, and size options.

## Implementation target
- Move character UI options into typed config files, separated by domain:
  - character attributes
  - character editor tabs/summary fields
  - asset tabs/categories
  - model registry
  - text editor typography/color presets
- Make defaults explicit and loadable in tests.

## Acceptance criteria
- Adding a character attribute option does not require editing component code.
- Character image/video model options use the central model registry.
- Slideshow text editor font/color/size options are reused by automation text editor where possible.
