---
title: "Deployment"
description: "Production topology, environment boundaries, deployment order, and smoke checks for LumenClip."
---

# Deployment

LumenClip is a dynamic Next.js application. Deploy it as a Node-compatible
Next.js service (Vercel is the simplest target), not as a static export. API
route handlers, session authentication, the Appwrite server SDK, proxy
authorization, and dynamic workspace pages all require a server runtime.

Production has two independently deployed execution surfaces:

1. **Next.js web application** — marketing, authentication, workspace, docs,
   and authenticated API routes.
2. **Appwrite Functions** — `automation-scheduler` claims due slots and
   `job-worker` performs generation, rendering, and publishing.

The web deployment does not replace the Appwrite Function deployment.

## Runtime requirements

- Node.js 22
- pnpm 10 (`packageManager` is pinned in `package.json`)
- Appwrite Cloud project and `cfarm` database
- A production Appwrite API key kept server-side
- Provider credentials for the product capabilities being enabled

The default Next.js commands are production-ready:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

No custom output directory is required. Do not run `pnpm dev` in production;
that command intentionally starts the shared local Appwrite workflow.

## Environment boundaries

Set these on the **Next.js deployment**:

| Variable                         | Requirement                   | Purpose                                                           |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `APPWRITE_ENDPOINT`              | Required                      | Cloud Appwrite API endpoint; never a localhost URL in production  |
| `APPWRITE_PROJECT_ID`            | Required                      | Production Appwrite project                                       |
| `APPWRITE_API_KEY`               | Required, secret              | Server-side TablesDB, Storage, Teams, and Users access            |
| `APPWRITE_DATABASE_ID`           | Required                      | Defaults to `cfarm`                                               |
| `OPENROUTER_API_KEY`             | Required for generation       | Slideshow and social-copy generation                              |
| `POSTFAST_API_KEY`               | Required for publishing       | Connected accounts, scheduling, publishing, and analytics         |
| `RENDI_API_KEY`                  | Required for video export     | FFmpeg rendering service                                          |
| `KIE_KEY`                        | Required for image generation | KIE image generation                                              |
| `DEEPL_KEY`                      | Optional                      | Translation                                                       |
| `APIFY_KEY`                      | Optional                      | Trend and source discovery                                        |
| `PEXELS_KEY`                     | Optional                      | Pexels collection import                                          |
| `ENABLE_LOCAL_AUTOMATION_WORKER` | Keep `false`                  | Local-only analytics polling loop                                 |
| `ENABLE_INTERNAL_TOOLS`          | Keep `false`                  | `/debug` and testing-center APIs are 404 in production by default |

Only variables explicitly prefixed with `NEXT_PUBLIC_` may reach browser
bundles. This application currently requires no public provider credential.

The Appwrite Function variables are documented separately in
[Backend scheduling](../scheduling/backend). The deploy script forwards only
variables available in its invoking environment.

## Deployment order

1. Apply or verify the production Appwrite schema and Storage buckets.
2. After introducing the consolidated stores, preview and apply the additive
   legacy-data migration:

   ```bash
   pnpm appwrite:migrate-consolidated -- --env-file=.env
   pnpm appwrite:migrate-consolidated -- --env-file=.env --apply
   ```

3. Confirm generated worker modules are synchronized:

   ```bash
   pnpm appwrite:check-shared
   ```

4. Deploy Appwrite Functions when scheduler or worker code changed:

   ```bash
   node appwrite/functions/deploy.mjs
   ```

5. Create a preview web deployment with the production-equivalent environment.
6. Run the smoke checks below against the preview URL.
7. Promote the verified artifact to production.

## Appwrite console configuration

Before the first public deployment:

- Add the production web hostname as an Appwrite Web platform.
- Add preview hostnames only when preview authentication is intentionally
  supported.
- Keep API-key scopes limited to the server operations used by the app and
  Functions.
- Confirm email-verification links resolve to the deployed hostname.
- Never copy `.env.local`; it points at the shared local Appwrite instance.

## Required pre-deploy checks

Run from a clean install with production-equivalent secrets:

```bash
pnpm env:check
pnpm appwrite:check-shared
pnpm lint
pnpm test
pnpm build
```

The production build must finish static generation for the docs catalog. The
slideshow-template docs read Appwrite at build time, so build credentials and
network access are required.

## Preview smoke test

Verify at minimum:

- `/`, `/product`, `/pricing`, and `/docs` return 200 without authentication.
- `/app` redirects to `/login` without a valid session.
- Registration, login, logout, and email verification use secure cookies.
- An authenticated workspace can list templates, collections, automations,
  recent runs, calendar summary, and connected social accounts.
- One non-publishing slideshow preview completes.
- One test publication completes through a non-production social account.
- `/debug`, `/api/debug/*`, and `/api/temp/testing-center/*` return 404 when
  `ENABLE_INTERNAL_TOOLS` is not enabled.
- Security headers include `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, and `Permissions-Policy`.

## Rollback

Promote immutable preview artifacts rather than rebuilding during release. If
the web deployment regresses, roll back the web artifact first. If scheduled
jobs regress, pause the affected Appwrite Function or automation definitions,
then restore the last known worker deployment. Do not point production at the
local Appwrite stack as a recovery mechanism.
