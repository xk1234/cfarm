---
title: "Collections overview"
description: "The canonical map of LumenClip collection types, ownership, persistence, lifecycle, and current product support."
---

Collections are reusable groups of media, products, or text values. The
authenticated workspace exposes four collection types under **Collections**:

| Type                                            | Contains                                                                                         | Primary purpose                                                        | App support                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------- |
| [Image collections](image-collections.md)       | Image URL, caption, content hash, and last-used metadata                                         | Supply hook, body, CTA, and overlay visuals to slideshow automations   | Full create/read/update plus recoverable delete    |
| [Video collections](video-collections.md)       | Video URLs in the shared media-collection shape                                                  | Supply reusable avatar, demo, and greenscreen clips to video templates | Read/select; persisted imports share the media API |
| [Product collections](product-collections.md)   | Marketplace products, prices, commission estimates, store images, and generated lifestyle images | Browse curated affiliate-product research                              | Read-only in the app                               |
| [Variable collections](variable-collections.md) | A named tag and a deduplicated list of text values                                               | Expand dynamic hook tokens such as `[[zodiac]]`                        | Full create/read/update and immediate hard delete  |

These are product concepts, not four identical database tables. Image and
video collections share a persisted record. Variable and product collections
have their own record contracts. The [CRUD matrix](crud.md) is the authority on
which actions are supported for each type.

## Collections workspace

![Collections Images tab in grid view with search, sorting, and view controls](/docs/collections/collections-grid.png)

The four tabs separate media and data by how they are consumed:

- **Images** supplies slideshow visuals and exposes create/import controls.
- **Videos** contains persisted and virtual reusable clips.
- **Products** is the current read-only affiliate research catalog.
- **Variables** stores reusable text values for hook tokens.

The Images and Videos tabs keep search, sorting, and grid/table controls on the
same row as the tabs. Grid cards prioritize the visual preview. Table view is
better for comparing type, item count, creation date, and available actions.

![Collections Images tab in table view with square previews, metadata columns, and row actions](/docs/collections/collections-table.png)

The table's first column includes a small square preview. **Open** enters the
collection; the icon buttons pin/unpin or delete eligible persisted records.
Virtual records do not expose mutation actions.

## Shared rules

### Ownership

Every persisted collection read or write is scoped to the authenticated
workspace owner. Image, variable, and product records are stored as owner-scoped
Appwrite rows. A client-provided `ownerId` is never the authority for access.

### Physical storage

The logical JSON-store paths remain compatibility boundaries in application
code, but current records live in Appwrite:

| Logical store                                  | Physical record location                            | Binary storage             |
| ---------------------------------------------- | --------------------------------------------------- | -------------------------- |
| `image-collections.json`                       | `permanent_assets`, `source_key=image_collection`   | `image_collections` bucket |
| `word-collections/word-collections.json`       | `permanent_assets`, `source_key=word_collection`    | None                       |
| `product-collections/product-collections.json` | `permanent_assets`, `source_key=product_collection` | `product_images` bucket    |

Video collections do not have a separate table or bucket contract. A persisted
video collection is an image-collection record with `mediaType: "video"`.
Virtual video collections are assembled from media-library assets at runtime.

### Persisted versus virtual collections

A persisted collection has an owner-scoped row and may be mutated according to
its type. A virtual collection is a read-only projection assembled by the
workspace:

- **AI UGC Avatar Videos** combines categorized `UGC Avatars — …` video
  collections with media-library avatar videos and removes duplicate URLs.
- **Greenscreen Memes** projects media-library greenscreen assets.

Virtual collections can be opened and selected by compatible automations, but
they cannot be pinned, renamed, or deleted. There is no current **All Images**
virtual collection in the workspace.

### IDs and references

- Persisted media collections are addressed in the UI by a slug derived from
  `name + created_at`; automations may also store the collection name or a
  supported legacy alias.
- Variable collections use a stable `id`, which is also normally the visible
  token name.
- Product collections and their items each have explicit stable IDs.
- Collection IDs are logical domain references. They are not Appwrite Storage
  file IDs or bucket names.

## Workspace behavior

The Images and Videos tabs support title search, pin-first ordering,
newest/oldest, name, and item-count sorting. The grid loads 28 collections at a
time. Product and Variable tabs use their own panels and controls.

## Read next

- [CRUD and lifecycle](crud.md) for supported mutations, API contracts, delete
  semantics, and operational cautions.
- [How collections are used](usage.md) for automation selection and runtime
  resolution.
- The type-specific pages for serialized fields, UI behavior, endpoints, and
  known limitations.
- [Create, review, update, and delete an image collection](../workflows/collection-crud.md)
  for the screenshot-backed user workflow.
