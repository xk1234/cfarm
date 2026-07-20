---
title: Route architecture
description: Entry points for browser pages, route handlers, documentation, and workers.
---

LumenClip uses four kinds of entry point:

| Entry point                  | Location                                                      | Runtime                              |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| Browser pages and layouts    | `app/**/page.tsx`, `app/**/layout.tsx`                        | Next.js server and client components |
| Internal JSON/media API      | `app/api/**/route.ts`                                         | Next.js route handlers               |
| Local scheduler and worker   | `scripts/dev-local.mjs`, `lib/local-automation-job-worker.ts` | Long-lived local Node process        |
| Appwrite scheduled functions | `appwrite/functions/**`                                       | Appwrite Functions runtime           |

## Request boundary

`proxy.ts` protects `/app/**` and internal `/api/**` routes with the
`lumenclip-session` cookie. Authentication handlers and the read-only docs
search endpoint are public. Ownership checks still happen inside store and
service helpers; route authentication is not a substitute for owner scoping.

## Where logic belongs

- Route handlers parse transport input, authenticate, invoke services, and map
  errors.
- Domain behavior belongs in `lib/` so workers, tests, and routes share it.
- React components call stable route contracts; they do not import server-only
  Appwrite clients.
- Scheduled generation must call the same automation runner used by manual
  generation.

See [browser routes](pages.md), [API routes](api.md), and the
[backend architecture](../reference/backend-architecture.md).
