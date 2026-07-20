---
title: API routes
description: How the route-handler catalog is maintained and consumed.
---

The canonical method-by-method inventory is [Backend endpoints](../reference/backend-endpoints.md).
It records request inputs, response behavior, authentication, and whether an
endpoint is current, internal, or compatibility-only.

## Route families

| Family                                                                              | Responsibility                                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/api/auth/**`                                                                      | Registration, sessions, and verification                          |
| `/api/automations/**`                                                               | CRUD, hooks, copy generation, manual runs, and run listing        |
| `/api/slideshows/**`, `/api/results`, `/api/generated-videos/**`                    | Output review, editing, lifecycle, and export records             |
| `/api/image-collections/**`, `/api/word-collections/**`, `/api/product-collections` | Reusable automation inputs                                        |
| `/api/assets/**`, `/api/local-assets/**`, `/api/media-library`                      | Uploaded and reusable media                                       |
| `/api/calendar/**`, `/api/analytics/**`                                             | Schedule projections and metric snapshots                         |
| `/api/postfast/**`                                                                  | Connected accounts, uploads, publishing, and provider analytics   |
| `/api/x-automations/**`                                                             | X/Threads strategy, discovery, generation, images, and publishing |
| `/api/settings/**`                                                                  | Team and reusable demo videos                                     |
| `/api/search`                                                                       | Public read-only Fumadocs search index                            |
| `/api/debug/**`, `/api/temp/**`                                                     | Internal diagnostics and testing                                  |

## Handler conventions

- Prefer `withHandler()` and `parseJson()` from `lib/api.ts` for consistent
  input and error handling.
- Validate dynamic IDs and owner-scope every persistent read or write.
- Return named top-level fields rather than exposing raw Appwrite documents.
- Use multipart requests only for file uploads; JSON is the default.
- Provider errors should be translated to stable 502/503 responses without
  leaking credentials or raw upstream bodies.
- Update the endpoint reference whenever a method, path, payload, response, or
  access rule changes.
