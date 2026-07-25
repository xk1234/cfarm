---
title: "Test coverage gaps"
description: "Untested branches and dead modules surfaced by the July 2026 test-suite audit."
---

Found while auditing the test suite for low-value tests (2026-07-25). These are
the opposite problem: code paths with no coverage at all, plus modules that are
unreachable. Nothing here was fixed — this is the backlog.

## How the audit reframed things

The audit set out to delete noise and mostly found the suite is healthy: of 151
test files, 96 needed no change. 18 files were nominated for deletion and an
adversarial verification pass overturned 14 of them. The recurring mistake was
reading "this file only tests one path" as "this file is worthless", when the
correct reading is "this file needs more cases".

The five files that were genuinely deleted, and why:

| File | Reason |
| --- | --- |
| `components/ui/button.test.ts` | Restated the CVA variant table back at itself |
| `e2e/02-daily-automation.spec.ts` | Asserted `fixtures.ts`'s own stub status codes |
| `e2e/08-library-upkeep.spec.ts` | Same; UI steps never written (`TODO(selector)`) |
| `lib/fal-client.test.ts` | Single assertion echoed the mock's own payload |
| `lib/local-automation-job-worker-config.test.ts` | Subject returns a hardcoded array and has no callers |

## Untested route guards

Four API routes are covered only on their happy path. Their own error branches —
the part the route adds over the lib function — have no test. Deleting the
duplicate-looking route tests was rejected precisely because they are the *only*
coverage of the route's dependency-injection default (the lib tests always
inject `rootDir` / `fetchImpl`; the routes never do).

| Route | Missing coverage |
| --- | --- |
| `app/api/assets/upload/route.ts` | 400 on a non-`File` body; error-wrap path |
| `app/api/image-collections/import/route.ts` | 400 on malformed payload; provider failure surfacing |
| `app/api/results/route.ts` | `limit` fallback is exercised only incidentally via `Number(null) → 0` |
| `app/api/temp/testing-center/generate/route.ts` | All four branches (404 / 400 / 503 / 500) are mocked past; only the `text: {}` boundary is asserted |

## Dead modules

Zero non-test callers. Confirmed by grep including the
`scripts/sync-function-shared.mjs` worker-sync path, which makes some `lib/`
modules reachable only as compiled `appwrite/functions/job-worker/src/*.js`.

- `lib/local-automation-job-worker-config.ts` — `localAutomationJobTypes()` returns a
  hardcoded array; nothing imports it. Safe to delete.
- `lib/ugc-avatar-videos.ts` — `getOrderedUgcAvatarVideos` had one caller, the test
  that was trimmed. Parked with the UGC pipeline.
- `createFallbackPinterestResults` (`lib/pinterest-search.ts`) — no callers.
  Contrast `createFallbackPexelsResults`, which *is* reachable from
  `app/api/pexels/search/route.ts`.

The parked UGC pipeline (`lib/fal-client.ts`, `lib/elevenlabs-tts.ts`,
`lib/ugc-rendi-compositor.ts`, `lib/ugc-video-generation.ts`) has no non-test
callers in the app, but `lib/fal-client.ts` **is** compiled into the job worker and
imported by `ugc-automation.js`. Do not treat it as dead on the app grep alone.

## Coverage removed on purpose, worth re-adding cheaply

The trim pass cut two overlapping assertions of the X/Threads preset library:
the archetype id list in `lib/x-automation.test.ts` and the count/id case in
`lib/x-post-presets.test.ts`. They duplicated each other, but removing both left
**zero** coverage of preset counts and identity — a regression that adds or drops
a preset is now silent.

The surviving `x-post-presets` cases still check cross-cutting invariants
(positive weights, unique slot keys, `maxWords >= minWords`, Threads presets
single-kind, proof formats degradable). If preset identity matters, re-add it as
one derived assertion — e.g. every archetype id is unique and resolves to a
preset — rather than a hardcoded count that must be edited on every addition.

## Tests whose name overstates what they assert

Worth fixing rather than deleting — the intent is right, the assertion is missing.

- `lib/store-read-optimizations.test.ts` — framed as "bounded Appwrite store
  access" but contains no query spy or read-count assertion, only CRUD
  round-trips. It gives false confidence about the optimization it claims to pin.
  `updateAutomationRunMetadata` merging into `run.plan` is its one unique subject.
- `lib/ugc-automation-runner.test.ts` — "skips a paid stage only when its
  checkpoint asset still exists" has no negative case; `assetExists` always
  returns true.
- `lib/x-automation-platform.test.tsx` — `xThreadsPlatformForDisplay` is tested only
  on its two early returns; the `socialIntegrations` provider inference and the
  `/threads/i` handle regex are untested.

## e2e

No specs exist. Rebuilding them needs `data-testid`s added to the elements each
journey touches — the absence of those is why the previous specs never got past
status-code assertions. See `e2e/README.md`.
