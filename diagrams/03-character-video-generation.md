# 03 — Character Video Generation + Post-Processing

Turn a generated character image into a video via KIE, then post-process it with micro-cuts and background music through Rendi ffmpeg. Video state is stored on the same generation record as the image.

Entry: `/api/characters/video`
Core: `lib/kie-video.ts`, `lib/character-video-postprocess.ts`, `lib/rendi-ffmpeg.ts`, `lib/character-image-generations.ts`

```mermaid
flowchart TD
    START(["User requests video from an image"]) --> POST["POST /api/characters/video"]
    POST --> KIE["Submit to KIE video model (imageUrl + prompt + model)"]
    KIE --> POLL["Poll until videoUrl ready"]
    POLL --> FAIL{"succeeded?"}
    FAIL -->|No| VERR["Set videoStatus = failed + videoError"]
    FAIL -->|Yes| RAW["rawVideoUrl captured"]

    RAW --> PP{"Post-process enabled?"}
    PP -->|No| SAVE
    PP -->|Yes| SEG["buildMicroCutSegments"]
    SEG --> MUSIC["findRandomMusicFile (data/music)"]
    MUSIC --> CMD["buildCharacterPostprocessFfmpegCommand"]
    CMD --> RENDI["Rendi ffmpeg: apply micro-cuts + mux music"]
    RENDI --> DL["Download final video"]
    DL --> SAVE["upsertCharacterImageGeneration (videoUrl, videoStatus=ready, recipe.microCuts)"]

    VERR --> STORE["character_generations store"]
    SAVE --> STORE
    STORE --> DONE(["Video available on the generation"])
```
