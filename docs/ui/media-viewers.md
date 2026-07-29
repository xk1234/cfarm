---
title: Media and viewer components
description: Preview, editing, thumbnail, and export surfaces for generated media.
---

## Viewer catalog

| Component                        | Source                                                  | Purpose                                                                        |
| -------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `SlideshowViewerModal`           | `components/realfarm/slideshow-viewer-modal.tsx`        | Reviews persisted slideshow results and supports eligible metadata/media edits |
| `GeneratedSlideshowViewerModal`  | `automation-settings/generated-slideshow-viewer.tsx`    | Reviews a slideshow created from the active automation editor                  |
| `GeneratedSlideshowFrame`        | `automation-settings/generated-slideshow-frame.tsx`     | Shared phone/frame presentation for one slideshow slide                        |
| `GeneratedAutomationVideoViewer` | `automation-settings/generated-video-viewer.tsx`        | Reviews generated automation video output                                      |
| `GeneratedVideoExportViewer`     | `automation-settings/generated-video-export-viewer.tsx` | Reviews a persisted video export                                               |
| `ImageViewerModal`               | `components/realfarm/image-viewer-modal.tsx`            | Full-screen image inspection                                                   |
| `ExampleSlideshowModal`          | `components/realfarm/example-slideshow-modal.tsx`       | Template example slideshow preview                                             |

## Thumbnail and list surfaces

- `GeneratedVideoExports` lists persisted exports and deletion eligibility.
- `GeneratedVideoThumbnail` and `useVideoThumbnailFrame` provide consistent
  thumbnail extraction.
- `TemplateGeneratedPreview` normalizes saved example runs for template cards.
- `AutomationThumb`, `SlideThumb`, `CollectionPreview`, and media-state
  components live in `shared-media.tsx`.

## Rendering contract

The browser viewers do not define the authoritative export format. Shared
settings and render calculations live in:

- `lib/slideshow-renderer.ts`
- `lib/slideshow-export.ts`
- `lib/generated-video-types.ts`
- `components/realfarm/generated-video-renderer.ts`
- `components/realfarm/generated-video-workflow.ts`

Preview, thumbnail, and export should agree on aspect ratio, image fit,
typography, line wrapping, highlight bounds, timing, and media ordering. When a
new control is added, verify all three consumers.

## Interaction rules

- Give slideshow text a safe horizontal margin in every viewer size.
- Clicking outside an inline editor closes it after applying or discarding the
  local change according to that editor's contract.
- Block destructive editing for scheduled or published outputs and explain the
  blocking state in the UI.
- A text background is a per-line highlight whose width follows the rendered
  line; it is not one fixed rectangle around the entire text box.
