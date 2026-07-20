# Analytics MCP tools

> A focused read-only report is implemented. Advanced arbitrary grouping,
> metric-availability objects, saved report resources, and exports remain
> future work.

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
totals, per-account totals, latest follower count/change, and recent post
summaries. Only the latest stored snapshot per account/post contributes to
totals, preventing repeated sync snapshots from being double-counted.

The tool does **not** call PostFast or refresh analytics. It reports the current
owner-scoped snapshot store. Missing metrics remain absent rather than being
invented as zero. Engagement rate is recalculated from aggregate interactions
and the best available views/impressions/reach denominator.

Advanced filters and the saved-report/resource envelope below the original
roadmap remain proposed.

## Exporting a report

Portable exports are a separate app use case. After creating a report, pass its
`report_id` to the deferred
[`lumenclip_export_create`](../exports/README.md) contract.

## Recommended analysis sequence

1. Choose a lookback period and optional integration IDs.
2. Call `lumenclip_analytics_report`.
3. Compare account totals and recent post summaries while noting absent data.
4. Recommend changes without applying them unless separately approved.
