---
title: "Libraries and dependencies"
description: "Direct runtime and development libraries used by LumenClip, why they exist, and where they are used."
---

This page inventories the libraries declared directly by LumenClip. It is a
maintainer reference for deciding where functionality belongs, whether a new
dependency is necessary, and whether an existing package can be removed.

`package.json` is authoritative for direct dependency versions. `pnpm-lock.yaml`
pins the complete transitive dependency graph and should not be maintained by
hand.

## Platform foundation

| Library       | Declared version | Role in LumenClip                                                                                                            | Representative usage                      |
| ------------- | ---------------: | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `next`        |         `16.2.6` | App Router framework, route handlers, server/client component boundaries, image handling, middleware, and production builds. | `app/`, `proxy.ts`, `next.config.ts`      |
| `react`       |         `19.2.4` | Component model and client state for the workspace and documentation UI.                                                     | `components/`, `app/`                     |
| `react-dom`   |         `19.2.4` | React browser/server rendering integration used by Next.js.                                                                  | Framework runtime                         |
| `server-only` |         `^0.0.1` | Marks authentication and workspace modules that must never enter client bundles.                                             | `lib/auth.ts`, `lib/workspace-members.ts` |

The repository uses ES modules (`"type": "module"`) and pnpm
`10.12.1`. The Next.js version has project-specific conventions documented in
`AGENTS.md`; read the matching guide under `node_modules/next/dist/docs/` before
changing framework code.

## Documentation system

| Library         | Declared version | Role in LumenClip                                                              | Representative usage                                 |
| --------------- | ---------------: | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `fumadocs-core` |        `16.11.5` | Loads the documentation source tree and powers full-text documentation search. | `lib/docs-source.ts`, `app/api/search/route.ts`      |
| `fumadocs-mdx`  |         `15.2.0` | Compiles Markdown/MDX documents and defines the `docs/` source collection.     | `source.config.ts`                                   |
| `fumadocs-ui`   |        `16.11.5` | Documentation layouts, navigation, cards, and MDX presentation components.     | `app/docs/`, `mdx-components.tsx`, `app/globals.css` |

The documentation source lives in `docs/`. Folder-level `meta.json` files
control sidebar order.

## UI primitives and styling

| Library                    | Declared version | Role in LumenClip                                                                                                                                               | Representative usage                                        |
| -------------------------- | ---------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `radix-ui`                 |         `^1.6.0` | Accessible dialogs, popovers, tabs, dropdowns, and other headless primitives.                                                                                   | `components/ui/modal.tsx`, collection and settings surfaces |
| `class-variance-authority` |         `^0.7.1` | Typed visual variants for reusable UI components.                                                                                                               | `components/ui/button.tsx`                                  |
| `clsx`                     |         `^2.1.1` | Conditional class-name composition.                                                                                                                             | `lib/utils.ts`                                              |
| `tailwind-merge`           |         `^3.6.0` | Resolves conflicting Tailwind utility classes inside the shared `cn()` helper.                                                                                  | `lib/utils.ts`                                              |
| `tw-animate-css`           |         `^1.4.0` | Tailwind-compatible animation utilities.                                                                                                                        | `app/globals.css`                                           |
| `shadcn`                   |        `^4.12.0` | Component scaffolding/configuration tooling. LumenClip owns the generated components in `components/ui/`; application code does not import `shadcn` at runtime. | `components.json`, `components/ui/`                         |
| `next-themes`              |         `^0.4.6` | Theme context for Next.js/React.                                                                                                                                | `components/theme-provider.tsx`                             |
| `@tabler/icons-react`      |        `^3.44.0` | Primary icon set across the application workspace and marketing pages.                                                                                          | `components/realfarm/`, `app/`                              |
| `lucide-react`             |        `^1.22.0` | Secondary icon set used by settings, debug, and documentation components.                                                                                       | `components/x-automation-studio.tsx`, `components/docs/`    |
| `sonner`                   |         `^2.0.7` | Toast notifications, async progress, errors, and undo actions.                                                                                                  | `components/realfarm-workspace.tsx`, automation editors     |
| `react-loading-skeleton`   |          `3.5.0` | Shared skeleton loading states and base skeleton stylesheet.                                                                                                    | `components/ui/loading-skeleton.tsx`, `app/layout.tsx`      |
| `react-spinners`           |        `^0.17.0` | Compact progress indicators where a skeleton is not appropriate.                                                                                                | `components/ui/spinner.tsx`                                 |

Tailwind CSS itself is a development dependency because it runs during the
build; its generated classes are consumed by the runtime UI.

## Data fetching, validation, and time

| Library | Declared version | Role in LumenClip                                                                            | Representative usage                                                         |
| ------- | ---------------: | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `swr`   |         `^2.4.2` | Client-side request caching and revalidation for accounts, navigation badges, and analytics. | `components/realfarm/social-account-selection.tsx`, analytics and navigation |
| `zod`   |         `^4.4.3` | Runtime validation for API request payloads and selected worker inputs.                      | `lib/api.ts`, `app/api/**/route.ts`                                          |
| `luxon` |         `^3.7.2` | Time-zone-aware schedules, calendar projections, and automation slot calculations.           | `lib/automation-slots.ts`, analytics and scheduler code                      |

Native `fetch`, `URL`, and `AbortSignal` are used for HTTP plumbing. Provider
clients such as OpenRouter and PostFast are local modules under `lib/`, not
third-party SDK dependencies.

## Appwrite persistence

| Library         | Declared version | Role in LumenClip                                                                               | Representative usage                                                              |
| --------------- | ---------------: | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `node-appwrite` |        `^26.2.0` | Server-side Appwrite sessions, TablesDB rows, Storage files, functions, and deployment scripts. | `lib/appwrite.ts`, `lib/json-store.ts`, `appwrite/functions/`, deployment scripts |

The local and deployed application use the same Appwrite API contract. Local
development points at the shared machine stack described in
[Local Appwrite](/docs/reference/local-appwrite).

## Calendar, tables, and charts

| Library                     | Declared version | Role in LumenClip                                                                                                                                    | Representative usage                                             |
| --------------------------- | ---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `@fullcalendar/core`        |         `6.1.21` | FullCalendar event and view types.                                                                                                                   | `components/realfarm/content-calendar/content-calendar-view.tsx` |
| `@fullcalendar/react`       |         `6.1.21` | React renderer for the publishing calendar.                                                                                                          | `content-calendar-view.tsx`                                      |
| `@fullcalendar/daygrid`     |         `6.1.21` | Month/day-grid calendar view.                                                                                                                        | `content-calendar-view.tsx`                                      |
| `@fullcalendar/timegrid`    |         `6.1.21` | Week/day time-grid calendar views.                                                                                                                   | `content-calendar-view.tsx`                                      |
| `@fullcalendar/interaction` |         `6.1.21` | Calendar selection, drag, and event interaction support.                                                                                             | `content-calendar-view.tsx`                                      |
| `ag-grid-community`         |        `^36.0.0` | Grid engine, column definitions, styling, and table APIs.                                                                                            | `components/ui/ag-data-table.tsx`, collection tables             |
| `ag-grid-react`             |        `^36.0.0` | React integration for AG Grid.                                                                                                                       | `components/ui/ag-data-table.tsx`                                |
| `ag-charts-types`           |        `^14.0.0` | Shared AG chart type declarations used by the grid/chart toolchain.                                                                                  | Type-level dependency                                            |
| `ag-stack`                  |        `^36.0.0` | Declared AG toolchain package. No direct source import is currently present; verify whether it is still required before the next dependency cleanup. | `package.json` only                                              |
| `recharts`                  |         `^3.9.1` | Analytics charts and visual reporting.                                                                                                               | `components/realfarm/analytics/analytics-view.tsx`               |

Keep every FullCalendar package on the same exact version to avoid plugin/core
contract mismatches. AG Grid and its related packages should likewise move as a
coordinated version set.

## Media, uploads, exports, and debugging

| Library          | Declared version | Role in LumenClip                                                                                | Representative usage                                             |
| ---------------- | ---------------: | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `react-dropzone` |        `^17.0.0` | Drag-and-drop upload interaction and file-input handling.                                        | `components/ui/upload-dropzone.tsx`                              |
| `sharp`          |        `^0.34.5` | Server-side image decoding, conversion, resizing, slideshow materialization, and import scripts. | `lib/slideshows.ts`, Appwrite job worker, product import scripts |
| `jszip`          |        `^3.10.1` | Client-side ZIP creation for slideshow PNG exports.                                              | `lib/slideshow-export.ts`                                        |
| `jsoneditor`     |        `^10.4.3` | Structured JSON inspection/editing in internal debug tools.                                      | `components/debug/debug-automation-editor.tsx`                   |

Generated video encoding is handled through local provider wrappers and Rendi,
not through a direct npm video-encoding library.

## Development, build, and quality tooling

| Library                       | Declared version | Role in LumenClip                                                      | Representative usage                                |
| ----------------------------- | ---------------: | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `typescript`                  |             `^5` | Static typing, `tsc` checks, and TypeScript-aware maintenance scripts. | `tsconfig.json`, `scripts/sync-function-shared.mjs` |
| `@types/node`                 |            `^20` | Node.js API declarations.                                              | Server code, scripts, tests                         |
| `@types/react`                |            `^19` | React declarations.                                                    | TSX components                                      |
| `@types/react-dom`            |            `^19` | React DOM declarations.                                                | React rendering boundary                            |
| `@types/mdx`                  |        `^2.0.14` | MDX module declarations.                                               | Documentation compilation                           |
| `vitest`                      |         `^4.1.9` | Unit, integration, route, contract, and worker tests.                  | `*.test.ts`, `*.test.tsx`, `vitest.config.ts`       |
| `@playwright/test`            |        `^1.61.1` | Automated browser and end-to-end workflows.                            | `e2e/`, `playwright.config.ts`                      |
| `eslint`                      |             `^9` | Repository lint runner.                                                | `eslint.config.mjs`, `pnpm lint`                    |
| `eslint-config-next`          |         `16.2.6` | Next.js Core Web Vitals and TypeScript lint rules.                     | `eslint.config.mjs`                                 |
| `prettier`                    |         `^3.8.3` | Mechanical source formatting.                                          | `pnpm format`                                       |
| `prettier-plugin-tailwindcss` |         `^0.8.0` | Canonical ordering of Tailwind utility classes during formatting.      | Prettier integration                                |
| `tailwindcss`                 |             `^4` | Utility CSS compiler and design-token styling system.                  | `app/globals.css`                                   |
| `@tailwindcss/postcss`        |             `^4` | Runs Tailwind through PostCSS during Next.js builds.                   | `postcss.config.mjs`                                |

## Dependency rules

When adding or changing a library:

1. Prefer an existing project library when it already covers the requirement.
2. Add runtime packages to `dependencies`; add compilers, tests, type packages,
   and local-only tooling to `devDependencies`.
3. Use `pnpm add` or `pnpm add -D` so `package.json` and `pnpm-lock.yaml` stay in
   sync.
4. Keep framework-coupled packages aligned: Next/React/React DOM,
   FullCalendar plugins/core, and AG Grid packages.
5. Verify browser-bundle safety before importing server packages such as
   `node-appwrite`, `sharp`, or `server-only` modules from UI code.
6. Run `pnpm typecheck`, `pnpm lint`, relevant tests, and `pnpm build` after a
   dependency upgrade.
7. Update this page whenever a direct dependency is added, removed, or changes
   responsibility.

## Audit notes

- `ag-stack` is declared but has no direct repository import. Treat it as a
  cleanup candidate, not as proof that it is safe to remove; confirm AG package
  requirements and run the full verification set first.
- `shadcn` supports component generation and configuration. The checked-in UI
  components are application source and do not require runtime imports from the
  package.
- `@types/*` packages supply TypeScript declarations only and do not ship in the
  browser or server runtime.
- Provider integrations—Appwrite, PostFast, OpenRouter, KIE, Rendi, DeepL,
  Pinterest, Pexels, Apify, and FAL—are documented as services in architecture
  references. Only Appwrite currently uses a direct third-party SDK package.
