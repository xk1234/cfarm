# Analytics MCP tools

> A focused read-only report and the reviewed TikTok Studio import workflow are
> implemented. Advanced arbitrary grouping, saved report resources, and exports
> remain future work.

Shared discovery schemas for `lumenclip_workspace_get`,
`lumenclip_accounts_list`, `lumenclip_outputs_list`, and
`lumenclip_operation_get` are documented in
[../shared-contracts.md](../shared-contracts.md).

Their primary use-case references are [Workspace](../workspace/README.md),
[Accounts and publishing](../publishing/README.md), and
[Outputs and operations](../outputs/README.md).

## `lumenclip_analytics_report`

Read-only and idempotent. Scope: `lumenclip:read`.

### Input

| Field            | Type          | Required | Description                                            |
| ---------------- | ------------- | -------- | ------------------------------------------------------ |
| `days`           | integer 1-365 | no       | Lookback window; default 30.                           |
| `integrationIds` | string[]      | no       | Restrict the report to stored account integration IDs. |
| `postLimit`      | integer 1-200 | no       | Maximum recent post summaries; default 50.             |

### Output

The report returns `generatedAt`, `since`, `days`, overall canonical metric
totals, per-account totals, latest follower count/change, per-post and
per-account `newFollowers`, and recent post summaries. Publication ownership is
the canonical source for integration IDs, so a stale snapshot account ID cannot
make Studio-linked posts disappear from a filtered report. Only the latest
stored snapshot per account/post contributes to totals, preventing repeated
sync snapshots from being double-counted.

The tool does **not** call PostFast or refresh analytics. It reports the current
owner-scoped snapshot store. Missing metrics remain absent rather than being
invented as zero. Engagement rate is recalculated from aggregate interactions
and the best available views/impressions/reach denominator.

Advanced filters and the saved-report/resource envelope below the original
roadmap remain proposed.

## `lumenclip_hook_performance`

Read-only hook-attributed analytics. Input is `automationId` plus `days`
(`1..3650`, default `90`). The tool joins persisted run-plan `hookId` values to
confirmed publication records and the latest metric snapshots.

The `performance` array includes every canonical hook and any historically
published hook that was later deleted. Rows return enabled state, publish
count, views, shares, saves, share rate, provider list, last publication time,
and mean slide-1-to-2 retention when a Studio snapshot captured both values.
Uncaptured metrics are `null` or absent rather than fabricated.

## TikTok Studio slideshow analytics

TikTok Studio exposes slideshow retention, likes by slide, discovery, and
viewer breakdowns only inside the creator's authenticated Studio session.
LumenClip does not copy or store that session. Instead, the connected Chrome
companion observes the structured analytics responses already loaded by Studio
and sends them to a short-lived, post-scoped capture job.

1. Connect the Chrome companion once from the cfarm Analytics UI.
2. Call `lumenclip_tiktok_studio_analytics_import_start` with an existing local
   TikTok publication ID.
3. The companion discovers the pending import automatically and opens Studio.
4. Call `lumenclip_tiktok_studio_analytics_report` with `importId` to inspect
   the saved post, source output, and slide metrics.

A validated Overview is persisted immediately as one canonical metric snapshot.
Viewers and Engagement responses enrich that same snapshot.

Captures completed through a local LumenClip app are mirrored to cloud Appwrite
through a protected server-to-server route. The public MCP therefore reads the
same stored snapshot without receiving Chrome cookies or a cloud Appwrite key.

For account-wide backfills, use:

1. Call `lumenclip_tiktok_studio_analytics_batch_start` with selected TikTok
   integration IDs and `mode: "new" | "recent" | "all"`.
2. The connected companion discovers and starts the allowlisted batch.
3. Poll `lumenclip_tiktok_studio_analytics_report` with `batchId`. Paginate with
   `offset` and `limit` when the batch contains more than one page.

The persistent companion credential is capture-only. Each one-hour batch still
resolves to an explicit server-side post allowlist. The companion processes
Overview, Viewers, and Engagement sequentially and saves every valid Overview
automatically; missing posts remain retryable. The legacy batch-link tool is
recovery-only.

## `lumenclip_tiktok_studio_analytics_report`

Read-only and idempotent. Scope: `lumenclip:read`.

This is the single detailed read surface for both pending Studio captures and
already-linked analytics. It replaces the old single-post and batch preview
calls.

### Input

| Field            | Type           | Required | Description                                                                |
| ---------------- | -------------- | -------- | -------------------------------------------------------------------------- |
| `importId`       | string         | no       | Restrict the report to one pending capture. Mutually exclusive with batch. |
| `batchId`        | string         | no       | Restrict the report to one pending batch. Mutually exclusive with import.  |
| `postIds`        | string[]       | no       | Local publication IDs or external TikTok post IDs.                         |
| `integrationIds` | string[]       | no       | Restrict linked snapshots to TikTok account integrations.                  |
| `automationId`   | string         | no       | Restrict results to one source automation.                                 |
| `days`           | integer 1-3650 | no       | Linked-snapshot lookback window; default 365.                              |
| `offset`         | integer        | no       | Zero-based page offset; default 0.                                         |
| `limit`          | integer 1-50   | no       | Page size; default 20.                                                     |
| `historyLimit`   | integer 1-10   | no       | Maximum stored snapshots returned per post; default 3.                     |

### Output

Each post joins the local publication, effective Studio analytics, bounded
snapshot history, mapping diagnostics, and the complete persisted source
output:

- Slideshows include title, caption, hashtags, prompt, generation metadata,
  assets, and every slide's text, styling, media, overlays, icons, role, and
  duration.
- Generated videos include status, copy, automation/run relationships,
  timestamps, preview/video URLs, publication state, and safe source config.
- Studio data includes overview totals, per-slide retention and likes, traffic,
  search, audience, raw metrics, and capture/link readiness. Section-aware
  composition keeps the newest value for each field while filling missing
  Viewers or Engagement sections from the newest richer historical snapshot.
  `currentSnapshot.partial`, `missingCurrentSections`, `sectionSources`, and
  `effectiveSnapshotIds` make that composition explicit.
- `slideMetricsAvailability` distinguishes `available`, `partial`,
  `unavailable`, and `not_captured`. Slide shells containing only
  `slideIndex` are reported as unavailable, and `mapping.issues` names missing
  retention indexes instead of claiming a healthy mapping.
- Every bounded history entry includes its complete persisted `studio` detail,
  its own partial/missing-section flags, and slide-metric availability.

Secrets and binary media bytes are not returned. Sensitive configuration keys
are recursively removed. When a historical publication no longer resolves to a
persisted output, the report keeps its analytics and returns explicit mapping
issues instead of inventing missing slide or video data.

For linked analytics, omit `importId` and `batchId`, then filter with `postIds`,
`integrationIds`, `automationId`, and `days`.

## Exporting a report

Portable exports are a separate app use case. After creating a report, pass its
`report_id` to the deferred
[`lumenclip_export_create`](../exports/README.md) contract.

## Recommended analysis sequence

1. Choose a lookback period and optional integration IDs.
2. Call `lumenclip_analytics_report`.
3. Compare account totals and recent post summaries while noting absent data.
4. Recommend changes without applying them unless separately approved.
