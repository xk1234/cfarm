---
title: "Video collections"
description: "Persisted and virtual video collection contracts, sources, template use, CRUD support, and current limitations."
---

Video collections group reusable clips for UGC, demo, and greenscreen formats.
They are displayed on the Videos tab but reuse the image-collection data model:
the item array is still named `images`, and each clip URL is stored in
`image_link`.

![Videos collection tab with virtual and persisted reusable video collections](/docs/collections/video-collections.png)

The Videos tab reuses the Images tab's search, sort, and grid/table controls.
Virtual collections appear alongside persisted records but do not expose pin
or delete actions. Stored records normally load the clip itself as the card
preview.

## Types of video collection

### Persisted video collections

A persisted video collection is a `StoredImageCollection` with
`mediaType: "video"`. Its metadata is stored as an owner-scoped
`image_collection` record and imported clip bytes use the shared
`image_collections` bucket.

The import endpoint accepts `mediaType: "video"`, requires a `video/*` response,
limits each clip to 16 MiB, and imports at most 80 unique URLs in one request.

### Virtual video collections

The workspace always constructs two read-only projections:

| Title                | Stable ID                      | Source                                                                                                                     |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| AI UGC Avatar Videos | `collection-ugc-avatar-videos` | Persisted video collections whose names begin `UGC Avatars — ` plus media-library `ugc_avatar_videos`, deduplicated by URL |
| Greenscreen Memes    | `collection-greenscreen-memes` | Media-library `greenscreen_memes` video assets                                                                             |

Virtual collections have `source: "virtual"`, `createdAt: "virtual"`, and
`virtual: true`. They can be opened and selected but cannot be pinned, renamed,
selected for bulk deletion, or deleted.

## CRUD support

| Action | Current behavior                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Create | No Add control on the Videos tab. Persisted records can be created through the media import API or asset-ingestion workflows. |
| Read   | Videos tab search, sort, grid/table, open, count, and automation selection.                                                   |
| Update | The shared detail/media actions are available for persisted records, subject to the classification warning below.             |
| Delete | Persisted records use dependency preview and 30-day soft deletion. Virtual records are immutable.                             |

### Classification warning

The ordinary `POST /api/image-collections` schema does not currently accept
`mediaType`, so an ordinary rename, pin, or detail save can strip `"video"` and
move a persisted collection to the Images tab. Caption saving can do the same.
Until the API schema preserves `mediaType`, verify classification after every
persisted-video mutation and avoid caption regeneration on video collections.

## Automation use

Compatible video-template fields allow virtual and persisted video collections.
The Greenscreen Meme template, for example, selects one clip from
`collection-greenscreen-memes` and separately selects a still-image collection
for its background. UGC templates can select from
`collection-ugc-avatar-videos`.

The more specific `video_demo_asset_id` setting selects a demo media asset and
is not interchangeable with a video collection ID.

## Relationship to the media library

Media-library assets and video collections overlap but are not the same record:

- media-library assets use `source_key=media_library_asset` and categories such
  as `ugc_avatar_videos`, `demo_videos`, and `greenscreen_memes`;
- persisted video collections use `source_key=image_collection`;
- virtual collections project selected media-library categories into the
  collection selector without copying their records.

Deleting a persisted video collection does not delete its source media-library
assets. Likewise, deleting or changing a media-library asset can change a
virtual collection without mutating a collection row.

## Known limitations

- The shared field names (`images`, `image_link`) obscure the true media type.
- The Videos tab has no direct create/import entry point.
- The generic save and caption routes do not preserve `mediaType`.
- There is no duration, codec, dimensions, audio-state, or thumbnail metadata in
  the persisted collection item contract.
