# Agent 3 Coordination

## Assigned Task

- No active tasks.

## Collision Status

Postiz backend/client/data/API work is implemented and the todo was deleted per the repo's closed-task convention.

The Reelfarm Chrome automation import todo was deleted per user instruction. The app-side DB/import path remains implemented; direct Chrome account extraction was the remaining blocked part.

## Working Agreement

- I am Agent 3.
- Treat the repo as shared with other active Codex agents.
- Before editing any listed file, re-read its current contents and check `git status --short`.
- Keep changes scoped to the files below unless implementation proves a small adjacent edit is required.
- Do not reformat unrelated code and do not revert changes made by other agents.
- Follow `AGENTS.md`: before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`.
- Keep `POSTIZ_API_KEY` server-only. Do not expose it through `NEXT_PUBLIC_*` env vars or client components.
- Postiz posting should default to `draft` unless the user explicitly chooses `schedule` or `now`.

## Current Agent Scopes Checked

### Agent 1

Agent 1 owns swipe processing, swipe detail UX, extension capture, and swipe docs.

Likely Agent 1 files:

- `lib/swipes.ts`
- `app/api/swipes/route.ts`
- `components/realfarm/swipes-view.tsx`
- `components/realfarm/swipe-detail-page.tsx`
- `components/realfarm/swipe-display-model.ts`
- `extension/background.js`
- `extension/content.js`
- `extension/manifest.json`
- `docs/tabs/swipes.md`
- `docs/extension/*`
- `workflows/*-swipe.md`

Agent 3 Postiz backend work does not need these files.

### Agent 2

Agent 2 owns generated video/export persistence, Greenscreen create/export, AI UGC Ads create/export, and avatar generated image/video records.

Likely Agent 2 files:

- `lib/generated-videos.ts`
- `app/api/generated-videos/route.ts`
- `data/generated-videos/exports.json`
- `components/realfarm/greenscreen-view.tsx`
- `components/realfarm/ugc-ads-view.tsx`
- `components/realfarm/characters-view.tsx`
- `components/realfarm/character-create.tsx`
- `lib/character-generated-assets.ts`
- `app/api/characters/generated-assets/route.ts`
- `data/characters/generated-assets.json`
- `docs/tabs/greenscreen-memes.md`
- `docs/tabs/ai-ugc-ads.md`
- `docs/tabs/ai-ugc-avatars.md`
- `docs/data-objects.md`

Postiz publish controls for generated Greenscreen or UGC exports should coordinate with the generated export contract.

## Safe Agent 3 First Slice

These files are non-overlapping with the current Agent 1 and Agent 2 plans:

- `lib/postiz-client.ts`
  - New server-side Postiz API wrapper.
  - Read `POSTIZ_API_KEY` and `POSTIZ_BASE_URL`.
  - Wrap integrations, connect URL, find slot, upload, create posts, list posts, platform analytics, and post analytics.
  - Normalize setup, auth, rate-limit, upload-size, and retryable errors.

- `lib/postiz-provider-settings.ts`
  - New helper for provider-specific `settings.__type` payload defaults.
  - Include TikTok and X/Twitter settings mappings first.

- `lib/postiz-posts.ts`
  - New local persistence helper for Postiz post mapping records.
  - Store local source references, Postiz post IDs, integration IDs, status, schedule date, release URL, media references, analytics cache, sync timestamps, and errors.

- `lib/postiz-client.test.ts`
  - New tests for client URL building, auth headers, request bodies, and error normalization.

- `lib/postiz-posts.test.ts`
  - New tests for local Postiz mapping persistence, status updates, and analytics cache updates.

- `data/postiz-posts.json`
  - New local JSON DB for Postiz post mappings and analytics cache.
  - Trackable JSON only; generated media remains ignored by `.gitignore`.

## Automation Import Task

No active todo remains for this task.

Low-collision starting files:

- `lib/automations.ts`
- `lib/automations.test.ts`
- `data/automations/automations.json`
- `scripts/import-reelfarm-automations.ts` or another import helper

Higher-collision files to delay until the local automation DB/import contract is defined:

- `components/realfarm-workspace.tsx`
- `components/realfarm/automations-view.tsx`
- `components/realfarm/automation-settings.tsx`
- `components/realfarm/templates.tsx`
- `lib/realfarm-automation.ts`
- `lib/realfarm-data.ts`
- `docs/tabs/automations.md`
- `docs/data-objects.md`

## Safe Postiz API Routes

These are new route folders and should not collide with other agents:

- `app/api/postiz/integrations/route.ts`
- `app/api/postiz/connect-url/route.ts`
- `app/api/postiz/find-slot/route.ts`
- `app/api/postiz/upload/route.ts`
- `app/api/postiz/posts/route.ts`
- `app/api/postiz/analytics/platform/route.ts`
- `app/api/postiz/analytics/post/route.ts`

## Medium-Collision UI Files

These can be worked on if kept independent from generated export records:

- `components/realfarm/calendar-analytics.tsx`
  - Postiz-backed schedule and analytics data.
  - No direct overlap listed by Agent 1 or Agent 2.
  - Risk: app-wide analytics behavior may depend on future generated-post mapping decisions.

- `components/realfarm/postiz-channel-selector.tsx`
  - New reusable component for connected integration/channel selection.

- `components/realfarm/postiz-status-badge.tsx`
  - New reusable status display for draft/scheduled/published/failed.

- `components/realfarm/postiz-analytics-model.ts`
  - New helper to normalize Postiz analytics into UI-safe shapes.

- `components/realfarm/postiz-analytics-model.test.ts`
  - New tests for analytics normalization.

- `docs/tabs/schedule.md`
  - Update schedule behavior from mock rows to Postiz-backed posts.

- `docs/tabs/analytics.md`
  - Update analytics behavior from mock data to Postiz-backed platform/post analytics.

## High-Collision Files To Avoid For Now

Coordinate before editing generated export surfaces:

- `components/realfarm-workspace.tsx`
- `components/realfarm/greenscreen-view.tsx`
- `components/realfarm/ugc-ads-view.tsx`
- `components/realfarm/characters-view.tsx`
- `components/realfarm/character-create.tsx`
- `lib/generated-videos.ts`
- `lib/character-generated-assets.ts`
- `app/api/generated-videos/route.ts`
- `app/api/characters/generated-assets/route.ts`
- `data/generated-videos/exports.json`
- `data/characters/generated-assets.json`
- `docs/tabs/greenscreen-memes.md`
- `docs/tabs/ai-ugc-ads.md`
- `docs/tabs/ai-ugc-avatars.md`
- `docs/data-objects.md`

Do not edit Agent 1 swipe/extension files:

- `lib/swipes.ts`
- `app/api/swipes/route.ts`
- `components/realfarm/swipes-view.tsx`
- `components/realfarm/swipe-detail-page.tsx`
- `components/realfarm/swipe-display-model.ts`
- `extension/background.js`
- `extension/content.js`
- `extension/manifest.json`
- `data/swipes/swipes.json`
- `docs/tabs/swipes.md`
- `docs/extension/*`
- `workflows/*-swipe.md`

## Implementation Order

1. Build and test the server-only Postiz client and provider settings helpers.
2. Build and test local Postiz post mapping persistence.
3. Add `/api/postiz/*` route handlers.
4. Add schedule/analytics Postiz sync UI only if it can stay inside `calendar-analytics.tsx`.
5. Coordinate before adding publish controls to Greenscreen, AI UGC Ads, or avatar generated asset cards.

## Initial QA Targets

- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm test`
- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm run typecheck -- --pretty false`
- `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm run lint`

Known current caveat: lint is already blocked by Agent 1's `components/realfarm/swipes-view.tsx` immutability error unless that agent fixes it first.
