# Cfarm → Appwrite Migration Plan

**Target:** Appwrite Cloud project `Cfarm` (`6a503d670029246bca10`), region `sgp`, endpoint `https://sgp.cloud.appwrite.io/v1`.

**Decisions locked in (from planning):**
- **Scope:** Full — structured data *and* all binary assets.
- **Cutover:** Rewrite the app so Appwrite is the live backend (no dual-source).
- **Assets:** Migrate everything (~4 GB, 7,834 files).
- **Access:** Server-side API key only (single-user, no end-user auth).

---

## 1. Current state

Cfarm is a **Next.js 16 app with no database** — all state lives on the local filesystem under `data/`.

**Structured data** goes through one abstraction, `lib/json-store.ts`, exposing `readJsonArrayStore` / `writeJsonArrayStore` / `withJsonArrayStore` (whole-array read-modify-write with per-file locks + atomic temp-file rename + `.bak` backups). ~13 logical stores, consumed by ~30 API routes under `app/api/`:

| Store (key) | File | Notes |
|---|---|---|
| image collections (`collections`) | `data/image-collections.json` | 1.3 MB single file — largest |
| characters (`characters`) | `data/characters.json` | |
| automations (`automations`) | `data/automations/…` | |
| automation runs (`runs`) | per-automation `runs.json` | |
| results (`results`) | `data/results/…` | |
| slideshows (`slideshows`) | `data/slideshows/…` | |
| assets (`assets`) | `data/assets/items.json` | references binary files |
| character generations (`generations`) | `data/characters/…` | |
| automation templates (`templates`) | `data/automation-templates/…` | |
| usage ledger (`usage`) | `data/usage-ledger.json` | |
| postfast posts (`posts`) | `data/postfast-posts.json` | |
| swipe / word-collection items (`items`) | `data/swipes/…`, `data/word-collections/…` | |
| realfarm config (`realfarm.json`) | `data/realfarm.json` | object, not array |

**Binary assets** — 4.0 GB, 7,834 files, served through `/api/local-assets/[...assetPath]` and helpers in `lib/assets.ts` / `lib/local-asset-download.ts` (`publicAssetUrl`, `localAssetFilePath`, `writeLocalAsset`):

| Folder | Size | | Folder | Size |
|---|---|---|---|---|
| music | 1.6 GB | | slideshows | 61 MB |
| image-collections | 1.9 GB | | ugc_avatar_videos | 58 MB |
| greenscreen_memes | 228 MB | | backgrounds | 47 MB |
| characters | 71 MB | | assets | 33 MB |

File mix: 7,330 jpg, 145 png, 145 mp4, 139 mp3, 20 svg, 19 webm, 17 wav, 4 gif. Largest files are music, up to **115 MB**.

---

## 2. Target architecture on Appwrite

**One TablesDB database** (`cfarm`) with one **table per store**. Modeling strategy:

- **Collections of items** (image collections, characters, automations, runs, results, slideshows, assets, generations, templates, usage, posts, items) → **one row per array element**. A handful of first-class, indexed columns actually used in queries (`$id`/`id`, `created_at`, `name`, `status`, and per-table key fields), plus a single `data` string column holding the full original JSON object for fidelity. This preserves every field without hand-modeling deep/heterogeneous nesting, while still allowing indexed queries on the columns that matter.
- **Small singleton configs** (`realfarm.json`) → a single row (or a key/value table).

> **Why not store each whole file as one blob row:** Appwrite caps string-attribute / row size, and `image-collections.json` is 1.3 MB — it would risk the limit and kills query/pagination. Per-row is the right call.

**Storage** — buckets grouped by asset domain (keeps per-bucket file counts and permissions sane):

- `music`, `image-collections`, `greenscreen`, `characters`, `slideshows`, `ugc-videos`, `backgrounds`, `assets`, `misc` (ctas, generated-videos, seeds, backgrounds).
- Each migrated file gets an Appwrite `fileId`; the **old relative path → `{bucketId, fileId}` mapping** is written back onto the owning row (new columns `appwrite_bucket`, `appwrite_file_id`) and/or a dedicated `asset_map` table so URL rewriting is deterministic.
- Files >5 MB (all music, many videos) use the SDK's **chunked upload** automatically.

**Access:** server-side only. All reads/writes use the API key from server code (API routes / server actions). Bucket + table permissions set to no public access; the app is the only client. No Appwrite Auth users.

---

## 3. Code rewrite strategy

The leverage point is that ~30 routes touch data through **one interface**. Plan:

1. **Keep the `json-store.ts` public signatures**, swap the internals to Appwrite TablesDB. Add a registry mapping `(rootDir, fileName, key)` → `(databaseId, tableId)`. This makes most of the 30 routes work unchanged.
   - Caveat: `withJsonArrayStore`'s whole-array read-modify-write semantics change to per-row ops. Where a route only appends/updates/deletes single items, rewrite it to per-row `createRow`/`updateRow`/`deleteRow` for correctness and concurrency (no more whole-file lock). This is the main per-route work and will be done store-by-store.
2. **Replace asset helpers** — `publicAssetUrl` → Appwrite `getFileView`/`getFileDownload` URL; `writeLocalAsset` → `storage.createFile`; `localAssetFilePath` reads → fetch by `fileId`. Retire `/api/local-assets` or turn it into a thin redirect to Appwrite URLs.
3. **Config** — add `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID` to `.env`; add `node-appwrite` (server SDK) to deps; a single `lib/appwrite.ts` client factory.
4. **Tests** — the repo already has `*.test.ts` next to most stores/routes. Point them at a test database/bucket (or mocked client) and keep them green through the swap.

---

## 4. Migration execution (data load)

One-time loaders, run per store:

1. Provision database, tables (with columns + indexes), and buckets via the Appwrite MCP / a setup script.
2. For each JSON store: read the file(s), transform each record → row, `createRow` in batches (respect rate limits, retry on 429).
3. For each asset folder: walk files, `createFile` (chunked for big ones), capture `fileId`, and record `path → fileId` in the map.
4. Second pass: rewrite asset references inside migrated rows to Appwrite `fileId`s using the map.
5. **Verify:** row counts == source array lengths; file counts + total bytes per bucket == source; spot-check a sample of rows and asset URLs render.

---

## 5. Prerequisites & blockers (action needed before build)

1. **Paid plan / storage quota — HARD BLOCKER.** 4 GB exceeds Appwrite Cloud's free tier (~2 GB). Confirm the `Cfarm` org is on a plan that covers ≥4 GB storage *and* the per-file limit clears the 115 MB music files. Nothing that touches assets can proceed until this is set.
2. **Rotate leaked secrets.** The Appwrite API key, Supabase token, and Notion token pasted in chat should be revoked/reissued. Migration will use a fresh scoped Appwrite key.
3. **`appwrite-docs` MCP** is down server-side (Appwrite's hosted endpoint returns 404/400) — not required for the migration; ignore or remove from config.
4. **Music copyright/size sanity check.** 1.6 GB of music is 40% of the payload and the source of every >30 MB file. Confirm it genuinely needs to live in Appwrite vs. staying external — not a blocker, just worth a look given cost/quota.

---

## 6. Proposed phases

- **Phase 0 — Prereqs:** confirm plan/quota, rotate keys, create scoped API key, add SDK + client config.
- **Phase 1 — Schema:** create database, all tables (columns + indexes), and buckets. Non-destructive; reversible.
- **Phase 2 — Data load (structured):** migrate the 13 JSON stores to rows; verify counts.
- **Phase 3 — Asset load:** migrate 7,834 files to buckets (chunked), build path→fileId map, rewrite row references; verify counts/bytes.
- **Phase 4 — Code cutover:** swap `json-store.ts` internals + asset helpers; rewrite per-route where whole-array semantics don't map; keep tests green.
- **Phase 5 — Verify & retire:** end-to-end app smoke test against Appwrite; keep `data/` as backup until sign-off, then archive.

---

## 7. Open design decisions (my recommendation in **bold**, non-blocking)

- Row modeling: per-row + `data` blob column (**recommended**) vs. full hand-modeled columns.
- Bucket layout: one bucket per asset domain (**recommended**) vs. a single mega-bucket.
- `/api/local-assets`: retire in favor of direct Appwrite URLs (**recommended**) vs. keep as a proxy.
