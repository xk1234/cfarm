---
title: "Merge collections [Proposed user workflow]"
description: "Proposed safe workflow for combining collections with previewed deduplication, caption conflict handling, and optional source cleanup."
---

> **Not currently available.** LumenClip can add and remove assets within one
> collection, but it does not expose a collection merge action yet.

## Outcome

A user combines two or more compatible collections into a new collection or an
existing destination without silently duplicating assets, losing captions, or
breaking automations that still reference the source collections.

Example: merge **Ocean Photography**, **Marine Wildlife**, and **Blue App
Backgrounds** into **Ocean App – Master Campaign Library**.

## Proposed workflow

### 1. Select source collections

1. Open **Collections** and choose one media type.
2. Select at least two collections using the collection-card selection control.
3. Click a new **Merge** bulk action.

The action should reject mixed image/video/product/variable sources unless the
destination type explicitly supports them.

### 2. Choose the destination

Choose one mode:

- **Create a new collection** — enter a unique name and optional description or
  tags.
- **Merge into an existing collection** — select a compatible destination that
  is not one of the sources being deleted.

Source collections remain intact by default.

### 3. Preview the merge

Before mutation, show a deterministic preview:

| Preview field           | Required behavior                                                  |
| ----------------------- | ------------------------------------------------------------------ |
| Source collections      | Names, IDs, owners, media type, and current item counts            |
| Unique assets           | Count added after content-hash and normalized-source deduplication |
| Duplicates              | Group exact duplicates separately from possible visual duplicates  |
| Caption conflicts       | Show competing captions and the proposed winner                    |
| Attribution             | Preserve every source URL, provider label, and import timestamp    |
| Automation dependencies | List automations that reference each source collection             |
| Final count             | Destination count before and after the merge                       |

Caption conflict defaults should prefer a user-edited caption, then the newest
high-confidence generated caption, while retaining alternates in provenance.

### 4. Confirm and run

1. Review the preview and duplicate policy.
2. Choose whether possible visual duplicates are kept for manual review.
3. Leave **Delete source collections after merge** off by default.
4. Confirm the merge.
5. Show progress as an asynchronous operation for large collections.

The operation must be idempotent: retrying the same request cannot duplicate
assets.

### 5. Review the destination

1. Open the destination collection.
2. Inspect newly added media and caption conflicts.
3. Verify linked automations still resolve their original collections.
4. Repoint automations deliberately if the new merged collection should replace
   a source.

### 6. Optional source cleanup

Only after dependency review should the UI offer source deletion. Cleanup needs:

- a second confirmation;
- the exact source names and item counts;
- a list of dependent automations;
- an option to repoint those automations to the destination;
- a short-lived undo or recoverable soft-delete window.

## Proposed failure behavior

- A partial failure leaves source collections unchanged.
- The destination either commits atomically or records which assets failed.
- Permission failures identify the inaccessible collection without exposing its
  contents.
- Unsupported media combinations fail before an operation is created.
- The operation result records source versions, destination version, duplicate
  decisions, and an audit event.

## Success check

- The preview and committed counts match.
- Exact duplicates appear once.
- Caption and attribution provenance is preserved.
- No source is deleted by default.
- Existing automations continue to resolve valid collection IDs.
