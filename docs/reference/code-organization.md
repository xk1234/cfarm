---
title: "Code organization"
description: "Ownership and dependency rules for LumenClip application code and supporting runtimes."
---

# Code organization

LumenClip is a modular monolith with several execution surfaces: the Next.js
web application, Railway worker and scheduler, Windmill workflows, MCP, and a
browser extension. Organize authored code by product feature first and runtime
adapter second. Do not add new business logic to the root of `lib/`.

## Source ownership

```text
app/                  Next.js routes, layouts, loading and error boundaries
features/<feature>/   Product capability owned as one vertical slice
  domain/             Serializable types and pure business rules
  server/             Server-only queries, repositories and use-case loaders
  ui/                 Client and presentational React components
features/workspace/   Shared authenticated workspace shell
components/ui/        Product-agnostic UI primitives
lib/                  Existing shared and legacy modules being migrated
services/             Railway worker and scheduler entrypoints
windmill/             Windmill source, manifest and generated workspace files
infra/                Migrations and deployment infrastructure
scripts/              Explicit maintenance, migration and generation commands
appwrite/             Legacy import and rollback material only
```

Tests live beside the source they exercise. Generated Windmill output is never
an ownership boundary and must be reproduced from checked-in source.

## Dependency direction

```text
app routes -> feature UI -> feature domain
     |              |
     +------> feature server -> shared infrastructure -> providers
```

- Route files authenticate, parse route state, load data, and compose a screen.
- Server Components read directly from feature server modules.
- Client Components receive serializable initial data and own interaction only.
- Route handlers are HTTP adapters for public APIs, webhooks, polling, uploads,
  or clients that cannot invoke a Server Action.
- Feature domain modules never import routes, React UI, or server adapters.
- Server modules never import UI merely to reuse a type. Move that contract to
  the owning `domain/` directory instead.
- Cross-feature imports should target another feature's domain contract or an
  explicit application API, never its internal UI.

ESLint enforces the most important reverse-dependency restrictions.
`pnpm lint:architecture` additionally rejects static production dependency
cycles and reverse domain/server imports. Shared serializable shapes belong in
small `*-contract.ts` modules so persistence, runtime, and UI code do not import
one another merely for types.

## Route ownership

Every stable workspace URL owns its data and screen composition. Shared chrome
belongs in a layout or `features/workspace/ui`; it does not justify a client
component that switches between unrelated screens. Home, Templates,
Collections, Composer, Analytics, and Schedule now own stable routes and screen
composition. Collections remains a compact reference implementation:

```text
app/app/collections/page.tsx
app/app/collections/[id]/page.tsx
features/collections/domain/
features/collections/server/
features/collections/ui/
```

When migrating another screen, preserve its URL and behavior, move its contract
and UI together, provide initial reads from its Server Component, and then
remove the corresponding branch from the legacy workspace controller.

## Naming

Use current product concepts in new paths. Avoid new `realfarm`, `appwrite`,
`temp`, or provider-specific names for generic product behavior. Compatibility
files may keep an old name temporarily, but new imports should use the canonical
feature path and the compatibility layer should have an explicit removal plan.

## Planned progression

Workflow Runs is the next route-level slice to migrate. Templates now owns its
route and server loader, while its large client controller remains a deliberate
transitional module to split by editor capability. MCP and Windmill registries
should be divided only along stable workflow/domain contracts. Moving the whole
repository under `src/` is a final mechanical step after those boundaries are
stable, not a prerequisite for them.

The web app and authored Windmill source have separate compiler gates:

```bash
pnpm typecheck
pnpm typecheck:windmill
pnpm lint:architecture
```

The generated `windmill/f/lumenclip/workflow_stage_runtime.ts` bundle is checked
by `pnpm windmill:check`; do not edit it directly.
