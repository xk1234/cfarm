# cfarm

cfarm is a content-production and automation workspace for character-driven social video. It pairs an AI character editor (image + video generation), a swipe-research tool, an automation engine that turns templates into scheduled, auto-published slideshows, and an asset library — all run through a Next.js app backed by Appwrite Cloud.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router) |
| UI | React 19.2.4 · TypeScript · Tailwind CSS v4 · shadcn · Radix · AG Grid · Recharts |
| Backend | Appwrite Cloud — TablesDB (`cfarm`) + Storage buckets + cron Functions |
| Runtime | Node 22 functions · pnpm 10 |
| Testing | vitest 4 |
| Tooling | prettier · eslint · Geist Mono / Inter (see `DESIGN.md`) |

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in Appwrite keys + any providers you use
pnpm env:check         # validates required env (runs automatically before dev)
pnpm dev               # http://localhost:3000
```

### Scripts

| Command | Description |
|---|---|
| `pnpm env:check` | Verify required environment variables are present |
| `pnpm predev` | Runs env:check automatically before `dev` |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run eslint |
| `pnpm test` | Run the vitest suite |
| `pnpm format` | Prettier-write all `.ts/.tsx` |
| `pnpm typecheck` | `tsc --noEmit` |

### Environment

Required to run: the four `APPWRITE_*` keys (endpoint, project id, api key, database id) and `OPENROUTER_API_KEY` (slideshow/text generation). See `.env.example` for the full list — KIE, Rendi, PostFast, Pexels, DeepL, Apify, DataForSEO, OpenAI, and FAL keys are optional providers wired only when their features are used.

## Project structure

```
app/                     Next.js App Router: pages, API routes, global styles
components/realfarm/      App UI: navigation + per-tab views (home, characters,
                         collections, automations, schedule, swipes, analytics…)
components/ui/           shadcn component library
lib/                     Domain logic, API clients, persistence layer, tests
appwrite/functions/      Appwrite Functions (cron scheduler + job worker)
extension/               Browser extension for swipe capture (load unpacked)
data/                    Local working files + static config seeds
docs/                    Feature and architecture docs
diagrams/                Mermaid workflow diagrams (00-overview → 11)
workflows/               Swipe-capture QA workflows per platform
scripts/                 Provisioning, import, and evaluation tools
```

## Backend — Appwrite

cfarm runs on Appwrite Cloud (project `Cfarm`, region `sgp`, endpoint `https://sgp.cloud.appwrite.io/v1`).

- **TablesDB** database `cfarm` — 18 tables. Structured stores live in rows shaped `rid, name, status, created_raw, source_key, ord, data(longtext)`; the `data` column carries the JSON blob and `ord` preserves original array order.
- **Storage** — 9 buckets (music, image_collections, greenscreen, characters, slideshows, ugc_videos, backgrounds, assets, misc). Asset file ids are deterministic (`sha256(path).slice(0,36)`), so callers derive them at runtime with no lookup table.
- **Persistence layer** — `lib/json-store.ts` exposes `readJsonArrayStore` / `writeJsonArrayStore` / `withJsonArrayStore`; mapped stores read/write TablesDB (paginated by `ord`, upsert-by-id) with a **filesystem fallback** for unmapped/dynamic stores and local dev. `lib/asset-storage.ts` writes binaries to the local `data/` tree and mirrors them to Appwrite Storage at the same id.
- **Functions** — `automation-scheduler` (cron `*/5 * * * *`) computes which automations are due and enqueues deduped jobs; `job-worker` (every minute) drains the `jobs` table with a leased-claim queue and runs rendering/generation/publishing work. See `docs/appwrite-scheduling.md` for the queue model.

Local `data/` copies are kept intentionally as working files for filesystem-dependent code (ffmpeg, sharp, directory scans); slideshow intermediate frames (SVG/PNG) stay local by design.

## Browser extension

`extension/` is an unpacked Chrome extension ("CFarm Swipe Saver") that captures ad/creative swipes from supported platform surfaces. Platform adapters cover Facebook Ads Library, TikTok, TikTok Creative Center, TikTok Seller SG, Google Ads, and Google Ads Transparency Center. Saved swipes persist to the `swipes` table and render in the Swipes tab.

See `workflows/README.md` for per-platform QA workflows and `docs/extension/` for per-adapter notes.

## Further documentation

Docs are organized by lifecycle — start at **`docs/README.md`** (index), which points to the two living docs and the `reference/` · `proposals/` · `archive/` split.

| Topic | File |
|---|---|
| **Docs index (start here)** | `docs/README.md` |
| **State of the app** (current truth) | `docs/STATE.md` |
| **Roadmap** (planned/in-flight work) | `docs/ROADMAP.md` |
| Design system (tokens, typography, components) | `DESIGN.md` |
| Next.js version notes (read before writing Next code) | `AGENTS.md` |
| End-to-end workflow map | `diagrams/00-overview.md` |
| Per-tab feature docs | `docs/tabs/` |
| Extension adapter notes | `docs/extension/` |
| Data objects & types | `docs/reference/data-objects.md` |
| Appwrite scheduling & job queue | `docs/reference/appwrite-scheduling.md` |
| Swipe-capture QA workflows | `workflows/README.md` |

## Testing

`pnpm test` runs the vitest suite. Live tests in `lib/__live__/*.live.test.ts` are gated behind `RUN_LIVE=1` and hit paid APIs (OpenRouter, KIE, Rendi, Firecrawl) — they're skipped by default so the suite stays offline. Run them with `RUN_LIVE=1 pnpm test lib/__live__`. Use `pnpm typecheck` and `pnpm lint` alongside tests before opening changes.
