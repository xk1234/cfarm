# 09 — Asset management

Create reusable asset records by upload or configured generation, edit captions,
and serve their bytes through the Storage-backed compatibility URL.

Entry: `/api/assets`, `/api/assets/upload`, `/api/assets/generate`,
`/api/assets/caption`, `/api/local-assets/**`

Core: `lib/assets.ts`, `lib/asset-storage.ts`, `lib/appwrite-stores.ts`

```mermaid
flowchart TD
    START(["User adds an asset"]) --> KIND{"Source"}

    KIND -->|"Upload"| UP["POST /api/assets/upload"]
    KIND -->|"Configured generation"| GEN["POST /api/assets/generate"]

    UP --> STORE["persistAsset -> Appwrite Storage"]
    GEN --> RECORD
    STORE --> RECORD["AssetRecord -> permanent_assets\nsource_key=uploaded_asset"]

    RECORD --> CAP{"Edit caption?"}
    CAP -->|"Yes"| CAPREQ["POST /api/assets/caption"]
    CAPREQ --> RECORD
    CAP -->|"No"| LIST
    RECORD --> LIST["GET /api/assets?scope=&category=&kind="]
    LIST --> USE["Automation / greenscreen / publishing input"]

    USE --> URL["GET /api/local-assets/... streams deterministic Storage file"]
```

The removed character/reference-import workflow is not part of the current
asset API. Legacy `ugc_avatar` and `reference` enum values remain in
`AssetRecord` for compatibility with existing rows.
