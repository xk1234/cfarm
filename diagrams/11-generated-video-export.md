# 11 — Generated Video Export (Greenscreen / UGC Ad)

Queue and produce greenscreen-meme or UGC-ad video exports. New exports enter a queue with a stable position; on completion they flip to ready and reconcile against asset records by URL.

Entry: `/api/generated-videos` (GET/POST/PATCH/DELETE)
Core: `lib/generated-videos.ts`, `lib/assets.ts`

```mermaid
flowchart TD
    START(["User requests an export (greenscreen | ugc_ad)"]) --> CREATE["POST /api/generated-videos -> createGeneratedVideoExport"]
    CREATE --> QUEUE["Insert as 'queued' with stable queuePosition"]
    QUEUE --> REC["GeneratedVideoExport (sourceConfig) in 'generated videos' store"]

    REC --> PROC["Processing picks up export"]
    PROC --> PATCH1["PATCH /api/generated-videos -> status: processing"]
    PATCH1 --> RENDER["Render/compose video from sourceConfig"]
    RENDER --> RESULT{"success?"}
    RESULT -->|No| FAIL["PATCH status: failed + error, clear queuePosition"]
    RESULT -->|Yes| READY["PATCH status: ready (previewUrl, videoUrl), clear queuePosition"]

    READY --> RECON["Reconcile against AssetRecord by URL match"]
    FAIL --> STORE
    RECON --> STORE["'generated videos' store"]
    STORE --> PUB{"Publish?"}
    PUB -->|Yes| SEND["-> workflow 10 (PostFast upload + post)"]
    PUB -->|No| DONE(["Export ready in queue UI"])
    SEND --> DONE
```
