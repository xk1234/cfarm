# 09 — Asset management

Create reusable asset records by upload, edit captions, and serve their bytes
through the Storage-backed asset URL.

Entry: `/api/assets`, `/api/assets/upload`, `/api/assets/caption`,
`/api/local-assets/**`

Core: `lib/assets.ts`, `lib/asset-storage.ts`, `lib/appwrite-stores.ts`

```mermaid
flowchart TD
    START(["User adds an asset"]) --> UP["POST /api/assets/upload"]

    UP --> STORE["persistAsset -> Appwrite Storage"]
    STORE --> RECORD["AssetRecord -> permanent_assets\nsource_key=uploaded_asset"]

    RECORD --> CAP{"Edit caption?"}
    CAP -->|"Yes"| CAPREQ["POST /api/assets/caption"]
    CAPREQ --> RECORD
    CAP -->|"No"| LIST
    RECORD --> LIST["GET /api/assets?scope=&category=&kind="]
    LIST --> USE["Automation / greenscreen / publishing input"]

    USE --> URL["GET /api/local-assets/... streams deterministic Storage file"]
```

The removed placeholder-generation, character, and reference-import workflows
are not part of the current asset API.
