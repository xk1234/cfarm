# Agent 1 Coordination: Swipe Page + Async Swipe Processing

## Assigned Tasks

- `todo/agent-1-swipe-page-detail-and-landing-page-qa.md`
- `todo/agent-1-async-swipe-processing.md`

## Working Agreement

- I am Agent 1.
- Treat the repo as shared with other active Codex agents.
- Before editing any listed file, re-read its current contents and check `git status --short`.
- Keep changes scoped to the files below unless implementation proves a small adjacent edit is required.
- Do not reformat unrelated code and do not revert changes made by other agents.

## Files I Am Likely To Modify

### Core Swipe Data / Processing

- `lib/swipes.ts`
  - Add durable processing state fields to `SwipeRecord`.
  - Split immediate swipe insertion from async enrichment/transcription/analysis.
  - Add update/patch helpers for existing swipe records.
  - Persist landing-page desktop/mobile screenshots.
  - Keep `listSwipes()` from hiding processing records.

- `app/api/swipes/route.ts`
  - Return an inserted swipe immediately.
  - Trigger or expose background processing flow.
  - Preserve CORS behavior used by the extension.

- `data/swipes/swipes.json`
  - May change during manual QA only.
  - Avoid committing/generated churn unless explicitly needed for fixtures.

### Swipe UI

- `components/realfarm/swipes-view.tsx`
  - Remove `+ Generate Script`.
  - Fix card action styling with standard `Button`.
  - Replace modal state with page/detail navigation handoff.
  - Fix video rendering/playback.
  - Show processing state on cards.

- `components/realfarm/swipe-detail-page.tsx`
  - Likely new component for the Inspect Swipe page.
  - Replace current modal layout.
  - Remove redundant left preview card and old right modal panel.
  - Render normalized metadata, stats, transcript, UGC analysis, and landing-page captures.

- `components/realfarm/swipe-display-model.ts`
  - Likely new helper for converting `SwipeRecord` into UI-safe display data.
  - Normalize Facebook raw text walls into structured display fields.

- `components/realfarm-workspace.tsx`
  - Avoid if possible.
  - Preferred refactor boundary: keep Swipe detail/list navigation inside `SwipesView` or a new swipe-only child component so Agent 1 does not need to edit the global workspace switchboard.
  - Only touch if the final UX truly requires a global route/view key.

- `components/realfarm/navigation.tsx`
  - Only if the detail page needs a new view key or navigation behavior.

- `components/ui/button.tsx`
  - Only if existing variants/sizes cannot support the required standard button styles.

### Extension

- `extension/background.js`
  - Make save return quickly where possible.
  - Capture source screenshot.
  - Capture landing-page desktop/mobile screenshots in background tabs.
  - Keep capture failures best-effort and non-blocking.

- `extension/content.js`
  - Improve `landingPageUrl` extraction for Facebook/TikTok/Google.
  - Preserve standardized payload shape.
  - Ensure button placement and payload building keep working across platforms.

- `extension/manifest.json`
  - Only if new permissions are required for landing-page capture or viewport handling.

### Tests

- `lib/swipes.test.ts`
  - Add tests for immediate insert, async update, processing state, and landing-page screenshot persistence.

- `components/realfarm/swipe-display-model.test.ts`
  - Likely new test for Facebook wall-of-text normalization and standardized display model output.

- `components/ui/button.test.ts`
  - Only if `Button` variants/sizes change.

### Docs / Workflows

- `docs/tabs/swipes.md`
  - Update detail-page behavior, processing states, video playback, landing-page captures.

- `docs/extension/local-cfarm-app.md`
  - Update extension save/processing behavior.

- `docs/extension/facebook-ads-library.md`
  - Update landing-page extraction/capture notes.

- `docs/extension/tiktok-creative-center.md`
  - Update async enrichment and landing-page capture notes.

- `docs/extension/google-ads.md`
  - Update destination/landing-page capture notes if touched.

- `workflows/facebook-ads-library-swipe.md`
  - Add QA checks for processing state, structured Facebook fields, and landing-page screenshots.

- `workflows/tiktok-creative-center-swipe.md`
  - Add QA checks for immediate insert, processing completion, video playback, and landing-page screenshots.

- `workflows/google-ads-swipe.md`
  - Add QA checks if Google landing-page capture is implemented in this pass.

## High-Collision Files

These are likely shared with other agents and need extra care:

- `lib/swipes.ts`
- `components/realfarm/swipes-view.tsx`
- `extension/background.js`
- `extension/content.js`
- `data/swipes/swipes.json`
- `components/realfarm-workspace.tsx` only if swipe detail cannot stay inside the Swipes workflow

## Initial QA Targets

- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm test`
- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm run typecheck -- --pretty false`
- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm run lint`
- Manual browser QA on:
  - Facebook Ads Library swipe
  - TikTok Creative Center swipe
  - Swipes list
  - Inspect Swipe detail page
  - Video playback
  - Landing-page desktop/mobile screenshots
