# LumenClip

LumenClip is a content-production and automation workspace for social slideshows, short-form video, and text posts. It combines reusable media collections, scheduled automation, X/Threads generation, PostFast publishing, a content calendar, and analytics in a Next.js app backed by Appwrite.

## Stack

| Layer     | Technology                                                                        |
| --------- | --------------------------------------------------------------------------------- |
| Framework | Next.js 16.2.6 (App Router)                                                       |
| UI        | React 19.2.4 · TypeScript · Tailwind CSS v4 · shadcn · Radix · AG Grid · Recharts |
| Backend   | Appwrite Cloud in production · self-hosted Appwrite for local development         |
| Runtime   | Node 22 functions · pnpm 10                                                       |
| Testing   | vitest 4                                                                          |
| Tooling   | prettier · eslint · Geist Mono / Inter (see `DESIGN.md`)                          |

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in Appwrite keys + any providers you use
pnpm dev               # starts local Appwrite + workers + Next.js
```

### Scripts

| Command                                | Description                                                           |
| -------------------------------------- | --------------------------------------------------------------------- |
| `pnpm env:check`                       | Verify required environment variables are present                     |
| `pnpm dev`                             | Start local Appwrite, workers, and the Next.js dev server             |
| `pnpm dev:web`                         | Start only Next.js without checking or starting the backend           |
| `pnpm appwrite:local:setup`            | Resync the cloud schema into local Appwrite                           |
| `pnpm appwrite:local:sync-automations` | Explicitly copy missing cloud automations into local Appwrite         |
| `pnpm appwrite:local:sync-reference`   | Copy cloud image collections and referenced files into local Appwrite |
| `pnpm build`                           | Production build                                                      |
| `pnpm start`                           | Start the production server                                           |
| `pnpm lint`                            | Run eslint                                                            |
| `pnpm test`                            | Run the vitest suite                                                  |
| `pnpm format`                          | Prettier-write all `.ts/.tsx`                                         |
| `pnpm typecheck`                       | `tsc --noEmit`                                                        |

### Environment

Required to run: the four `APPWRITE_*` keys (endpoint, project id, api key, database id) and `OPENROUTER_API_KEY` (slideshow/text generation). See `.env.example` for the full list — KIE, Rendi, PostFast, Pexels, DeepL, Apify, DataForSEO, OpenAI, and FAL keys are optional providers wired only when their features are used.

## Project structure

```
app/                     Next.js App Router: pages, API routes, global styles
components/realfarm/      App UI: navigation + per-tab views (home, collections,
                         automations, greenscreen, schedule, analytics…)
components/ui/           shadcn component library
lib/                     Domain logic, API clients, persistence layer, tests
appwrite/functions/      Appwrite Functions (cron scheduler + job worker)
data/                    Local working files + static config seeds
docs/                    Feature and architecture docs
diagrams/                Mermaid workflow diagrams (00-overview → 11)
scripts/                 Provisioning, import, and maintenance tools
```

## Backend — Appwrite

LumenClip runs on Appwrite Cloud (legacy project ID `cfarm`, region `sgp`, endpoint `https://sgp.cloud.appwrite.io/v1`).

- **TablesDB** database `cfarm` stores owned application data, consolidated permanent assets, generated outputs, and output media.
- **Storage** holds source media and generated assets. Asset file ids are deterministic (`sha256(path).slice(0,36)`).
- **Persistence layer** — `lib/json-store.ts` reads and writes Appwrite TablesDB. There is no mutable filesystem fallback; local development reads the migrated automation-template catalog from local Appwrite.
- **Functions** — `automation-scheduler` (cron `*/5 * * * *`) computes which automations are due and enqueues deduped jobs; `job-worker` (every two minutes) drains the `jobs` table with a leased-claim queue and runs rendering/generation/publishing work. See `docs/scheduling.md` for the queue model.

Local `data/` files are limited to bundled seeds and working files for filesystem-dependent code (ffmpeg, sharp, directory scans); slideshow intermediate frames (SVG/PNG) stay local by design.

**Local development.** `pnpm dev` ensures the machine-wide shared Appwrite stack is running, verifies the `cfarm-local` project, starts both job processes, and launches Next.js. Schema setup is separate from user data; `pnpm appwrite:local:sync-reference` idempotently copies cloud image collections and their referenced files when needed. Full walkthrough: **`docs/reference/local-appwrite.md`**.

## Further documentation

Docs are organized by lifecycle — start at **`docs/README.md`** (index), which points to the living docs, roadmap, backend references, product tabs, and diagrams.

| Topic                                                 | File                                     |
| ----------------------------------------------------- | ---------------------------------------- |
| **Docs index (start here)**                           | `docs/README.md`                         |
| **State of the app** (current truth)                  | `docs/STATE.md`                          |
| **Roadmap** (planned/in-flight work)                  | `docs/roadmap/`                          |
| Design system (tokens, typography, components)        | `DESIGN.md`                              |
| Next.js version notes (read before writing Next code) | `AGENTS.md`                              |
| End-to-end workflow map                               | `diagrams/00-overview.md`                |
| Per-tab feature docs                                  | `docs/tabs/`                             |
| Backend architecture and persistence                  | `docs/reference/backend-architecture.md` |
| Data objects & types                                  | `docs/reference/data-objects.md`         |
| Backend endpoint inventory                            | `docs/reference/backend-endpoints.md`    |
| Scheduling & Appwrite job queue                       | `docs/scheduling.md`                     |

## Testing

`pnpm test` runs the vitest suite. Live tests in `lib/__live__/*.live.test.ts` are gated behind `RUN_LIVE=1` and may hit paid providers — they're skipped by default so the suite stays offline. Run them with `RUN_LIVE=1 pnpm test lib/__live__`. Use `pnpm typecheck` and `pnpm lint` alongside tests before opening changes.
