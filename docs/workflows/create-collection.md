---
title: "Creating a collection"
description: "Building an image collection an automation can draw from — the agent call, the UI equivalent, why the name is the primary key, and the failures worth checking."
---

# Creating a collection

Collections are the image and video pools automations pull slides from. This covers creating
one and putting media in it, from both surfaces.

`Last tested: 2026-07-25, live against cfarm-eight.vercel.app`

## Workflow summary

### 1. User asks

> "Make me a collection of HDB resale chart screenshots."

### 2. Agent calls `lumenclip_collection_save`

Creates an empty caller-owned collection. It does not accept assets.

**In**

```json
{
  "name": "HDB resale chart screenshots",
  "mediaType": "image",
  "requestId": "collection-hdb-create-001"
}
```

`name` (≤200 chars) and `mediaType` (`"image" | "video"`) are required, as is `requestId`.
`collectionId` updates an existing collection's pinned state instead. `pinned` is optional.

**Out**

```json
{
  "requestId": "collection-hdb-create-001",
  "created": true,
  "collection": {
    "id": "hdb-resale-chart-screenshots",
    "name": "HDB resale chart screenshots",
    "mediaType": "image",
    "itemCount": 0,
    "captionCoverage": 0,
    "pinned": false,
    "resourceUri": "lumenclip://collections/hdb-resale-chart-screenshots"
  },
  "warnings": ["The collection is empty. Add assets before using it for generation."]
}
```

`captionCoverage` is a fraction between 0 and 1, not a percentage or a count. `description`
is always `undefined` for image and video collections — they have no description field.

### 3. Agent calls `lumenclip_collection_add_assets`

**In**

```json
{
  "collectionId": "hdb-resale-chart-screenshots",
  "assets": [
    { "httpsUrl": "https://example.com/chart-1.png", "caption": "Q1 resale index" }
  ],
  "requestId": "collection-hdb-add-001"
}
```

Between 1 and 80 assets per call. Every `httpsUrl` must be HTTPS — the schema rejects
`http://` explicitly. Each asset takes an optional `caption` (≤5000 chars) and `sourceUrl`.

Each URL passes an SSRF guard that resolves DNS and rejects private or reserved addresses,
then follows at most 3 redirects, all of which must stay on HTTPS.

**Out**

```json
{
  "requestId": "collection-hdb-add-001",
  "collection": { "itemCount": 1, "captionCoverage": 1 },
  "added": 1,
  "duplicates": 0,
  "failures": []
}
```

### 4. Result

The collection is selectable in any automation's format panel. Nothing is captioned unless
you ask — the MCP surface does not generate captions at all.

## UI workflow

| Step | Action | What happens |
| --- | --- | --- |
| 1 | Open `/app/collections` | Tabs **Images**, **Videos**, **Products**, **Variables** |
| 2 | Press **Create empty collection** | Creates a collection titled `Empty collection` — no name is requested |
| 3 | Or press **Add** | Opens the search modal, accessible title *Search for collection images* |
| 4 | Choose source **Pinterest** or **Pexels** | Placeholder becomes *Search Pinterest or paste a board URL…* or *Search Pexels…* |
| 5 | Press **Search**, or **Import Board** for a board URL | The board label only appears for a recognised Pinterest board URL |
| 6 | Select tiles, optionally toggle **Auto-caption** | Footer shows **Add N images** |
| 7 | Open the collection, press **Edit** to rename | Then **Save**; Enter saves, Escape reverts |
| 8 | Press **Get image captions** | Progress modal *Generating captions* |

Uploading is a dropzone in the detail view — *Drag and drop (or click to upload)*.

## Failures to check

1. **The UI never asks for a name.** There is no create dialog. **Create empty collection**
   hardcodes `Empty collection`; imports are auto-named `Pinterest - <query>`,
   `Pexels - <query>`, or `Pinterest - <last board path segment>`. Renaming happens
   afterwards in the detail view.
2. **The name is the primary key, and collisions merge silently.** Upsert matches on a
   normalised name, so pressing **Create empty collection** twice yields *one* collection.
   Importing under an existing name appends to it rather than creating a second.
3. **The UI cannot create video collections.** **Create empty collection** and **Add** render
   only on the Images tab. Video collections require `lumenclip_collection_save` with
   `mediaType: "video"`, or the import API. Conversely, MCP cannot create word or product
   collections at all.
4. **Rename disagrees across surfaces.** The UI allows it; MCP rejects it outright with
   `Renaming media collections is not supported because automation references use the collection name`.
5. **Over 80 images per import are dropped without an error.** The server slices the list at
   80. The MCP schema enforces the same limit as a validation error instead.
6. **A missing `PEXELS_KEY` does not fail.** The route returns synthetic results tagged
   `pexels-fallback`, which the UI shows as *Showing local preview results*. A missing
   `APIFY_KEY` does fail, at `500`: `APIFY_KEY is not configured`.
7. **`failures` in `add_assets` output is always empty.** Partial failures throw instead of
   being reported, and `duplicates` is inferred from the count delta — so one bad asset can
   inflate it.
8. **Three collections in the list are virtual.** `Backgrounds`, `AI UGC Avatar Videos`, and
   `Greenscreen Memes` are computed, read-only, and never returned by
   `lumenclip_collections_list`.
9. **Deleting a collection is recoverable; deleting images is not.** Collection deletion is
   soft for 30 days with an **Undo** toast. Removing selected images rewrites the collection
   without them, permanently.
10. **A referenced collection will not delete.** `lumenclip_collection_delete` requires
    `confirmDelete: true` and refuses with `Collection is referenced by N automation(s); set allowReferenced: true only after reviewing the dependencies`.
11. **The `Upload your images (PNG, JPEG up to 10MB each)` hint is unenforced.** No size check
    exists on upload; WebP, GIF, AVIF and SVG all pass. The only real byte cap is 16 MiB, and
    it applies to URL imports.

## Additional workflow notes

Collections are stored as rows in `permanent_assets` under `source_key: "image_collection"`,
not in a table named `image_collections`. Media files go to the Appwrite Storage bucket
`image_collections`.

Captioning runs through OpenRouter and needs `OPENROUTER_API_KEY`; without it the route
returns `500 Missing OPENROUTER_API_KEY`. **Auto-caption** is a two-step client sequence —
import, then a separate captions call — not a server-side flag.

Appwrite quota exhaustion is rewritten into an explicit message rather than an empty result,
so "no collections" and "rate limited" are distinguishable.

Previous: [Signing in](/docs/workflows/signing-in) ·
Next: [Creating a slideshow automation](/docs/workflows/create-slideshow-automation)
