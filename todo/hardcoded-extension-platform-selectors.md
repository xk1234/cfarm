# Hardcoded Extension Platform Selectors

## Problem
The browser extension has platform detection, DOM selectors, matching heuristics, and metric parsing hardcoded in large arrays inside `extension/content.js` and `extension/background.js`. This makes platform fixes risky and hard to QA per platform.

## Found examples
- `extension/content.js`
  - platform selector arrays and candidate rules for Meta/TikTok/X/Tumblr capture.
  - swipe button placement/selectors.
- `extension/background.js`
  - URL/media normalization patterns and metric parsing pairs.
- `extension/content.test.ts`
  - tests encode specific TikTok Creative Center and X/Twitter URL shapes.

## Implementation target
- Extract platform adapters into separate modules/configs:
  - `meta`
  - `tiktokCreativeCenter`
  - `tiktokVideo`
  - `xTwitter`
  - `tumblr`
- Each adapter should define URL matching, card/video selectors, media extraction, CTA placement, and normalization rules.
- Keep one workflow/test per platform.

## Acceptance criteria
- Adding or fixing a platform does not require editing one large content script.
- Each platform adapter has tests for button placement and normalized swipe output.
- TikTok Creative Center selector changes can be updated without affecting Meta/X/Tumblr.
