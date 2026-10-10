# LumenClip

LumenClip is a content-production and automation workspace for social slideshows, short-form video, and text posts. It combines reusable media collections, scheduled automation, X/Threads generation, PostFast publishing, a content calendar, and analytics in a Next.js app backed by Railway PostgreSQL and private S3-compatible storage.

## Stack

| Layer     | Technology                                                                        |
| --------- | --------------------------------------------------------------------------------- |
| Framework | Next.js 16.2.6 (App Router)                                                       |
| UI        | React 19.2.4 · TypeScript · Tailwind CSS v4 · shadcn · Radix · AG Grid · Recharts |
| Backend   | Appwrite Cloud (TablesDB + Storage) · Railway web + worker · Clerk authentication |
| Runtime   | Node 22 functions · pnpm 10                                                       |
| Testing   | vitest 4                                                                          |
| Tooling   | prettier · eslint · Geist Mono / Inter (see `DESIGN.md`)                          |

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in APPWRITE_*, Clerk keys, and providers you use
pnpm dev:web           # starts the Next.js development server
```

### Scripts

| Command                                | Description                                                           |
| -------------------------------------- | --------------------------------------------------------------------- |
| `pnpm env:check`                       | Verify required environment variables are present                     |
| `pnpm dev`                             | Run environment checks and start the Next.js development server       |
| `pnpm dev:web`                         | Start only Next.js without environment checks                         |
| `pnpm appwrite:provision`              | Create/verify the Appwrite tables, indexes and buckets (idempotent)   |
| `pnpm appwrite:check`                  | Fail (exit 2) when Appwrite drifts from `lib/data/appwrite/schema.mjs` |
| `pnpm worker`                          | Run the background job worker (long-running)                          |
| `pnpm build`                           | Production build                                                      |
| `pnpm start`                           | Start the production server                                           |
| `pnpm lint`                            | Run eslint                                                            |
| `pnpm test`                            | Run the vitest suite                                                  |
| `pnpm format`                          | Prettier-write all `.ts/.tsx`                                         |
| `pnpm typecheck`                       | `tsc --noEmit`                                                        |

### Environment

Required to run: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` and the Clerk keys. See `.env.example` for the full list; SocialBu, Pexels and Apify keys are optional and only enable their features.

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

## Backend — Appwrite Cloud data, Railway compute

Appwrite Cloud holds all data and files; Railway runs the web app and the
worker; Clerk owns browser identity and sessions.

- **Data** — TablesDB database `lumenclip` (`specs`, `renders`, `collections`,
  `media`, `posts`, `workspace_settings`, `notifications`, `api_keys`, `jobs`,
  `job_leases`). The schema lives in `lib/data/appwrite/schema.mjs`; apply it
  with `pnpm appwrite:provision`. Feature code uses `getRepositories()` from
  `@/lib/data` with an explicit workspace id (the Clerk user id).
- **Files** — private buckets `media` (uploads, collection images) and
  `renders` (rendered slides). Files are served only by the ownership-checked
  `/api/files/[bucket]/[id]` route, by short-lived signed URLs from
  `repos.blobs.signedUrl`, or through HMAC share links.
- **Worker** — `pnpm worker` (Railway `worker` service, `railway.worker.json`)
  claims jobs from the `jobs` table with atomic lease rows, renews leases while
  handlers run, and sweeps due notifications and scheduled posts. Handlers are
  registered in `lib/jobs/handlers.ts`.
- **Tests** run on in-memory repositories and never contact Appwrite.

**Local development.** Point `APPWRITE_*` at the shared local stack
(`http://localhost:9080/v1`) or a dev project, run `pnpm appwrite:provision`,
then `pnpm dev:web` and, for background jobs, `pnpm worker`.

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

`pnpm e2e` runs the Playwright suite (`e2e/`) against `pnpm dev` on port 3917 with in-memory repositories and the local e2e auth seam (`lib/e2e-auth.ts`): `LUMENCLIP_DATA_BACKEND=memory` plus `LUMENCLIP_E2E_USER_ID` signs every request in as that user without Clerk, and `POST /api/e2e/seed` loads fixture collections and a finished render. The seam is off whenever `NODE_ENV=production` or the backend is Appwrite. `E2E_BROWSER_CHANNEL=chrome` uses the installed Chrome instead of downloading Chromium; `E2E_REUSE_SERVER=1` attaches to an already running e2e dev server.
