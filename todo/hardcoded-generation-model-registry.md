Status: DONE — implemented in lib/realfarm-generation-model-registry.ts

# Hardcoded Generation Model Registry

## Problem
Provider/model choices are scattered across API routes, app libs, and UI model selectors. This makes model replacements brittle and increases the chance that testing center, automations, captions, swipes, and character generation drift.

## Found examples
- `lib/slideshow-text-generation.ts` hardcodes `defaultSlideshowTextModel = "google/gemini-3.1-flash-lite"`.
- `lib/openrouter-models.ts` hardcodes `featuredModelIds`.
- `app/api/characters/attributes/route.ts` hardcodes `google/gemini-2.5-flash`.
- `app/api/image-collections/captions/route.ts` hardcodes `google/gemini-2.5-flash`.
- `lib/swipes.ts` hardcodes the swipe analysis model.
- `lib/realfarm-character-ui.ts` hardcodes KIE image, edit, video, image-to-video, upscale model labels and URLs.

## Implementation target
- Create a central model registry with typed use cases:
  - slideshow text
  - temp testing center text
  - swipe analysis
  - image captioning
  - character attributes
  - character image generation/edit/upscale/video
- API routes should request models by use-case ID, not inline provider model strings.
- UI selectors should read the same registry.

## Acceptance criteria
- Replacing a model for a use case requires one config change.
- Tests assert the registry values and that routes use registry lookups.
- No route should embed provider model IDs directly except inside the registry.
