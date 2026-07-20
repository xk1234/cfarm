---
title: "Importing outside content tools [Partial MCP]"
description: "Tools for finding approved external media, creating and updating collections, importing assets, deduplicating content, and merging collections safely."
---

## Purpose

This family imports user-approved content from Pinterest, Pexels, HTTPS URLs,
uploads, existing outputs, or other trusted MCP resources into reusable LumenClip
collections.

## Tools

| Tool                                 | Scope                       | Behavior                                                                                                         |
| ------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `lumenclip_external_assets_search`   | `lumenclip:read`            | Search an approved source such as Pinterest or Pexels and return preview metadata without importing.             |
| `lumenclip_collection_save`          | `lumenclip:write`           | **Implemented for image/video:** create an empty collection or safely update pin state without replacing assets. |
| `lumenclip_collection_add_assets`    | `lumenclip:write`           | **Implemented:** import validated public HTTPS media into an existing image/video collection and deduplicate it. |
| `lumenclip_collection_merge_preview` | `lumenclip:read`            | Resolve source/destination versions, duplicates, caption conflicts, attribution, dependencies, and final counts. |
| `lumenclip_collection_merge`         | proposed `lumenclip:import` | Apply an approved merge preview idempotently; source deletion remains off by default.                            |
| `lumenclip_collection_delete`        | `lumenclip:write`           | Soft-delete one unreferenced collection after explicit confirmation and expected-version validation.             |
| `lumenclip_operation_get`            | `lumenclip:read`            | Poll long-running imports, caption generation, and merges.                                                       |

`lumenclip_external_assets_search` must return a short-lived selection token plus
source URL, provider label, preview URL, dimensions, MIME type, available license
metadata, and provider caption. Search results are not workspace assets until an
authorized import tool is called.

## Current HTTPS import sequence

1. List existing collections.
2. If the required image/video collection is missing, create it with
   `lumenclip_collection_save` and a stable `requestId`.
3. Present public HTTPS media URLs and captions for user approval.
4. Call `lumenclip_collection_add_assets` using the returned collection ID.
5. Inspect `added`, `duplicates`, and the updated collection summary.

External search, word/product collection mutation, output/upload resource
imports, AI captions, and per-item partial failures remain proposed.

## Merge contract

The merge tools follow the [proposed user merge workflow](/docs/workflows/merge-collections):

- exact duplicate detection uses stored content hashes;
- normalized source URLs provide a secondary duplicate signal;
- possible visual duplicates remain reviewable rather than auto-deleted;
- user-edited captions win conflicts while all alternates retain provenance;
- source collections remain intact unless a separate confirmed cleanup runs;
- dependent automations are listed before any source deletion or repointing.

## Import safety

- Allow only trusted MCP resource URIs, existing LumenClip output URIs,
  validated uploads, or HTTPS URLs.
- Apply SSRF protection, redirect limits, MIME sniffing, size limits, malware
  scanning where available, and content hashing.
- Never copy browser cookies or provider credentials into MCP arguments.
- Preserve source attribution and import timestamps.
- Reject destructive bulk deletion in the first implementation.
