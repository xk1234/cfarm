---
title: "Image collections"
description: "Image collection fields, import and editing workflows, automation roles, storage, and lifecycle constraints."
---

Image collections are curated sets of reusable still images for slideshow
hooks, body slides, CTAs, and overlays.

## Record shapes

The persisted record is `StoredImageCollection`:

```ts
type StoredImageCollection = {
  ownerId?: string
  name: string
  created_at: string
  pinned?: boolean
  mediaType?: "image" | "video"
  deletedAt?: string
  deletedUntil?: string
  images: {
    image_link: string
    caption: string
    hash?: string
    last_used_at?: string
  }[]
}
```

For an image collection, `mediaType` is absent or `"image"`. The client converts
the record to `CreatedImageCollection`, deriving a display ID from
`name + created_at` and mapping each stored item to the shared Pinterest result
shape.

| Field                       | Meaning                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `name`                      | Human-readable name and case-insensitive upsert key               |
| `created_at`                | Original collection timestamp and part of delete/restore identity |
| `pinned`                    | Forces the collection ahead of unpinned results after sorting     |
| `image_link`                | Durable URL used by previews and generation                       |
| `caption`                   | Search/selection context and accessible description               |
| `hash`                      | Content hash used for deduplication and usage lookup              |
| `last_used_at`              | Derived at read time from the image usage ledger                  |
| `deletedAt`, `deletedUntil` | Soft-deletion lifecycle; hidden from ordinary reads               |

## Create

The Images tab can create an empty collection or open the discovery/import
flow. Pinterest and Pexels results can be curated before import; automatic
captioning is optional. The remote import endpoint downloads and validates the
actual bytes rather than retaining the provider URL as the durable asset.

Import rules:

- maximum 80 unique items per request;
- HTTP(S) URLs only;
- `image/*` response MIME required;
- maximum 16 MiB per item;
- duplicate source URLs are removed before download;
- existing content hashes and stored URLs are not added twice.

The default name in the low-level import helper is `Tumblr import` when no name
is supplied. The UI's empty-collection default is `Empty collection`.

## Read and organize

The Images tab supports title search, grid/table views, 28-item pagination,
pin-first display, and sorting by created time, title, or item count. Opening a
collection shows its images, captions, and detail actions.

![Image collection detail with upload dropzone, caption generation, view controls, and image selection](/docs/workflows/collection-crud-05-detail.jpg)

The detail view provides:

- an editable title and back navigation;
- remote import and local dropzone entry points;
- caption generation for the collection;
- grid density and description controls under **View**;
- per-image selection and bulk removal;
- an image viewer for caption, URL, edit, and upscale actions.

There is no current **All Images** virtual collection. Older documentation or
screenshots that mention it describe removed behavior.

## Update

Supported UI updates include:

- rename the collection;
- pin or unpin it;
- add imported images;
- remove selected images;
- edit an image caption or URL;
- generate captions for one/all items through OpenRouter;
- replace an image with a KIE edit or upscale result.

Ordinary saves post the full remaining collection and upsert by normalized
name. When a replacement removes locally stored files, the server deletes only
files no other collection references.

Local drag/drop inside an already-open collection currently creates browser
`blob:` URLs before the generic save. Those URLs are not durable across browser
reloads, and there is no collection-specific multipart endpoint that persists
those local files. Use remote Pinterest/Pexels import for durable media until
the drop zone is wired to an Appwrite upload route.

## Delete and restore

Image deletion first previews media count and direct automation/template
dependencies. Confirmation soft-deletes the row for 30 days and offers an
immediate Undo action. Expired rows and their now-unreferenced stored files are
purged during a later list operation.

See [Collection CRUD and lifecycle](crud.md) for the exact sequence and API.

## Automation use

Image collections may be assigned independently to hook, body, and CTA roles.
Formatting can also point an overlay or individual slide override at another
collection. The worker resolves logical aliases, applies image reuse rules,
uses captions as selection context where configured, and records the chosen
image key/caption in the run plan.

See [How collections are used](usage.md) for the complete resolution flow.

## Persistence and providers

- Metadata: owner-scoped `permanent_assets` rows with
  `source_key=image_collection`.
- Bytes: Appwrite `image_collections` Storage bucket, served through
  `/api/local-assets/image-collections/files/...`.
- Discovery: Pinterest and Pexels search routes.
- Captions: OpenRouter, requiring `OPENROUTER_API_KEY`.
- Edit/upscale: KIE, requiring `KIE_KEY`.

## Known limitations

- Caption saves can drop `pinned` and media classification metadata because the
  captions route currently persists a reduced shape.
- The media record has no description, tags, source provenance list, or
  collection version.
- Merge is not shipped. The current design is documented as a
  [proposed workflow](../workflows/merge-collections.md).
