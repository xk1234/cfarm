---
title: "Templates and outputs"
description: "The authoring and publishing model used throughout the workspace."
---

# Templates and outputs

The workspace has three authoring objects and one publication object:

- A **template** is an editable, reusable definition. Its type is slideshow, video, or text.
- A **generation** belongs to exactly one template and records any outputs used as inputs.
- An **output** is an immutable slideshow, video, or text result. New outputs are drafts and remain composable.
- A **post** only exists after outputs cross a publish gate.

Templates do not run on a cadence and do not own social accounts. An output can be fed into
another template, combined with other outputs, or sent to a publish gate. The gate adds post-level
metadata and destinations, then creates draft, scheduled, or immediately published posts.

Legacy definition and generation rows are read through compatibility adapters during migration;
new UI and API consumers use `template` and `output` vocabulary exclusively.

## Routes

- `GET /api/templates` lists all three template types.
- `POST /api/templates` creates a slideshow, video, or text template.
- `POST /api/templates/:id/generate` generates an output and can accept `inputOutputIds`.
- `GET /api/outputs` returns a unified composable output feed.
- `POST /api/publish-gates` turns selected outputs into destination-specific posts.
- `POST /api/outputs` is rejected because outputs are generation results, not manually created posts.
