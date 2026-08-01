---
title: "Data dictionary"
description: "Field-level data structures grouped by application domain."
---

# Data dictionary

Application data is classified into six domain groups. Each group has one page containing a
field-level table for every object. Every table uses the same columns: **Field**, **Type**,
**Example**, and **Description**.

| Group | Contains | Reference |
| --- | --- | --- |
| Persistence | Physical Appwrite rows, consolidated records, and dedicated tables | [Persistence and physical records](persistence.md) |
| Workspace and assets | Runtime workspace data, media, image/word/product collections, and assets | [Workspace, collections, and assets](workspace-assets.md) |
| Automations | Slideshow, video, UGC, and X/Threads automation definitions and nested configuration | [Automation definitions](automations.md) |
| Generation outputs | Runs, plans, results, slideshows, exports, and X/Threads drafts | [Generation runs and outputs](generation-outputs.md) |
| Publishing and analytics | Social integrations, publications, calendar items, and metric snapshots | [Publishing, calendar, and analytics](publishing-analytics.md) |
| Operations and access | Jobs, usage ledger entries, workspace members, and demo metadata | [Operations and access](operations-access.md) |

## Reading the tables

- Optionality and allowed values are included in the field description.
- ISO timestamps use ISO 8601 strings, for example `2026-08-01T09:00:00.000Z`.
- Appwrite projections use `snake_case`; domain objects normally use `camelCase`.
- Examples illustrate shape and format. They are not defaults unless the description says so.
- TypeScript definitions under `lib/` remain the executable source of truth.

Architecture, routes, and local infrastructure remain separate because they describe system
behavior rather than object fields:

- [Backend architecture](backend-architecture.md)
- [Backend endpoints](backend-endpoints.md)
- [Local Appwrite](local-appwrite.md)
