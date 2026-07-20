---
title: "Greenscreen memes"
description: "The reusable greenscreen clip library and the product workflow that consumes it."
---

Route key: `greenscreen`

Component: `GreenscreenMemesView` in `components/realfarm/greenscreen-view.tsx`

## Asset library

Greenscreen meme clips are `LocalAsset` records from the media-library
`greenscreen_memes` collection. Their compatibility URLs use the
`/api/local-assets/greenscreen_memes/**` namespace, which streams each file
from the Appwrite `greenscreen` Storage bucket.

The product displays 32 clips per picker page. A user can select a clip,
randomize it, or move between pages without copying the clip into an
automation. The same virtual library is exposed as
`collection-greenscreen-memes` when a video automation needs a reusable
greenscreen source.

## Product workflow

The Greenscreen Memes view combines a caption, one greenscreen clip, a
background from an image collection, and optional music. It previews the
chroma-keyed composite on a canvas before rendering.

Main actions:

- select or randomize the greenscreen clip and background;
- edit the caption and choose top, middle, or bottom placement;
- preview the composite and optional soundtrack;
- create a persistent `GeneratedVideoExport` with type `greenscreen`; and
- browse, delete, or schedule ready exports from **My Videos**.

## Objects used

| Object                                        | Source                                                                | Usage                            |
| --------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- |
| `GeneratedVideoExport[]` (type `greenscreen`) | `useGeneratedVideoExports` (`generated_video_exports` table)          | The **My Videos** grid.          |
| Greenscreen clips                             | `greenscreen` bucket and `greenscreen_memes` media-library collection | Reusable chroma-key foregrounds. |
| Background images                             | User-owned image collections                                          | Composite backgrounds.           |
| Music                                         | [`music`](./music) media-library collection                           | Optional render soundtrack.      |

## Persistence

Exports persist in `generated_video_exports` via
`createGeneratedVideoExportRecord(...)`. A record moves through `processing`,
`ready`, or `failed`; rendered files land in Appwrite Storage. Appwrite is
authoritative—there is no filesystem fallback.

## Fixed behavior

- Caption styling defaults and the canvas chroma-key threshold are fixed.
- The placeholder figure is a preview fallback only when no clip is selected.
