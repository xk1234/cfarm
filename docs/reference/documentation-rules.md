---
title: Documentation rules
description: Decide which section owns a change before writing it, and keep each section to its contract.
---

Each top-level section owns one kind of content. Put a change in exactly one of
them.

- Keep only content-output generation workflows in `docs/workflows/`. Express
  each pipeline as ordered transformations with explicit inputs, outputs,
  branches, validation, and model/provider details.
- Keep dependency ownership in `docs/libraries/`.
- Keep persisted shapes and backend contracts in `docs/data/`.
- Keep frontend architecture and product surfaces in `docs/ui/`.
- Keep scheduled execution behavior in `docs/jobs/`.

Update the relevant document with every material implementation change.

## Writing conventions

- Write in the present tense about the shipped system. Do not describe what the
  product used to do, and do not reference earlier revisions of these documents.
  A reader arriving today needs the current contract, not its history.
- Record removals as deprecation notes that lead with the current state, so a
  reader learns that something is intentionally absent rather than missing.
- Open a page by saying what the surface is, then describe how it behaves.
- Write each `description` in frontmatter as a verb-led statement of what the
  reader can do on the page. It is the page's subtitle and its card text in
  section listings.
- Refer to the product as LumenClip. `cfarm` survives only as an infrastructure
  identifier, such as the Appwrite database and project names.
- Screenshots are reference imagery. Where a capture and the written behavior
  disagree, the written behavior is correct.

## Archives

Dated audit directories such as `docs/ui-audit-2026-07-29/` and
`docs/ui-paper-audit-2026-08-01/` are historical records. They are excluded from
the documentation build in `source.config.ts` and are deliberately left in the
state they were written, including product naming that has since changed.
