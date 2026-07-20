---
title: "Appwrite read reduction"
description: "Bound Appwrite row reads and media transfer without hiding data or weakening correctness."
---

> **Status: Now.** Completed optimizations belong in backend reference docs;
> this page retains only incomplete work and its implementation tradeoffs.

## Outcome

Routine workspace, scheduler, library, and deletion flows perform bounded,
targeted Appwrite reads. Data volume can grow without causing silently
unbounded list hydration or ever-growing active-history queries.

## Completion criteria

- Remaining `readJsonArrayStore` callers have an explicit query/limit or a
  documented reason why the category is provably bounded.
- Slideshow publication deletion uses targeted row mutations instead of the
  legacy whole-publication rewrite path.
- Remaining read-modify-write flows use single-record primitives, with the
  atomic run-slot claim kept as an explicit exception until a compare-and-set
  replacement exists.
- Old runs, outputs, publications, and jobs have an agreed retention/archive
  policy and a non-destructive restore story.
- Large output and media libraries paginate or virtualize without silently
  hiding records from search, sorting, or bulk selection.
- Collection and media data loads only when its view or picker opens, and
  server-provided initial data is not fetched again on client mount.
- Video grids use persisted posters where available, thumbnail grids use
  resized previews, and non-viewer media remains lazy-loaded.
- Before/after measurements compare Appwrite row reads and Storage egress for
  the same representative workflows.

## Guardrails

- Do not count `Query.select` as a row-read reduction; it reduces payload size,
  not billed rows.
- Do not add hard result caps that make existing records unreachable.
- Do not delete old history until retention age and restoration behavior are
  explicitly decided.

## Detailed backlog

### Broad reads and mutations

- Slideshow deletion now locates its result, run, and publication state with
  targeted reads, but deleting publication records still enters the legacy
  whole-publication rewrite path. Replace that mutation with targeted
  output-row updates.
- Audit remaining callers of `readJsonArrayStore` with no `queries` or `limit`;
  list endpoints should never silently hydrate an unbounded category.
- Replace remaining read-modify-write `withJsonArrayStore` flows with the
  existing single-record upsert/append/delete primitives. Keep the atomic run
  slot claim as an explicit exception until it has a compare-and-set
  replacement.
- Add retention/archive rules for old automation runs, outputs, publications,
  and job history so active queries do not grow forever.
- Keep list payloads on denormalized columns where possible and hydrate the
  large `data` JSON only for detail views.

### Product and media loading

- Paginate or virtualize large output and media libraries.
- Defer collection/media queries until their view or picker opens.
- Avoid fetching the same server-provided data again on client mount; use SWR
  fallback or pass the initial result through the workspace boundary.
- Consider Realtime for active generation updates only after the bounded
  polling path is measured and still proves expensive.
- Prefer persisted poster images for video grids so off-screen cards do not
  load video bytes to capture a frame.
- Add resized Appwrite image previews for thumbnail grids.
- Keep `loading=lazy` and `preload=metadata` on non-viewer media surfaces.

## Decisions with tradeoffs

- Retention/archive needs an agreed age and restore experience; deleting old
  history without those decisions would be destructive.
- Backend pagination changes how users search, sort, and bulk-select libraries;
  it needs cursor-aware UI rather than silently hiding records after page one.
- List/detail projection reduces payload size but creates two response shapes
  and requires every detail-opening path to hydrate the full record.
- SWR reuse reduces duplicate reads but needs explicit invalidation after
  writes or users can briefly see stale collections and runs.
- Realtime removes polling reads but adds a browser Appwrite client, channel
  permissions, reconnect handling, and subscription lifecycle complexity.
- Posters and resized previews reduce egress at the cost of extra derivatives,
  storage, generation work, and cache invalidation when source media changes.

## Verification

For each optimization, compare Appwrite row reads and Storage egress before and
after under the same workflow. Do not treat `Query.select` as a row-read
optimization; it reduces payload size, not rows billed.
