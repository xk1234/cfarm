# Outputs and operations MCP tools

> Output discovery, guarded deletion, and operation inspection are implemented
> for persisted slideshow runs, AI UGC queue/checkpoint runs, generated videos,
> X drafts, and Threads drafts.

Outputs are generated drafts and rendered artifacts. Operations represent
long-running generation, import, publishing, or export work. These contracts
back the app's generated-content viewers and progress states.

## `lumenclip_outputs_list`

Read-only and idempotent. Scope `lumenclip:read`.

### Input

Optional `automationId`, `outputType` (`slideshow`, `video`, `x_post`, or
`threads_post`), `status` (`running`, `ready`, or `failed`),
`publicationState`, `createdFrom`, `createdTo`, and `limit` (`1..100`).

### Output

Summaries with `id`, `outputType`, `automationId`, `status`,
`publicationState`, `title`, `previewUri`, `createdAt`, and `resourceUri`, plus
`total` and `hasMore`. Each item also includes `analytics`: availability,
publication IDs, post count, latest capture time, canonical metric totals,
followers gained, and the correct report tools/guidance. TikTok Studio-backed
outputs point callers to `lumenclip_tiktok_studio_analytics_report` for
section and slide detail. Full post bodies and media bytes are not embedded.

Publication state includes `published_unlinked` for a legacy output carrying a
manual published timestamp but no publication record. This is deliberately
distinct from `published`: analytics and hook attribution may recover through
source-linked snapshots, but clients are warned that the canonical publication
join is incomplete.

## `lumenclip_output_delete`

Permanent destructive mutation. Deletes one caller-owned unpublished output
and any local draft publication records associated with it.

### Input

Required `outputId`, `requestId`, and literal `confirmDelete: true`.

### Output and safety

Returns `outputId`, `outputType`, `deleted: true`, `recoverable: false`, and the
request ID. The tool accepts persisted slideshow outputs (by run or slideshow
ID), generated videos, X drafts, and Threads drafts. Running, scheduled, and
published outputs are rejected without mutation. This is intentionally not
idempotent: a retry after successful deletion returns `Output not found`.

Collection and output deletion have different retention semantics. Use
`lumenclip_collection_delete` for a recoverable 30-day collection soft delete;
use this tool only when permanent output removal is intended.

## `lumenclip_operations_list`

Read-only queue/run discovery with optional `status`, exact `type`, and
`limit`. It combines durable queue jobs, standard automation runs, X/Threads
runs, and generated-video exports. Queue rows include attempts, maximum
attempts, payload/result, availability, timestamps, and error; generated runs
include automation and output identity.

## `lumenclip_operation_get`

Read-only and idempotent. Scope `lumenclip:read`.

### Input

Required `operationId`. This is the queue, run, or export ID returned by generation.

### Output

Returns `operation` with kind, status, progress, stage, next-poll interval,
timestamps, and resource URI. Terminal success includes output resource links;
terminal failure includes stable error objects. In-flight slideshow runs also
include the process-local generation stage when available.

```json
{
  "operation": {
    "id": "op_123",
    "kind": "automation.run",
    "status": "running",
    "progress": 45,
    "stage": "rendering",
    "warnings": [],
    "next_poll_after_ms": 5000,
    "resource_uri": "lumenclip://operations/op_123"
  },
  "outputs": [],
  "errors": []
}
```

For AI UGC, the queue operation maps durable worker checkpoints (`analysis`,
`script`, `actor`, `voice`, `motion`, `lipsync`, `broll`, `composite`, `store`,
`publish`) into progress. A ready export is returned as an unpublished video
output. Operation status is lightweight and never embeds media bytes or full
worker logs. Clients should honor `nextPollAfterMs`.
