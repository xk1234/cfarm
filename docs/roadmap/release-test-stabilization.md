---
title: "Release test stabilization"
description: "Restore the complete release verification suite without weakening its assertions."
---

> **Status: Now.** The canonical release command sequence lives in
> [Deployment checks](/docs/reference/deployment#required-pre-deploy-checks).

## Baseline

On 2026-07-17, the workflow-gap audit passed lint, typecheck, and all 35 focused
tests. The full Vitest run still reported 31 failures across 12 files. The
observed clusters were provider stubs, automation fixture drift, Appwrite test
isolation, and stale source-contract assertions.

On 2026-07-18, stale automation defaults/count assertions were corrected, a
legacy imported-tone regression was fixed, the debug-preview provider was made
deterministic, and two obsolete fixture/source tests were removed. The affected
focused set now passes 38/38. The remaining full-suite failures are 19 tests in
`lib/automation-runner.test.ts`: those fixtures still expect the removed
no-LLM fallback or mutate legacy narrative/formatting fields without updating
the canonical hook catalog. Migrate them to deterministic text-generation
doubles and explicit hook items without restoring those old product behaviors.

## Outcome

The full offline test suite is deterministic and green against the current
product contracts, so a release failure identifies a regression instead of
known background noise.

## Completion criteria

- `pnpm test` passes as a complete run, not only as selected files.
- Provider calls are replaced by deterministic test doubles at the correct
  boundary; offline tests do not depend on network access or paid services.
- Automation fixtures represent current canonical records and are updated only
  where product contracts intentionally changed.
- Appwrite-backed tests isolate and reset their state so test ordering does not
  affect results.
- Source-contract assertions describe the shipped route, component, and module
  topology rather than deleted surfaces.
- Fixes preserve meaningful assertions; failing tests are not skipped or
  loosened solely to make the suite green.
- The full required pre-deploy sequence passes: environment check, generated
  worker synchronization, lint, tests, and production build.
