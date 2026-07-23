---
title: "Manual TikTok publication linking"
description: "Shipped TikTok reconciliation workflow and the remaining path to broader manual publication imports."
---

> **Status: TikTok vertical slice shipped.** The in-app review screen, local
> MCP tools, recovery path, and first four production links are working as of
> 2026-07-18. The remaining roadmap item is to generalize this evidence model
> to other providers without weakening its confirmation rules.

## Outcome

When a photo slideshow was published outside LumenClip, a user can paste its
public TikTok URL into the relevant automation. LumenClip downloads the
published slides, reads their visible text, compares them with that
automation's generated runs, and shows the evidence before changing anything.

The same application service is available through the automation editor and
MCP. The UI and agent workflow cannot disagree about matching, recovery, or
publication state.

## Shipped workflow

1. Open a slideshow automation and choose **Published Posts**.
2. Paste one or more canonical TikTok `/photo/` URLs and select **Inspect
   posts**.
3. LumenClip runs `maximedupre/tiktok-slideshow-downloader` through Apify,
   groups its per-photo result rows into posts, and derives each publication
   timestamp from the TikTok post ID.
4. The first slide is transcribed and each post is compared only with
   successful runs from the selected automation. The score uses caption text,
   first-slide hook, slide count, and time proximity.
5. Review the recommended internal slideshow. Ambiguous or low-confidence
   matches are not selected automatically; recovery is shown instead.
6. Select the connected TikTok account and confirm the link. A link records
   the canonical URL, native post ID, exact publication time, account, and
   slideshow attribution.
7. If the historical output was lost during migration, recovery preserves the
   published images and transcribed text as a historical slideshow/run. Its
   hook is restored to the automation's catalog as disabled so analytics can
   attribute it without reusing it in future generation.

Existing links are idempotent. A TikTok post already attributed to a different
output returns a conflict instead of silently moving the publication.

## MCP publication-reconciliation subset

The general local MCP server includes three publication-reconciliation tools:

| Tool                                 | Effect                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `lumenclip_tiktok_import_start`      | Starts the read-only Apify import and returns an operation ID.          |
| `lumenclip_tiktok_import_preview`    | Returns OCR text, candidate scores, evidence, and existing link status. |
| `lumenclip_tiktok_publications_link` | Links or recovers reviewed posts; requires literal `confirm: true`.     |

The deployed app endpoint is `/mcp`; it is public and runs as the configured
MCP/system owner. Local stdio clients can run `pnpm mcp` with an explicit local
`LUMENCLIP_MCP_OWNER_ID`. Both transports call the same owner-scoped domain
service as the REST and UI adapters.

## Matching and recovery rules

- Never search across another user's runs or another automation.
- Never offer a failed generation as a candidate.
- Auto-recommend only a sufficiently strong, unambiguous top score.
- Treat slide-count differences as evidence, not an automatic rejection: a
  published post may intentionally omit an internal CTA slide.
- Preserve the external post as the source of truth when a run is recovered;
  do not fabricate a new generated design or text layer.
- Never publish, delete, or modify TikTok content. This workflow only records
  evidence for a post that already exists.

## Verified first import

The initial production UAT reconciled four `@horoiq` photo posts for Astrology
Informational. Three missing outputs were recovered and one surviving local
run was matched. A second MCP preview confirmed all four public URLs, local
slideshow IDs, and publication timestamps were durable in local Appwrite.

## Remaining roadmap

- Add a durable cached import operation record so an Apify operation can be
  resumed after a browser reload without retaining its ID manually.
- Show per-signal score details in the UI instead of only the combined score.
- Add a user-visible merge path when a recovered historical output is later
  restored from a backup.
- Generalize the provider adapter and evidence model to Instagram carousels
  and other supported manual publications; do not infer support from a URL
  parser alone.
- Add browser automation coverage for the authenticated review and confirm
  flow, including an intentionally ambiguous match and a duplicate conflict.

## Completion criteria for generalization

- Provider-specific importers normalize into one reviewed publication-evidence
  object.
- Every supported provider has a fixture-backed parser, a real-provider UAT,
  and an explicit capability flag in the UI and MCP.
- Import operations are resumable, owner-scoped, bounded, and observable.
- Recovery and later merge preserve publication analytics and historical hook
  attribution.
