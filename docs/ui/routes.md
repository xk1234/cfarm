---
title: Browser routes
description: Current browser pages and the access boundary for each route.
---

## Public product pages

| Route        | Source                   | Access | Purpose              |
| ------------ | ------------------------ | ------ | -------------------- |
| `/`          | `app/page.tsx`           | Public | Marketing home       |
| `/privacy`   | `app/privacy/page.tsx`   | Public | Privacy policy       |
| `/terms`     | `app/terms/page.tsx`     | Public | Terms                |

## Account flows

| Route          | Source                                | Access | Purpose                    |
| -------------- | ------------------------------------- | ------ | -------------------------- |
| `/login/**`    | `app/login/[[...login]]/page.tsx`     | Public | Clerk sign-in and recovery |
| `/sign-up/**`  | `app/sign-up/[[...sign-up]]/page.tsx` | Public | Clerk account creation     |

An authenticated visitor to `/login` or `/sign-up` is redirected to `/app`.

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
| `/app/collections`          | `app/app/collections/page.tsx`          | Workspace session | Direct Collections workspace entry      |
| `/app/collections/[id]`     | `app/app/collections/[id]/page.tsx`     | Workspace session | Collection detail                       |

The canonical workspace destinations use `/app?view=<key>`, with `home`,
`schedule`, or `collections` as the key. The direct Collections pages are route
entries that initialize the same workspace surface.
