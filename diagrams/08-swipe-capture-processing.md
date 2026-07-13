# 08 — Swipe Capture + Processing

Capture competitor ads (usually via the browser extension), persist screenshots + media, then asynchronously enrich video swipes with a Whisper transcript and an LLM aesthetic analysis. Scoring/search derive ranking from the stored record.

Entry: `/api/swipes` (POST), `/api/swipes/assets/[file]`
Core: `lib/swipes.ts` (`createSwipe`, `completeSwipeProcessing`, `enrichSwipeAnalysis`), `lib/swipe-scoring.ts`, `lib/swipe-search.ts`

```mermaid
flowchart TD
    START(["Extension / UI captures an ad"]) --> POST["POST /api/swipes -> createSwipe"]
    POST --> SHOTS["saveScreenshot: ad + landing-page mobile/desktop (data URLs)"]
    SHOTS --> MEDIA{"remote media URL(s)?"}
    MEDIA -->|Yes| DL["saveRemoteMedia: download to data/swipes/assets"]
    MEDIA -->|No| REC
    DL --> REC["Write SwipeRecord (processingStatus set)"]

    REC --> VIDEO{"format == video?"}
    VIDEO -->|No| READY
    VIDEO -->|Yes| KICK["Fire-and-forget completeSwipeProcessing(id)"]
    KICK --> TRANS

    subgraph ASYNC["enrichSwipeAnalysis (async)"]
        TRANS["transcribeSwipeMedia (Whisper)"]
        TRANS --> LLM["LLM fills core_ugc_aesthetic_analysis (JSON)"]
        LLM --> UPD["updateSwipe: analysis + processingStatus=complete"]
    end

    UPD --> READY["SwipeRecord in 'swipes' store"]
    READY --> VIEW["listSwipes: filter to records with usable media"]
    VIEW --> SCORE["swipe-scoring: rankToUnit -> performance ranks"]
    SCORE --> SEARCH["swipe-search: filter / query"]
    SEARCH --> DONE(["Swipes tab"])
```
