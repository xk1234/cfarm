---
title: Browser routes
description: Look up every browser page and the access boundary that guards it.
---

## Public product pages

| Route        | Source                   | Access | Purpose              |
| ------------ | ------------------------ | ------ | -------------------- |
| `/`          | `app/page.tsx`           | Public | Marketing home       |
| `/product`   | `app/product/page.tsx`   | Public | Product overview     |
| `/solutions` | `app/solutions/page.tsx` | Public | Use cases            |
| `/pricing`   | `app/pricing/page.tsx`   | Public | Pricing presentation |
| `/careers`   | `app/careers/page.tsx`   | Public | Careers page         |
| `/privacy`   | `app/privacy/page.tsx`   | Public | Privacy policy       |
| `/terms`     | `app/terms/page.tsx`     | Public | Terms                |

## Account flows

| Route          | Source                     | Access | Purpose                    |
| -------------- | -------------------------- | ------ | -------------------------- |
| `/team-invite` | `app/team-invite/page.tsx` | Public | Team invitation acceptance |

Sign-in and sign-up use Clerk modals and do not have standalone routes.

## Signed generation previews

| Route                    | Source                               | Access       | Purpose                      |
| ------------------------ | ------------------------------------ | ------------ | ---------------------------- |
| `/share/slideshows/[id]` | `app/share/slideshows/[id]/page.tsx` | Signed token | Login-free slideshow preview |

The matching direct ZIP route is
`/api/public/slideshows/[id]/download?token=...`. Both paths require a valid
output-scoped token. Login-free access does not make the output enumerable.

## Documentation

| Route      | Source                          | Access | Purpose                              |
| ---------- | ------------------------------- | ------ | ------------------------------------ |
| `/docs`    | `app/docs/[[...slug]]/page.tsx` | Public | Fumadocs landing page                |
| `/docs/**` | Same catch-all route            | Public | Filesystem-backed pages from `docs/` |

The documentation layout supplies navigation, full-text search, a table of
contents, breadcrumbs, and next and previous links.

## Authenticated application

| Route                       | Source                                  | Access            | Purpose                                 |
| --------------------------- | --------------------------------------- | ----------------- | --------------------------------------- |
| `/app`                      | `app/app/page.tsx`                      | Workspace session | Main tabbed workspace                   |
| `/app/compose`              | `app/app/compose/page.tsx`              | Workspace session | Direct Compose workspace entry          |
| `/app/analytics`            | `app/app/analytics/page.tsx`            | Workspace session | Direct Analytics workspace entry        |
| `/app/analytics/posts/[id]` | `app/app/analytics/posts/[id]/page.tsx` | Workspace session | Stored post analytics                   |
| `/app/collections`          | `app/app/collections/page.tsx`          | Workspace session | Direct Collections workspace entry      |
| `/app/collections/[id]`     | `app/app/collections/[id]/page.tsx`     | Workspace session | Collection detail                       |
| `/app/testing`              | `app/app/testing/page.tsx`              | Workspace session | Redirect to the hosted testing facility |
| `/app/ugc/[id]`             | `app/app/ugc/[id]/page.tsx`             | Workspace session | UGC run status                          |
| `/app/x-automations`        | `app/app/x-automations/page.tsx`        | Workspace session | Legacy X and Threads template entry     |

The canonical workspace destinations use `/app?view=<key>`, with
`home`, `compose`, `schedule`, `analytics`, `collections`, `templates`, or
`published-posts` as
the key. The direct Compose, Analytics, and Collections pages are route entries
that initialize the same workspace surfaces. Template deep links add
`template=<id>` or `run=<id>` to the `/app?view=templates` query. Legacy
automation query parameters are normalized to the template destination.

## Internal pages

| Route                           | Source                                      | Access                    | Purpose                             |
| ------------------------------- | ------------------------------------------- | ------------------------- | ----------------------------------- |
| `/debug`                        | `app/debug/page.tsx`                        | Session and internal flag | Internal slideshow testing center   |
| `/analytics-preview/[platform]` | `app/analytics-preview/[platform]/page.tsx` | Internal flag             | Static analytics reference previews |

Internal pages are not stable product contracts. When internal tools are
disabled, these routes return not found.
