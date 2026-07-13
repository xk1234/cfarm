# 04 — Slideshow Render

Turn a slideshow spec (slides + settings) into rendered PNG frames and, optionally, an MP4. Creates a `SlideshowRecord` and a companion `ResultRecord`. Invoked directly via `/api/slideshows` and internally by the automation run (workflow 06).

Entry: `/api/slideshows` → `createSlideshowResultRecord`
Core: `lib/slideshows.ts` (`writeSlideshowOutputs`), `lib/slideshow-renderer.ts` (`renderedSlideSvg`), `lib/rendi-ffmpeg.ts`

```mermaid
flowchart TD
    START(["createSlideshowResultRecord(input)"]) --> NORM["Normalize slides + settings -> SlideshowRecord"]
    NORM --> RESULT["createResultRecord (companion ResultRecord)"]
    RESULT --> SVG

    subgraph RENDERLOOP["writeSlideshowOutputs — per slide"]
        SVG["renderedSlideSvg: compose textItems + image + overlay"]
        SVG --> WSVG["Write SVG to temp"]
        WSVG --> PNG["renderSvgToPng via sharp -> PNG frame"]
    end

    PNG --> VIDEO{"settings.export_as_video?"}
    VIDEO -->|Yes| UPR["uploadLocalFileToRendi (PNG sequence)"]
    UPR --> ENC["encodePngSequenceToMp4ViaRendi -> runRendiFfmpegAndDownload"]
    ENC --> MP4["MP4 downloaded + thumbnail"]
    VIDEO -->|No| IMGS["Image-only output"]

    MP4 --> REASSIGN["Reassign image_url / video_url / thumbnail_url to stored URLs"]
    IMGS --> REASSIGN
    REASSIGN --> PERSIST["Persist SlideshowRecord (output_images, output_dir, status=exported)"]
    PERSIST --> DONE(["Slideshow + Result available"])
```
