---
title: "LumenClip documentation"
---

The same documentation is rendered inside the application at `/docs` using
Fumadocs. `docs/index.mdx` is the site landing page and `meta.json` files define
sidebar order; the Markdown files in this directory remain the source of truth.

Start here. Documentation is organized by lifecycle first, then by the question
you are trying to answer.

## Fast paths

| Question                                   | Canonical document                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| What does the app do today?                | [STATE.md](STATE.md)                                                                     |
| What is planned or incomplete?             | [roadmap/](roadmap/index.mdx)                                                            |
| What reusable content assets exist?        | [assets/greenscreen-memes.md](assets/greenscreen-memes.md)                               |
| How do I use the main Automations page?    | [automations/index.mdx](automations/index.mdx)                                           |
| How do I edit a slideshow automation?      | [automations/slideshow-automations.mdx](automations/slideshow-automations.mdx)           |
| How do hook locking and analytics work?    | [automations/hook-catalog-and-analytics.mdx](automations/hook-catalog-and-analytics.mdx) |
| How do I complete a product workflow?      | [workflows/index.mdx](workflows/index.mdx)                                               |
| What agent workflows are proposed for MCP? | [workflows/mcp/index.md](workflows/mcp/index.md)                                         |
| What are the exact MCP tool contracts?     | [../mcp/README.md](../mcp/README.md)                                                     |
| How is the backend put together?           | [reference/backend-architecture.md](reference/backend-architecture.md)                   |
| What data structures and tables exist?     | [reference/data-objects.md](reference/data-objects.md)                                   |
| What backend endpoints exist?              | [reference/backend-endpoints.md](reference/backend-endpoints.md)                         |
| What frontend components exist?            | [components/index.md](components/index.md)                                               |
| Which libraries does the project use?      | [reference/libraries.md](reference/libraries.md)                                         |
| What browser and server routes exist?      | [routes/index.md](routes/index.md)                                                       |
| How do auth and workspace ownership work?  | [reference/auth-and-multitenancy.md](reference/auth-and-multitenancy.md)                 |
| How does analytics work per platform?      | [analytics/overall.md](analytics/overall.md)                                             |
| What collection types and CRUD exist?      | [collections/overview.md](collections/overview.md)                                       |
| How do I use the Schedule page?            | [scheduling/index.mdx](scheduling/index.mdx)                                             |
| When do scheduled jobs generate and post?  | [scheduling/backend.md](scheduling/backend.md)                                           |
| How do I link a manually published post?   | [scheduling/manual-linking.md](scheduling/manual-linking.md)                             |
| How do I run the full stack locally?       | [reference/local-appwrite.md](reference/local-appwrite.md)                               |
| How is production deployed?                | [reference/deployment.md](reference/deployment.md)                                       |
| How are automation templates structured?   | [reference/automation-templates.md](reference/automation-templates.md)                   |
| What should I test in the browser?         | [reference/browser-test-workflows.md](reference/browser-test-workflows.md)               |

## Documentation lifecycle

Every document belongs to one of these categories:

| Location                         | Lifecycle                           | Rule                                                                                                  |
| -------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `docs/STATE.md`, `docs/roadmap/` | Living                              | Keep current whenever product state or priorities change.                                             |
| `docs/reference/`                | Evergreen implementation reference  | Describe shipped behavior only. Update with code changes.                                             |
| `docs/tabs/`                     | Evergreen product-surface reference | One file per current navigation view. Delete when the view is removed.                                |
| `docs/assets/`                   | Living asset catalog                | Document reusable greenscreen and music media consumed by product workflows.                          |
| `docs/automations/`              | Evergreen product guide             | Keep editors, templates, renderer experiments, screenshots, and visible behavior aligned with the UI. |
| `docs/collections/`              | Evergreen collection reference      | Keep type contracts, CRUD support, lifecycle rules, and automation usage aligned with shipped code.   |
| `docs/workflows/`                | Task-oriented living guides         | Group by creating content, importing outside content, and analyzing/exporting data.                   |
| `mcp/`                           | MCP tool reference                  | Organize tools by app use case; every tool needs one primary owner with input and output contracts.   |
| `diagrams/`                      | Current workflow diagrams           | Describe implemented flows only; planned diagrams belong with their roadmap item.                     |

Do not keep removed-feature documentation as an archive inside the repo. Git
history is the archive.

## Living product documents

- [STATE.md](STATE.md) — current views, subsystems, infrastructure, gaps, and
  known inconsistencies.
- [roadmap/](roadmap/index.mdx) — Now/Next/Later roll-up plus concrete active
  work pages and audited backlogs.
- [workflows/](workflows/) — screenshot-backed user workflows grouped by task
  family, plus the proposed [MCP tool families](workflows/mcp/).

These are the only documents intended to summarize the entire product.

## Backend and architecture references

Read in this order when changing server behavior:

1. [Backend architecture](reference/backend-architecture.md) — layers,
   persistence boundaries, logical-to-physical store map, output/publication
   model, Storage, providers, and source-of-truth rules.
2. [Data structures](reference/data-objects.md) — serialized domain contracts,
   relationships, lifecycle meanings, and legacy structures.
3. [Backend endpoints](reference/backend-endpoints.md) — all current route files
   and method handlers, inputs, responses, and lifecycle status.
4. [Authentication and multitenancy](reference/auth-and-multitenancy.md) —
   sessions, owner scoping, public/shareable categories, and team access.
5. [Schedule page](scheduling/index.mdx) — calendar states, filters, item
   details, screenshots, rescheduling, and cancellation.
6. [Backend scheduling](scheduling/backend.md) — posting times, due slots,
   jobs, worker claims, retries, and publishing.
7. [Local Appwrite](reference/local-appwrite.md) — one-command local stack and
   schema/reference synchronization behavior.
8. [Automation templates](reference/automation-templates.md) — local Appwrite
   catalog, LinkedIn content template, and video story template.

Operational/testing reference:

- [Browser test workflows](reference/browser-test-workflows.md)

## Product-surface references

These mirror the current `ViewKey` navigation registry:

| View              | Reference                                                  |
| ----------------- | ---------------------------------------------------------- |
| Home              | [tabs/home.md](tabs/home.md)                               |
| Greenscreen Memes | [assets/greenscreen-memes.md](assets/greenscreen-memes.md) |
| Schedule          | [tabs/schedule.md](tabs/schedule.md)                       |
| Analytics         | [tabs/analytics.md](tabs/analytics.md)                     |
| Automations       | [tabs/automations.md](tabs/automations.md)                 |
| Collections       | [tabs/image-collections.md](tabs/image-collections.md)     |

The slide testing center is an internal debug surface and is documented in the
backend endpoint inventory, not as a product tab.

## Active roadmap

| Status   | Initiative                                                    | Scope                                                                   |
| -------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 🔴 Now   | [Appwrite read reduction](roadmap/appwrite-read-reduction.md) | Reduce row-read volume and billing risk.                                |
| ⚪ Later | [LumenClip MCP server](roadmap/lumenclip-mcp-server.md)       | Harden the deployed remote agent interface over shared domain services. |

The status roll-up in [roadmap/](roadmap/index.mdx) is authoritative.

## Workflow diagrams

[diagrams/00-overview.md](../diagrams/00-overview.md) is the entry point.
Current detailed flows:

- [04 — Slideshow render](../diagrams/04-slideshow-render.md)
- [05 — Automation import](../diagrams/05-automation-import.md)
- [06 — Automation scheduled run](../diagrams/06-automation-scheduled-run.md)
- [07 — Image collection and captioning](../diagrams/07-image-collection.md)
- [09 — Asset management](../diagrams/09-asset-management.md)
- [10 — Social publishing](../diagrams/10-social-publishing.md)
- [11 — Generated video export](../diagrams/11-generated-video-export.md)

## Repository-level references

- [README.md](../README.md) — setup, scripts, stack, and project structure.
- [DESIGN.md](../DESIGN.md) — design tokens and component conventions.
- [AGENTS.md](../AGENTS.md) — Next.js version rule; read before changing Next
  code.
- [e2e/README.md](../e2e/README.md) — automated browser-test setup.
- [mcp/README.md](../mcp/README.md) — MCP tool reference organized by
  app use case, with a complete tool ownership index.

## Maintenance checklist

When a code change alters behavior:

1. Update `STATE.md` if product capability or a known gap changes.
2. Update the relevant backend reference for routes, objects, tables, buckets,
   workers, auth, or providers.
3. Update the matching `tabs/**` file for visible workflows.
4. Update or remove affected diagrams.
5. Update `roadmap/` if planned work moved state.
