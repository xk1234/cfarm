# 09 — Asset Management

Create reusable media assets by upload, AI generation, or remote import, then optionally caption them. Assets are consumed by UGC ad / greenscreen video exports (workflow 11).

Entry: `/api/assets` (GET), `/api/assets/upload`, `/api/assets/generate`, `/api/assets/reference-import`, `/api/assets/caption`
Core: `lib/assets.ts`, `lib/asset-storage.ts`, `lib/kie-image.ts`

```mermaid
flowchart TD
    START(["User adds an asset"]) --> KIND{"how?"}

    KIND -->|Upload file| UP["POST /api/assets/upload"]
    UP --> STORE1["persistAsset: store binary (Appwrite Storage + data/ tree)"]
    STORE1 --> REC

    KIND -->|AI generate| GEN["POST /api/assets/generate"]
    GEN --> MODEL["Image model (KIE) generates media"]
    MODEL --> STORE2["persistAsset"]
    STORE2 --> REC

    KIND -->|Import remote| IMP["POST /api/assets/reference-import"]
    IMP --> DLR["Download remote URL"]
    DLR --> STORE3["persistAsset"]
    STORE3 --> REC["AssetRecord (kind, source, scope, category) in 'assets' store"]

    REC --> CAP{"Caption it?"}
    CAP -->|Yes| CAPREQ["POST /api/assets/caption -> LLM caption"]
    CAPREQ --> REC
    CAP -->|No| LIST["GET /api/assets?scope=&category=&kind="]
    REC --> LIST
    LIST --> DONE(["Asset available to video exports"])
```
