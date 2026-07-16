# Greenscreen Memes Tab

Route key: `greenscreen`

Component: `GreenscreenMemesView` in `components/realfarm/greenscreen-view.tsx`

## Functionality

Compose a meme by combining a caption, a local greenscreen (chroma-key) video, and a background, previewed live on a canvas. Exports **persist** as generated video records and can be scheduled to social channels.

Main actions:

- Pick a greenscreen video + background and edit the caption.
- Preview the chroma-keyed composite on a `<canvas>`.
- Export — persists a `GeneratedVideoExport` (type `"greenscreen"`) with a queued → ready lifecycle.
- Browse the exports grid (paged, `memePageSize = 32`).
- Schedule an export to PostFast from the exports list.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `GeneratedVideoExport[]` (type `greenscreen`) | `useGeneratedVideoExports` (`generated_video_exports` table) | The "My Videos" grid (count is live, not hardcoded). |
| Greenscreen clips / backgrounds | `greenscreen` / `backgrounds` Storage buckets + media library | Composition inputs. |

## Persistence

Exports persist as `GeneratedVideoExport` records in the `generated_video_exports` table via `createGeneratedVideoExportRecord(...)`; rendered files land in the `ugc_videos` / `greenscreen` Storage buckets. Appwrite is authoritative — no filesystem fallback.

## Hardcoded / Demo Behavior

- Caption styling defaults and the canvas chroma-key threshold are fixed defaults.
- `drawAvatarPlaceholder` renders a demo frame only when no clip is selected.
