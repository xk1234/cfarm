# Collections and media MCP tools

> Collection discovery, variable CRUD, empty media-collection creation/safe
> metadata saves, HTTPS media imports, and guarded deletion are implemented.
> Search, merge, and product mutation remain deferred.

Collections are a first-class app use case, not a subsection of slideshow
generation. The same contract covers image, video, word-variable, and product
collections while preserving each collection's typed item schema.

## `lumenclip_collections_list`

Read-only and idempotent. Scope `lumenclip:read`.

### Input

Optional `query`, `mediaType` (`image`, `video`, `word`, or `product`),
`minimumItemCount`, and `limit` (`1..100`, default `20`).

### Output

Summaries with `id`, `name`, `mediaType`, `itemCount`, timestamps, and
`resourceUri`. Word summaries also include the expansion `variableName` and
exact `token`; this matters for migrated collections whose storage ID is a
legacy UUID but whose readable hook namespace is stable. Image/video summaries
include `captionCoverage` and `pinned`. The result includes `total` and
`hasMore`.

## `lumenclip_product_collection_get`

Read-only complete product collection access by stable ID or exact name.
Returns the collection metadata and every typed marketplace item, including
URLs, price/currency, commission estimate/disclaimer, store/generated imagery,
use case, and sourcing timestamp.

## `lumenclip_assets_list`

Read-only unified media discovery. It returns uploaded or AI-generated
`AssetRecord` entries together with media-library music, UGC avatars, demos,
greenscreen memes, and CTAs. Optional filters cover `kind`, `scope`,
`category`, `libraryCollection`, free-text `query`, and `limit`.

## `lumenclip_variable_get`

Read-only and idempotent. Scope `lumenclip:read`.

Accepts `variableId`, which may be the stable variable ID or exact collection
name. Returns the complete variable collection: CRUD `id`, expansion
`variableName`, exact `token`, display `name`, `description`, `values`,
`valueCount`, provenance, timestamps, and `resourceUri`.

## `lumenclip_variable_save`

Mutation, scope `lumenclip:write`.

Creates a variable collection when `variableId` is omitted, or updates an
existing collection selected by ID or exact name. Input supports `name`,
`description`, `values[]`, provenance `source`, and required `requestId`.
`name` is required for creation. Omitted fields are preserved during updates;
passing an empty description clears it. The values array is a complete
replacement and is trimmed and deduplicated case-insensitively.

Returns `created`, `requestId`, and the complete saved `variable`.

## `lumenclip_variable_delete`

Destructive mutation, scope `lumenclip:write`.

Accepts `variableId`, `requestId`, and literal `confirmDelete: true`.
Permanently deletes the caller-owned variable collection and returns the
deleted variable snapshot. Automations referring to the deleted variable may
fail expansion, so callers must inspect automation usage before confirmation.

## `lumenclip_collection_save`

Mutation, scope `lumenclip:write`.

### Input

| Field          | Type             | Required | Description                                                                     |
| -------------- | ---------------- | -------- | ------------------------------------------------------------------------------- |
| `collectionId` | string           | no       | Existing media collection to save; omit to create or reuse one with the name.   |
| `name`         | string           | yes      | User-visible name. Renaming an existing media collection is currently rejected. |
| `mediaType`    | `image \| video` | yes      | Immutable after creation.                                                       |
| `pinned`       | boolean          | no       | Pin state; omitted updates preserve the current value.                          |
| `requestId`    | string           | yes      | Retry identifier. Reusing the same name does not create a duplicate collection. |

### Output

Returns `collection` with its stable derived ID, media type, item count, and
resource URI, plus `created`, `requestId`, and warnings. New collections are
empty; call `lumenclip_collection_add_assets` next. Saving never replaces or
deletes existing assets.

## `lumenclip_collection_add_assets`

Mutation, version-one scope `lumenclip:write`; intended future import scope
`lumenclip:import`.

### Input

Current input requires `collectionId`, `requestId`, and `assets[]` (maximum
80). Each asset contains a validated `httpsUrl` plus optional `caption` and
`sourceUrl`. Only existing image/video collections are accepted.

### Output

Imports download and persist the media, deduplicate by link/hash, and return the
updated collection summary, `added`, `duplicates`, and `failures`. Reusing the
same request/data does not duplicate collection items. Word/product mutation
and AI caption generation are not exposed by this media-import tool; use the
dedicated variable tools for word collections.

## `lumenclip_external_assets_search` — proposed

Input: approved `provider`, `query`, optional media type, orientation, count,
cursor, and provider-safe filters.

Output: source previews with URL, dimensions, MIME, license metadata,
attribution, caption, and a short-lived `selection_token`. Search never imports
assets by itself.

## `lumenclip_collection_delete`

Destructive mutation, scope `lumenclip:write`. The operation is idempotent and
soft-deletes one image/video collection for 30 days; it does not immediately
delete the collection's stored assets.

### Input

| Field             | Type           | Required | Description                                                                                   |
| ----------------- | -------------- | -------- | --------------------------------------------------------------------------------------------- |
| `collectionId`    | string         | yes      | Stable collection ID or exact collection name.                                                |
| `requestId`       | string         | yes      | Caller retry/correlation ID.                                                                  |
| `allowReferenced` | boolean        | no       | Defaults to `false`; must be explicitly true to delete a collection referenced by automation. |
| `confirmDelete`   | literal `true` | yes      | Explicit destructive-action confirmation.                                                     |

### Output and safety

Returns `collectionId`, `deletedAt`, `deletedUntil`, `alreadyDeleted`, and the
referencing automation `dependencies`. Repeating the call for an already
soft-deleted collection returns its existing deletion window. By default,
referenced collections fail without mutation; setting `allowReferenced: true`
acknowledges that dependent automations may subsequently produce `no_images`.
Bulk deletion and permanent purge are not exposed through MCP.

## Merge — proposed

### `lumenclip_collection_merge_preview`

Input: source/destination IDs and expected versions. Output: `preview_id`,
duplicates, caption conflicts, attribution issues, dependencies, and projected
counts. It performs no mutation.

### `lumenclip_collection_merge`

Input: approved `preview_id`, expected versions, `delete_source` (default
`false`), literal `confirm_merge: true`, and `idempotency_key`.

Output: merged collection or operation, counts, retained conflicts, warnings,
and source state.

## Typed collection rules

- Image/video assets require validated media metadata and provenance.
- Word collections return variable values, not fake media assets.
- Product collections retain product fields and linked media references.
- Mutations use explicit per-record operations; replacing an entire collection
  array is not a supported MCP behavior.
