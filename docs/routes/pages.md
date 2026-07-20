---
title: Browser routes
description: Current App Router pages and their access model.
---

## Public product pages

| Route           | Source                      | Purpose                    |
| --------------- | --------------------------- | -------------------------- |
| `/`             | `app/page.tsx`              | Marketing home             |
| `/product`      | `app/product/page.tsx`      | Product overview           |
| `/solutions`    | `app/solutions/page.tsx`    | Use cases                  |
| `/pricing`      | `app/pricing/page.tsx`      | Pricing presentation       |
| `/careers`      | `app/careers/page.tsx`      | Careers page               |
| `/privacy`      | `app/privacy/page.tsx`      | Privacy policy             |
| `/terms`        | `app/terms/page.tsx`        | Terms                      |
| `/login`        | `app/login/page.tsx`        | Registration and login     |
| `/verify-email` | `app/verify-email/page.tsx` | Email verification result  |
| `/team-invite`  | `app/team-invite/page.tsx`  | Team invitation acceptance |

## Documentation

| Route      | Source                          | Purpose                              |
| ---------- | ------------------------------- | ------------------------------------ |
| `/docs`    | `app/docs/[[...slug]]/page.tsx` | Fumadocs landing page                |
| `/docs/**` | Same catch-all route            | Filesystem-backed pages from `docs/` |

The documentation layout supplies navigation, full-text search, table of
contents, breadcrumbs, and next/previous links.

## Authenticated application

| Route                | Source                           | Purpose                                  |
| -------------------- | -------------------------------- | ---------------------------------------- |
| `/app`               | `app/app/page.tsx`               | Main workspace                           |
| `/app/x-automations` | `app/app/x-automations/page.tsx` | Direct X/Threads automation studio entry |

Most product navigation inside `/app` is client state controlled by
`RealFarmWorkspace`; Home, Schedule, Analytics, Collections, and Automations are
not separate URL routes.

## Internal pages

| Route                          | Source                                              | Purpose                                    |
| ------------------------------ | --------------------------------------------------- | ------------------------------------------ |
| `/debug`                       | `app/debug/page.tsx`                                | Internal automation editor                 |
| Temporary testing center route | `components/temp/slide-testing-center.tsx` consumer | Model and slideshow generation experiments |

Internal pages are not stable product contracts and should be environment or
capability gated before public deployment.
