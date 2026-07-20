# Accounts and publishing MCP tools

> Account discovery, confirmed output publishing/scheduling, manual publication
> linking, and the focused TikTok reconciliation tools are callable.

This group maps to connected-account selection, publish-now, scheduled
publication, and manual publication linking. Connecting or disconnecting an
account remains a browser/OAuth action in the app and is not an MCP tool.

## `lumenclip_accounts_list`

Read-only, idempotent, and open-world. Scope `lumenclip:read`.

### Input

Optional `provider` and `limit` (`1..100`, default `50`). Only connected,
enabled accounts returned by the current PostFast bridge are included.

### Output

Safe account summaries with `id`, `provider`, `platform`, `displayName`,
profile metadata, connection state, and explicit capabilities:
`publishSingle`, `publishGallery`, `publishVideo`, `schedule`, and
`replyChain`. `replyChain` is currently false. Credentials and provider tokens
are never returned.

## `lumenclip_output_publish`

External side effect. Scope `lumenclip:publish`.

### Input

| Field            | Type           | Required | Description                                                                      |
| ---------------- | -------------- | -------- | -------------------------------------------------------------------------------- |
| `outputId`       | string         | yes      | Ready caller-owned output.                                                       |
| `targets`        | object[]       | yes      | Each has `accountId`, `mode: now \| schedule`, and `scheduledAt` when scheduled. |
| `caption`        | string         | no       | Explicit approved caption override.                                              |
| `confirmPublish` | literal `true` | yes      | Mandatory external-side-effect confirmation.                                     |
| `requestId`      | string         | yes      | Operation/retry identifier.                                                      |

### Output

Returns a terminal publish operation, target publication summaries, counts,
and warnings. Before calling PostFast, the tool uploads output media and checks
for an existing non-failed publication for the same output/account; a retry is
returned as `reused` instead of publishing twice. Multi-post reply chains are
rejected because the current PostFast bridge cannot publish them atomically.

Errors include `OUTPUT_NOT_READY`, `UNSUPPORTED_CAPABILITY`,
`PUBLISH_CONFIRMATION_REQUIRED`, and `PROVIDER_UNAVAILABLE`.

## `lumenclip_output_mark_published`

Records a manual publication without sending anything. Scope
`lumenclip:publish`; idempotent.

### Input

Required `outputId`, `platform`, `publishedUrl`, `publishedAt`, `requestId`,
and literal `confirmLink: true`; optional `accountId`.

### Output

Returns updated publication evidence with `publicationState: "published"`,
normalized URL, parsed provider post ID, account ID when supplied, timestamp,
and resource URI. It conflict-checks the public post ID and updates the local
slideshow/video/social-run publication marker without posting externally.

## Implemented TikTok reconciliation tools

`lumenclip_tiktok_import_start` accepts one to twenty public TikTok photo-post
URLs and returns an Apify operation ID. It is read-only from LumenClip's point
of view and does not change the external posts.

`lumenclip_tiktok_import_preview` accepts the operation and automation IDs. It
returns normalized post metadata, visible first-slide text, owner-scoped run
candidates, scores/evidence, a recommendation only when unambiguous, and any
existing local link.

`lumenclip_tiktok_publications_link` accepts the reviewed operation,
automation, connected TikTok account, and one selection per post. Each
selection names an existing run or requests historical recovery. Literal
`confirm: true` is required. The operation is idempotent for an existing link
and rejects a provider-post ID already linked to a different output.
