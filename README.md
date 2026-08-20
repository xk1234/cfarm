# LumenClip

LumenClip is a content-production workspace for social slideshows, short-form video, and text posts. It combines reusable media collections, scheduled templates, X/Threads generation, PostFast publishing, a content calendar, and analytics in a Next.js app backed by Railway PostgreSQL and object storage.

## Stack

| Layer     | Technology                                                                        |
| --------- | --------------------------------------------------------------------------------- |
| Framework | Next.js 16.2.6 (App Router)                                                       |
| UI        | React 19.2.4 · TypeScript · Tailwind CSS v4 · shadcn · Radix · AG Grid · Recharts |
| Backend   | Railway PostgreSQL · private S3-compatible object storage                         |
| Runtime   | Railway web, worker, and scheduler services · Node 22 · pnpm 10                   |
| Testing   | vitest 4                                                                          |
| Tooling   | prettier · eslint · Geist Mono / Inter (see `DESIGN.md`)                          |

## Getting started

```bash
pnpm install
cp .env.example .env   # configure Railway, Clerk, and providers
pnpm dev               # starts the Next.js development server
```

### Scripts

| Command                     | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| `pnpm env:check`            | Verify required environment variables                    |
| `pnpm dev` / `pnpm dev:web` | Start the Next.js development server                     |
| `pnpm railway:db:migrate`   | Apply checked-in PostgreSQL migrations                   |
| `pnpm railway:worker`       | Run the native Railway notification worker               |
| `pnpm railway:scheduler`    | Run the disabled scheduler service during its retirement |
| `pnpm windmill:generate`    | Regenerate Windmill flows and the native runtime bundle  |
| `pnpm build`                | Production build                                         |
| `pnpm lint`                 | Run ESLint                                               |
| `pnpm lint:architecture`    | Check dependency direction and production cycles         |
| `pnpm test`                 | Run the Vitest suite                                     |
| `pnpm typecheck`            | Run TypeScript without emitting                          |
| `pnpm typecheck:windmill`   | Typecheck authored Windmill source and dependencies      |

### Environment

The web runtime requires `DATABASE_URL`, Railway bucket credentials, and Clerk
keys. Provider keys are required only for the features that use them. Appwrite
credentials are accepted only by explicit migration and rollback tools.

## Project structure

```
app/                     Next.js App Router: pages, API routes, global styles
features/                Feature-owned domain, server, and UI modules
components/realfarm/     Workspace UI awaiting migration into feature owners
components/ui/           Shared UI primitives
lib/                     Shared and legacy modules awaiting feature migration
services/                Native Railway worker and scheduler entrypoints
appwrite/functions/      Legacy rollback-only Appwrite function sources
data/                    Local working files + static config seeds
docs/                    Feature and architecture docs
scripts/                 Provisioning, import, and maintenance tools
```

New business logic belongs in `features/<feature>/`, not the root of `lib/`.
See `docs/reference/code-organization.md` for dependency and route-ownership
rules.

## Backend — Railway

Railway PostgreSQL is the runtime source of truth. Domain records retain stable
row identities in `domain_records`, while the native `jobs` table provides
atomic leased claims with `FOR UPDATE SKIP LOCKED`. Source media and generated
assets live in the private Railway bucket under deterministic object keys.

The scheduler is disabled because template generation is manual. The worker
handles explicit notification jobs; generation workflows execute in Windmill.
Appwrite code remains only for one-way migration and rollback.

Local `data/` files are limited to bundled seeds and working files for filesystem-dependent code (ffmpeg, sharp, directory scans); slideshow intermediate frames (SVG/PNG) stay local by design.

**Local development.** `pnpm dev` starts Next.js and expects Railway-compatible
PostgreSQL and bucket configuration. It does not start Appwrite or background
workers.

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
| Railway worker and durable job queue                  | `docs/jobs/backend.md`                   |

## Testing

`pnpm test` runs the vitest suite. Database-backed integration tests require a local `DATABASE_URL` or an explicit `LUMENCLIP_TEST_DATABASE_URL`; destructive helpers refuse an unmarked remote Railway database. Live tests in `lib/__live__/*.live.test.ts` are gated behind `RUN_LIVE=1` and may hit paid providers. Run them with `RUN_LIVE=1 pnpm test lib/__live__`. Use `pnpm typecheck` and `pnpm lint` alongside tests before opening changes.
