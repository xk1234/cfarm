# 07 — Image Collection + Captioning

Build reusable image collections from Pinterest/Pexels search or by importing remote URLs, then generate AI captions. Collections feed the slideshow/automation image pools.

Entry: `/api/pinterest/search`, `/api/pexels/search`, `/api/image-collections`, `/api/image-collections/import`, `/api/image-collections/captions`, `/api/image-collections/image-actions`
Core: `lib/image-collections.ts`, `lib/realfarm-collections.ts`, `lib/pinterest-search.ts`

```mermaid
flowchart TD
    START(["User builds a collection"]) --> SOURCE{"source?"}

    SOURCE -->|Search| SEARCH["GET/POST /api/pinterest/search or /api/pexels/search"]
    SEARCH --> RESULTS["PinterestSearchResult[] (imageUrl, sourceUrl)"]
    RESULTS --> CREATE

    SOURCE -->|Import URLs| IMPORT["POST /api/image-collections/import"]
    IMPORT --> DLREMOTE["importRemoteImagesToCollection: download + store remote images"]
    DLREMOTE --> CREATE

    SOURCE -->|Upload| UPLOAD["Upload local images (objectURL)"]
    UPLOAD --> CREATE["POST /api/image-collections -> upsertImageCollection"]

    CREATE --> STORED["StoredImageCollection (image_link + caption) in 'image collections' store"]

    STORED --> CAP{"Generate captions?"}
    CAP -->|Yes| CAPREQ["POST /api/image-collections/captions"]
    CAPREQ --> LLM["OpenRouter LLM captions each image"]
    LLM --> UPDCAP["updateImageCollectionCaptions"]
    UPDCAP --> STORED

    STORED --> ACT{"Edit / upscale image?"}
    ACT -->|Yes| IMGACT["POST /api/image-collections/image-actions (mode: edit | upscale)"]
    IMGACT --> STORED

    STORED --> DONE(["Collection usable by slideshows + automations"])
```
