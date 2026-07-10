# Cfarm → Appwrite Migration — Completion Report

Migrated **2026-07-10** to Appwrite Cloud project `Cfarm` (`6a503d670029246bca10`), region `sgp`.

## What was done

**Schema.** Created TablesDB database `cfarm` with **18 tables** (uniform columns `rid, name, status, created_raw, source_key, ord, data(longtext)` + `idx_rid` index) and **9 storage buckets** (`music, image_collections, greenscreen, characters, slideshows, ugc_videos, backgrounds, assets, misc`, 512 MB max file size).

**Structured data.** All JSON stores migrated to rows — **498 rows total**, verified equal to source array lengths:
image_collections 88, characters 1, character_generations 12, assets 167, automations 4, automation_runs 3, automation_templates 27, automation_template_runs 158, results 3, usage_ledger 26, word_collections 5, generated_video_exports 1, realfarm/seeds/automation_templates_raw 1 each (empty: slideshows, postfast_posts, swipes). Row order preserved via the `ord` column.

**Binary assets.** All **7,827 files / 4.0 GB** uploaded to buckets (0 failures). File ids are deterministic — `sha256(path-relative-to-data/).slice(0,36)` — so the app derives them at runtime with no lookup table. Verified: bucket file counts equal source (image_collections 7275, music 156, assets 145, greenscreen 132, slideshows 60, backgrounds 30, characters 17, ugc_videos 7, misc 5).

## Code changes (app now runs on Appwrite)

- `lib/appwrite.ts` — server-side Appwrite client (TablesDB + Storage), gated on env.
- `lib/appwrite-stores.ts` — store→table registry, deterministic row/file id + bucket helpers.
- `lib/json-store.ts` — same public API; mapped stores read/write TablesDB (paginated reads ordered by `ord`, upsert-by-id writes, delete-removed), **filesystem fallback** for any unmapped/dynamic store and local dev.
- `app/api/local-assets/[...assetPath]/route.ts` — serves bytes from Appwrite Storage (with range support), falling back to the filesystem. Assets stay private (served through the app via the server key).
- `lib/asset-storage.ts` — new `persistAsset()` / `mirrorAssetToAppwrite()`: writes a binary to the local `data/` tree (pipelines still read these as working files) **and** uploads it to Appwrite Storage at the same deterministic id, replacing on re-generation. No-op when Appwrite is unconfigured.
- Asset **write** sites wired through it: generic remote-asset downloader (`lib/local-asset-download.ts`, used by many pipelines), asset upload + generated-asset (`lib/assets.ts`), image-collection imports (`lib/image-collections.ts`), music upload route, character image upload route, character workflow video downloads, Rendi-rendered video output (`lib/rendi-ffmpeg.ts`), locally-rendered slideshow video + thumbnail (`lib/slideshows.ts`), and swipe screenshots + remote media (`lib/swipes.ts`, incl. delete cleanup via `deleteAssetFromAppwrite`).
- `app/api/swipes/assets/[file]/route.ts` — serves swipe assets from Appwrite Storage first (bucket `misc`), with filesystem fallback.
- `lib/swipes.ts` — the `swipes.json` store (previously written directly to disk as a root array) now reads/writes through `json-store`, so swipe records persist to the `swipes` table.
- `lib/automation-runner.ts` — `readImageCollections` now reads via `json-store` (the `image_collections` table) instead of a direct file read.
- `.env` — added `APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY / APPWRITE_DATABASE_ID`.
- `package.json` — added `node-appwrite`.

## Verification

- `tsc --noEmit`: 0 errors.
- Unit tests (fs-fallback path): all passing across json-store, stores, and API routes.
- Live end-to-end through real app code: reads return migrated data in source order, counts match, write round-trips with no data loss, and real referenced asset URLs resolve to the correct uploaded files.
- Live asset write path: `persistAsset` writes locally and mirrors to Appwrite, and replaces the stored file when the same path is re-generated.

## Follow-ups / notes

1. **Rotate `APPWRITE_API_KEY`** (and the Supabase/Notion tokens pasted in chat). Update `.env` after rotating.
2. **Reconcile the lockfile.** `node-appwrite` was added to `package.json`; run `pnpm install` to update `pnpm-lock.yaml` (it was copied into `node_modules` directly for this session).
3. **`realfarm.json`** is read by bespoke code (not `json-store`) and still reads from the filesystem; a copy exists in the `realfarm` table if you want to cut it over too.
4. **All mutable stores + asset read/write paths now go through Appwrite.** Every JSON store (incl. swipes) reads/writes via `json-store` (TablesDB), and every asset serving route + write site goes through Appwrite Storage (`/api/local-assets`, `/api/swipes/assets`). Local `data/` copies are kept intentionally as working files for filesystem-dependent code (ffmpeg, sharp, directory scans). Slideshow intermediate frames (SVG/PNG) stay local by design.

5. **Static config imports stay bundled (by design).** `data/realfarm.json` and `data/seeds/demo-realfarm.json` are read-only `import` statements compiled into the app (brand config + demo seeds), not a mutable database — converting them to async Appwrite fetches would ripple through the whole call tree for no benefit. Copies exist in the `realfarm`/`seeds` tables if you ever want to switch. The directory-scan asset reader in `lib/realfarm-data.ts` reads local files, which remain fully populated.
6. Keep the local `data/` folder as backup until you've run the app against Appwrite and signed off.
7. `appwrite-docs` MCP remains down server-side (Appwrite's hosted endpoint); unrelated to this migration.

## Test status note

The repo already had uncommitted WIP changes and some **pre-existing failing tests unrelated to this migration** — e.g. `lib/text-similarity.test.ts`, `components/ui/button-style-contract.test.ts`, `lib/slideshows.test.ts` (layout/metadata assertions), and `app/api/automations/run/route.test.ts`. These fail identically with the original pre-migration code (verified by reverting the relevant change), so they are not caused by the Appwrite work. All storage-layer tests (json-store, stores, asset routes, swipes) pass, and `tsc --noEmit` is clean.
