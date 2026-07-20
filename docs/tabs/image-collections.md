---
title: "Collections tab"
---

Route key: `collections`

Components (in `components/realfarm/collections-view.tsx`):

- `CollectionsView`
- `CollectionDetailView`
- `PinterestCollectionSearch`
- `ImageViewerModal`

> Canonical reference: [Collections overview](../collections/overview.md),
> [CRUD and lifecycle](../collections/crud.md), and
> [collection usage](../collections/usage.md).

## Functionality

Collections manages four current types: images, videos, products, and variables.
The image/video library can load saved collections, create or import image
collections, edit captions, rename and pin persisted media collections, preview
delete dependencies, and view individual media. Products use a read-only
catalog panel; variables use their own CRUD panel.

Main actions:

- Load stored collections from `/api/image-collections`.
- Create empty collections.
- Search Pinterest and create collections from selected results.
- Open a collection detail page.
- Add/remove images.
- Rename collections.
- Edit image captions.
- Caption uncaptured images through the captions API.
- Browse virtual AI UGC Avatar Videos and Greenscreen Memes collections.

## Objects Used

| Object                             | Source                           | Usage                                         |
| ---------------------------------- | -------------------------------- | --------------------------------------------- |
| `CreatedImageCollection[]`         | Workspace state                  | Primary UI collection shape.                  |
| `StoredImageCollection[]`          | `GET /api/image-collections`     | Persisted collection shape.                   |
| `PinterestSearchResult[]`          | Pinterest search/default/uploads | Images in collections.                        |
| Virtual `CreatedImageCollection`   | Workspace media projections      | Read-only avatar and greenscreen video views. |
| `PinterestCollectionCreatePayload` | `lib/realfarm-collections.ts`    | Payload shape for collection creation flow.   |

## Persistence

Persistence: owner-scoped `permanent_assets` rows with `source_key=image_collection` (via `lib/json-store.ts`) and the `image_collections` Storage bucket. Cloud collections can be copied into the shared local project with `pnpm appwrite:local:sync-reference`; the copy does not remove cloud rows or files.

API:

- `GET / POST / DELETE /api/image-collections`
- `POST /api/image-collections/captions`
- `POST /api/image-collections/import` (add/import images)
- `POST /api/image-collections/image-actions`
- `POST /api/pinterest/search?limit=...`

Important conversion helpers:

- `storedToCollection()` converts disk/API collections into `CreatedImageCollection`.
- `collectionToStored()` converts UI collections into `StoredImageCollection`.

## Hardcoded / Demo Behavior

- There is no current "All Images" virtual collection.
- Deleting a persisted media collection soft-deletes it for 30 days; expired
  rows and unreferenced files are purged later.
- Uploaded/imported images persist via `/api/image-collections/import` into the `image_collections` Storage bucket.
- Default created collection title is `"Empty collection"`.
- Default fallback source values include `fallback` and `empty` in the workspace-local type.
- View options such as columns and images per page are local state only.
- Captioning API currently saves the collection shape back; actual caption quality depends on that route implementation.
