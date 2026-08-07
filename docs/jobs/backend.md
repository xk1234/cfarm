---
title: "Template generation jobs"
description: "Manual template runs, worker execution, and the publishing boundary."
---

Templates no longer have recurring generation schedules. The
`template-scheduler` entrypoint is intentionally disabled and returns a zero-job
result without reading the templates table. Keeping the entrypoint temporarily
allows deployed scheduler configuration to be removed without an unsafe gap or
an old binary continuing to enqueue work.

## Generation lifecycle

```text
Generate button / MCP / POST /api/templates/run
  -> claim one manual run
  -> text agent plans slide count and design sequence
  -> generate text and choose media
  -> render and store draft
  -> preview + ZIP + Telegram generation-complete notification
```

Every template run is manual and immediate. Its completed output is unpublished
and has no automatic publication date. The runner ignores legacy template
account bindings, forces `publishMode: manual`, and does not upload draft media
to PostFast.

## Publishing is post-processing

Publishing and scheduling a completed output remain supported from the output
viewer and output publication API. That flow selects accounts and an optional
future provider time after the generation exists. Those publication records can
appear on the workspace Schedule page, but they do not cause another template
generation.

## Queue and worker

The durable `jobs` table still supports explicit asynchronous jobs such as UGC
generation and provider publication. The worker claims queued jobs by priority
and availability, retries transient failures with bounded backoff, and marks
exhausted jobs dead. None of those queues are populated from a template cadence.

## Source map

- Manual run API: `app/api/templates/run/route.ts`
- Slideshow runner: `lib/automation-runner.ts`
- Disabled scheduler: `appwrite/functions/template-scheduler/src/main.js`
- Worker: `appwrite/functions/job-worker/src/main.js`
- Output publication: `components/realfarm/automation-settings/slideshow-publication-actions.tsx`
