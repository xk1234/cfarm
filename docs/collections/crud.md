---
title: "Collection CRUD and lifecycle"
description: "Supported collection operations, API contracts, deletion behavior, and safe maintenance procedures."
---

Collection CRUD is type-specific. Do not build a generic mutation client from
the assumption that every Collections tab supports the same methods.

## Support matrix

| Type     | Create                                                      | Read                                            | Update                                                                               | Delete                                                       |
| -------- | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Image    | Empty collection, Pinterest/Pexels import, remote import    | List, search, sort, open, inspect               | Rename, pin, add/remove media, edit/generate captions, replace/edit/upscale an image | 30-day soft delete, dependency preview, immediate toast undo |
| Video    | Remote import API or asset ingestion outside the Videos tab | List, search, sort, open, select                | Shared media mutations exist, but see the `mediaType` warning below                  | Same 30-day media soft delete                                |
| Product  | Import script only                                          | List, open, inspect items and marketplace links | Re-run/extend the operational importer                                               | No supported UI or public API delete                         |
| Variable | Add Variable dialog or API                                  | List, search, inspect values                    | Edit description and values through the same upsert endpoint                         | Immediate hard delete; no dependency preview or undo         |

## Media collection API

Image and persisted video collections share these routes:

| Method and route                                       | Purpose                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /api/image-collections`                           | Returns active owner-scoped collections. Soft-deleted rows are excluded.                  |
| `POST /api/image-collections`                          | Upserts a collection by case-insensitive name. Used by ordinary UI saves.                 |
| `POST /api/image-collections/import`                   | Downloads, validates, hashes, deduplicates, stores, and adds remote image or video items. |
| `POST /api/image-collections/delete-preview`           | Returns selected item counts plus dependent automations/templates.                        |
| `DELETE /api/image-collections`                        | Soft-deletes records identified by `name + created_at`.                                   |
| `POST /api/image-collections` with `action: "restore"` | Restores soft-deleted records that have not expired.                                      |
| `POST /api/image-collections/captions`                 | Generates one or all image captions through OpenRouter and saves the collection.          |
| `POST /api/image-collections/image-actions`            | Edits or upscales one image through KIE and returns the replacement URL.                  |

The import route accepts at most 80 unique URLs per request, rejects non-HTTP
URLs, validates `image/*` or `video/*` MIME according to `mediaType`, and caps
each downloaded item at 16 MiB. It stores bytes in Appwrite and deduplicates
against existing URL/content hashes.

### Upsert identity

The generic media upsert is case-insensitive by collection name. Saving
`Campaign Visuals` replaces the current record named `campaign visuals` rather
than creating a second collection. `created_at` participates in delete/restore
identity but not in upsert matching.

### Media deletion lifecycle

1. The client asks `delete-preview` for exact collections.
2. The preview resolves all current collection aliases and lists automations
   and templates that refer to any of them.
3. Delete adds `deletedAt` and `deletedUntil` rather than removing the row or
   file.
4. Active list requests hide the collection. The UI offers an immediate **Undo**
   action.
5. After 30 days, the next collection list operation purges expired rows and
   deletes local collection files that no remaining collection references.

Deletion does not automatically repair dependent automations. Repoint them to
another collection before deletion, or restore the deleted collection before
its recovery window expires.

### Current media contract limitations

The generic `POST /api/image-collections` validator currently accepts
`name`, `created_at`, `pinned`, and `images`, but not `mediaType`. Unknown fields
are stripped. Consequently, a persisted video collection can lose its video
classification after an ordinary rename/pin/detail save. Use the import path to
create video records and verify the Videos tab after later mutations.

Caption generation currently saves a reduced collection payload. Pin and media
classification metadata can therefore be lost when captions are regenerated.
This should be fixed before treating captioning as safe for persisted video
collections.

## Variable collection API

| Method and route                    | Purpose                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/word-collections`         | Lists current owner-scoped variable collections.                        |
| `POST /api/word-collections`        | Creates or updates a collection. An existing `id` is replaced in place. |
| `DELETE /api/word-collections/[id]` | Immediately removes the matching record; returns `404` when missing.    |

The UI derives an ID from the tag, accepts comma- or newline-separated values,
removes blanks, and deduplicates case-insensitively while preserving the first
spelling. When editing, the tag/ID is fixed; description and values are
editable.

Variable deletion has no soft-delete window, dependency preview, or automatic
reference repair. Search automation hooks for both `[[tag]]` and `{tag}` before
deleting. A scheduled run with a missing or empty variable collection fails at
expansion time rather than silently inventing a value.

## Product collection operations

`GET /api/product-collections` is the only current product-collection route.
The UI has no create, update, or delete controls. Seed/refresh work is performed
by `scripts/import-product-collections.mjs`, which downloads marketplace
images, generates lifestyle images, uploads both, and upserts the curated
records.

There is a current persistence mismatch to resolve before relying on the
importer: application reads route the logical store to
`permanent_assets/source_key=product_collection`, while the importer writes the
dedicated legacy `product_collections` table. Verify the target table and row
visibility in the environment before running it. Do not manually delete product
rows or Storage objects without checking both locations.

## Safe maintenance checklist

1. Confirm the collection type and whether it is persisted or virtual.
2. Confirm the authenticated owner; never mutate rows by a client-supplied
   owner ID.
3. Preview media dependencies or search hook tokens before destructive work.
4. Preserve stable IDs referenced by automations.
5. For binary media, delete only unreferenced Storage files.
6. Test list and selection behavior after a mutation, not only the API response.
