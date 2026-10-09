# LumenClip

LumenClip is a content-production and automation workspace for social slideshows, short-form video, and text posts. It combines reusable media collections, scheduled automation, X/Threads generation, PostFast publishing, a content calendar, and analytics in a Next.js app backed by Railway PostgreSQL and private S3-compatible storage.

## Stack

| Layer     | Technology                                                                        |
| --------- | --------------------------------------------------------------------------------- |
| Framework | Next.js 16.2.6 (App Router)                                                       |
| UI        | React 19.2.4 · TypeScript · Tailwind CSS v4 · shadcn · Radix · AG Grid · Recharts |
| Backend   | Railway PostgreSQL · Railway S3-compatible assets · Clerk authentication          |
| Runtime   | Node 22 functions · pnpm 10                                                       |
| Testing   | vitest 4                                                                          |
| Tooling   | prettier · eslint · Geist Mono / Inter (see `DESIGN.md`)                          |

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL, bucket keys, and providers you use
pnpm dev:web           # starts the Next.js development server
```

### Scripts

| Command                                | Description                                                           |
| -------------------------------------- | --------------------------------------------------------------------- |
| `pnpm env:check`                       | Verify required environment variables are present                     |
| `pnpm dev`                             | Run environment checks and start the Next.js development server       |
| `pnpm dev:web`                         | Start only Next.js without environment checks                         |
| `pnpm railway:db:migrate`              | Apply checked-in PostgreSQL migrations                                |
| `pnpm build`                           | Production build                                                      |
| `pnpm start`                           | Start the production server                                           |
| `pnpm lint`                            | Run eslint                                                            |
| `pnpm test`                            | Run the vitest suite                                                  |
| `pnpm format`                          | Prettier-write all `.ts/.tsx`                                         |
| `pnpm typecheck`                       | `tsc --noEmit`                                                        |

### Environment

Required to run: `DATABASE_URL`, Railway bucket credentials, Clerk keys, and `OPENROUTER_API_KEY` (slideshow/text generation). See `.env.example` for the full list — KIE, Rendi, PostFast, Pexels, DeepL, Apify, DataForSEO, OpenAI, and FAL keys are optional providers wired only when their features are used.

## Project structure

```
app/                     Next.js App Router: pages, API routes, global styles
components/realfarm/      App UI: navigation + per-tab views (home, collections,
                         automations, greenscreen, schedule, analytics…)
components/ui/           shadcn component library
lib/                     Domain logic, API clients, persistence layer, tests
data/                    Local working files + static config seeds
docs/                    Feature and architecture docs
scripts/                 Provisioning, import, and maintenance tools
```

## Backend — Railway

Railway owns application persistence and private object storage. Clerk owns
browser identity and sessions.

- **PostgreSQL** stores owned application data, consolidated permanent assets,
  generated outputs, output media, jobs, and operational records.
- **Private bucket** holds source media and generated assets. Asset identities
  remain deterministic so existing public routes continue to work.
- **Persistence layer** — `lib/json-store.ts` reads and writes PostgreSQL
  through the Railway domain-record store. There is no mutable filesystem
  fallback.
- **Queue** — `jobs` is a leased PostgreSQL queue. The local instrumentation
  worker handles enabled maintenance jobs; Railway services own production
  scheduling and execution.

Local `data/` files are limited to bundled seeds and working files for filesystem-dependent code (ffmpeg, sharp, directory scans); slideshow intermediate frames (SVG/PNG) stay local by design.

**Local development.** `pnpm dev` checks required environment variables and
starts Next.js. Apply migrations with `pnpm railway:db:migrate`.

## Further documentation

Docs are organized by lifecycle — start at **`docs/README.md`** (index), which points to the living docs, roadmap, backend references, product tabs, and diagrams.

| Topic                                                 | File                                     |
| ----------------------------------------------------- | ---------------------------------------- |
| **Docs index (start here)**                           | `docs/README.md`                         |
| **State of the app** (current truth)                  | `docs/STATE.md`                          |
| **Roadmap** (planned/in-flight work)                  | `docs/roadmap/`                          |
| Design system (tokens, typography, components)        | `DESIGN.md`                              |
| Next.js version notes (read before writing Next code) | `AGENTS.md`                              |
| Per-tab feature docs                                  | `docs/tabs/`                             |
| Backend architecture and persistence                  | `docs/reference/backend-architecture.md` |
| Data objects & types                                  | `docs/reference/data-objects.md`         |
| Backend endpoint inventory                            | `docs/reference/backend-endpoints.md`    |
| Scheduling & job queue                                | `docs/jobs/backend.md`                   |

## Testing

`pnpm test` runs the vitest suite. Live tests in `lib/__live__/*.live.test.ts` are gated behind `RUN_LIVE=1` and may hit paid providers — they're skipped by default so the suite stays offline. Run them with `RUN_LIVE=1 pnpm test lib/__live__`. Use `pnpm typecheck` and `pnpm lint` alongside tests before opening changes.
