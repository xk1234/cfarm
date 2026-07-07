# Result Persistence Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Result` the canonical persisted automation output object and update the data-structure report to reflect the consolidated model.

**Architecture:** Add a `lib/results.ts` JSON store for `ResultRecord` objects in `data/results/results.json`. Keep the existing slideshow API and `SlideshowRecord` shape as compatibility adapters over `ResultRecord` so the current frontend keeps working while the storage model consolidates around Automation -> Run -> Result.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, local JSON stores.

---

### Task 1: Result Store

**Files:**
- Create: `lib/results.ts`
- Create: `lib/results.test.ts`

- [ ] Write tests for creating, listing, normalizing, and deleting `ResultRecord` rows.
- [ ] Implement the `results.json` store using `readJsonArrayStore` and `writeJsonArrayStore`.
- [ ] Verify focused result-store tests pass.

### Task 2: Slideshow Compatibility

**Files:**
- Modify: `lib/slideshows.ts`
- Modify: `lib/slideshows.test.ts`
- Modify: `app/api/slideshows/route.test.ts`

- [ ] Update slideshow tests so creates write `ResultRecord` rows and do not write new slideshow DB rows.
- [ ] Convert `ResultRecord.payload.slideshow` to the existing `SlideshowRecord` response shape.
- [ ] Keep legacy slideshow DB reads as a fallback for old local data.
- [ ] Verify slideshow-focused tests pass.

### Task 3: Automation Runs Produce Persisted Results

**Files:**
- Modify: `lib/automation-runner.ts`
- Modify: `lib/automation-runner.test.ts`
- Modify: `app/api/automations/run/route.test.ts`

- [ ] Update run tests to assert `results.json` receives a result for every successful run and no result for failed runs.
- [ ] Make the runner call the result-backed slideshow creation path with the real automation run id.
- [ ] Return persisted `ResultRecord` rows in the run response.

### Task 4: Result API and Cascade Delete

**Files:**
- Create: `app/api/results/route.ts`
- Create: `app/api/results/route.test.ts`
- Modify: `app/api/automations/route.ts`
- Modify: `app/api/automations/route.test.ts`

- [ ] Add read-only `/api/results` listing with `automationId`, `runId`, and `limit` filters.
- [ ] Delete result records and their slideshow output folders when deleting an automation.
- [ ] Keep PostFast post cleanup based on result slideshow ids.

### Task 5: Report

**Files:**
- Modify: `docs/data-structures-report.md`

- [ ] Regenerate the report from TypeScript exported types after the code migration.
- [ ] Make `ResultRecord` and `ResultSlideshowPayload` the canonical output structures in the report.
- [ ] Mark `SlideshowRecord` as a compatibility view rather than a canonical persisted domain object.
