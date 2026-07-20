---
title: "Analyzing and exporting data tools [Partial MCP]"
description: "Read-only analytics reports plus controlled exports of workspace records, metrics, and generated media."
---

> **Partially implemented.** `lumenclip_analytics_report` can read current
> owner-scoped stored snapshots. Advanced grouped reports and the export
> surface remain deferred until saved report resources and explicit export
> authorization ship.

## Purpose

This family answers performance questions and exports portable workspace data
without exposing provider payloads, credentials, or internal Appwrite rows.

## Analytics tools

| Tool                         | Scope            | Behavior                                                                                             |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `lumenclip_accounts_list`    | `lumenclip:read` | **Implemented:** resolve safe account identities and publishing capabilities.                        |
| `lumenclip_outputs_list`     | `lumenclip:read` | **Implemented:** resolve generated outputs, source automations, and publication state.               |
| `lumenclip_analytics_report` | `lumenclip:read` | **Implemented:** read latest-per-post totals, account breakdowns, follower change, and recent posts. |
| `lumenclip_operation_get`    | `lumenclip:read` | **Implemented for generation:** inspect slideshow, social, and generated-video operations.           |

The implemented report accepts a lookback in days, optional integration IDs,
and a recent-post limit. It reads stored snapshots without refreshing PostFast.
Date-range, platform, format, source, automation, arbitrary metric/grouping,
pagination, and saved report-resource support remain proposed.

Unsupported or missing metrics are `unavailable`, never synthetic zeroes.

## Proposed export tools

| Tool                      | Scope                       | Behavior                                                                                                                    |
| ------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `lumenclip_export_create` | proposed `lumenclip:export` | Export selected automations, collections, outputs, publication evidence, or analytics reports as JSON, CSV, or a media ZIP. |
| `lumenclip_operation_get` | `lumenclip:read`            | Poll export preparation and return the final export resource URI.                                                           |

Exports should support explicit field selection, date filters, stable public
object schemas, checksums, row/item counts, and a short expiry. Media exports
must include a manifest with captions, source attribution, MIME types, and
content hashes.

## Typical analysis sequence

1. Resolve workspace, accounts, capabilities, and a precise date range.
2. Request an attributed report using read scope only.
3. Compare like-for-like cohorts and state sample size and uncertainty.
4. Return the report URI and exact filters.
5. Recommend one controlled change without mutating an automation.

## Typical export sequence

1. Resolve the exact records or report to export.
2. Show the selected object types, filters, fields, format, and estimated size.
3. Ask for approval if the export includes media or sensitive account metadata.
4. Create the export with an idempotency key.
5. Poll the operation and return the expiring resource URI, checksum, and item
   counts.

## Privacy and safety

- Never export provider access tokens, session data, private API payloads, or
  internal bucket/database identifiers.
- Apply workspace ownership and account-level authorization to every row.
- Redact private user fields unless explicitly requested and permitted.
- Log who created the export, its filters, expiry, and download count.
- Expired exports must no longer resolve.
