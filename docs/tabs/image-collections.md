# Image Collections Tab

Route key: `collections`

Components (in `components/realfarm/collections-view.tsx`):

- `CollectionsView`
- `CollectionDetailView`
- `PinterestCollectionSearch`
- `ImageViewerModal`

## Functionality

Image Collections manages collections of image URLs for use in slideshow generation. It can load saved collections, create empty collections, search Pinterest for images, add uploads, edit captions, rename collections, delete local UI collections, and view collection images.

Main actions:

- Load stored collections from `/api/image-collections`.
- Build an "All Images" virtual collection from current collections.
- Create empty collections.
- Search Pinterest and create collections from selected results.
- Open a collection detail page.
- Add/remove images.
- Rename collections.
- Edit image captions.
- Caption uncaptured images through the captions API.
- Create a local automation from a collection.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `CreatedImageCollection[]` | Workspace state | Primary UI collection shape. |
| `StoredImageCollection[]` | `GET /api/image-collections` | Persisted collection shape. |
| `PinterestSearchResult[]` | Pinterest search/default/uploads | Images in collections. |
| Virtual `CreatedImageCollection` | `allImagesCollectionFrom()` | Read-only merged image view. |
| `PinterestCollectionCreatePayload` | `lib/realfarm-collections.ts` | Payload shape for collection creation flow. |

## Persistence

Persistence: Appwrite `image_collections` table (via `lib/json-store.ts`) — authoritative, no filesystem fallback. Collection images persist to the `image_collections` Storage bucket.

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

- The "All Images" collection is virtual and read-only.
- Deleting a collection calls `DELETE /api/image-collections` and removes the persisted record.
- Uploaded/imported images persist via `/api/image-collections/import` into the `image_collections` Storage bucket.
- Default created collection title is `"Empty collection"`.
- Default fallback source values include `fallback` and `empty` in the workspace-local type.
- View options such as columns and images per page are local state only.
- "Create automation" from a collection creates a local in-memory automation.
- Captioning API currently saves the collection shape back; actual caption quality depends on that route implementation.
