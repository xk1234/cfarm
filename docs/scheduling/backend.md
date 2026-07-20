---
title: "Backend scheduling"
description: "When active automations generate, when outputs are posted, and how Appwrite scheduler and worker jobs execute reliably."
---

Backend scheduling converts a live automation's local posting times into
owner-scoped Appwrite jobs. The scheduler decides **which slot needs work**;
the worker decides **how the output is generated and delivered**. Production
scheduling does not depend on the Next.js web process remaining online.

For the user-facing calendar, see [Schedule page](./). For externally published
outputs, see [Manual publication and linking](./manual-linking).

## Timing at a glance

| Automation and mode | Generation starts | Posting behavior |
| --- | --- | --- |
| Slideshow, `auto` | Normally 30 minutes before the target slot. | The worker uploads media and creates a PostFast `SCHEDULED` post for the exact target slot. |
| Slideshow, `manual` | Normally 30 minutes before the target slot. | The output becomes `awaiting_manual_post`; it is not published automatically. |
| Slideshow, `review` | 30, 60, 120, 240, or 720 minutes before the slot, using `generation_lead_minutes`. | The output becomes `ready_for_review`; it is not published automatically. |
| X or Threads | At the due slot in the current scheduler path. | A supported single post can auto-publish when configured. Multi-post threads remain drafts unless publication records prove otherwise. |
| Manual **Generate** button | Immediately, outside the recurring scheduler. | The result is unpublished and has no automatic publication date. |

The target slot remains the authoritative `scheduledFor` timestamp even when
generation starts earlier. A five-minute scheduler cadence and ten-minute
lookback recover a recently missed invocation.

## End-to-end lifecycle

```text
Live automation + timezone + posting times
  -> automation-scheduler (every 5 minutes)
  -> deterministic run-automation or run-x-automation job
  -> jobs table (queued / processing / completed / dead)
  -> job-worker (every 2 minutes, one job per invocation)
  -> generated output + durable run record
  -> auto: PostFast schedule at the exact slot
     review: ready_for_review
     manual: awaiting_manual_post
  -> Schedule page and analytics attribution
```

## Which automations are eligible

Only records with top-level `status: "live"` are read by the cloud scheduler.
The slot engine also treats `schedule.paused: true` as paused. The normal
product control is the automation card's Live/Pause switch.

A schedule stores an IANA timezone and one or more local posting-time rows:

```json
{
  "timezone": "Asia/Singapore",
  "posting_times": [
    { "time": "11:00 AM", "days": ["Mon", "Wed", "Fri"] },
    { "time": "7:30 PM", "days": ["Tue", "Thu"] }
  ],
  "paused": false,
  "jitter_minutes": 0
}
```

The stored time is interpreted in that timezone and converted to an exact UTC
timestamp. The current UI supports up to five posting-time rows. A disabled row
is ignored, although the current editor does not expose a per-row enabled
switch.

## Slot computation

`lib/automation-slots.ts` is the canonical implementation bundled into the
deployed scheduler. For each requested calendar day it:

1. resolves the IANA timezone;
2. matches posting rows to the local weekday;
3. parses supported 12- or 24-hour time formats;
4. creates the local datetime and converts it to UTC;
5. removes duplicates and sorts the results;
6. applies optional deterministic jitter.

The projection scan is capped at 370 days. `jitter_minutes` shifts a slot by a
stable value, so repeated reads do not move it. `min_gap_minutes` is normalized
but is not currently enforced; configure posting rows far enough apart.

The legacy interval schedule remains readable for migrated records, while the
current editor writes explicit posting-time rows.

## Scheduler function

`automation-scheduler` is configured in `appwrite.json`:

| Setting | Current value |
| --- | --- |
| Cron | `*/5 * * * *` |
| Timeout | 120 seconds |
| Lookback | 10 minutes |
| Slideshow generation lead | 30 minutes, except configured review lead |

Each invocation pages through live `automations` and `x_automations`, restores
the owner, calculates due slots, and enqueues a small identity payload:

```json
{ "automationId": "…", "scheduledFor": "2026-07-20T03:00:00.000Z" }
```

It does not copy the full automation into the job. The worker reloads the
owner-scoped source of truth when it executes.

Slideshow dedupe keys are `auto:{automationId}:{slotISO}`. X/Threads keys are
`x-auto:{automationId}:{slotISO}`. A SHA-256-derived row ID makes repeated
scheduler passes receive an Appwrite conflict instead of creating duplicate
jobs.

## Queue and worker

The durable `jobs` table stores handler type, status, payload, attempts,
availability, priority, dedupe key, lease ownership, and `owner_id`.

| Setting | Current value |
| --- | --- |
| Worker cron | `*/2 * * * *` |
| Batch | 1 job per invocation |
| Timeout | 900 seconds |
| Lease | 960,000 ms (16 minutes) |
| Scheduler-created attempts | 3 by default |

The worker claims due queued jobs by priority and availability. It only checks
expired processing leases when no queued job exists. After claiming, it
re-reads the row and proceeds only while it still owns the lease.

Failures are requeued with exponential backoff capped at one hour. After
`max_attempts`, the job becomes `dead` and can emit a Telegram alert when both
Telegram variables are configured.

## Slideshow execution and posting

The slideshow run lifecycle is:

```text
accepted -> generating -> generated
  -> posted (auto with integrations)
  -> ready-for-review (review)
  -> awaiting-manual-post (manual)
  -> failed
```

The run ID is deterministic from `automationId + scheduledFor`. Retries reuse
terminal runs, and auto-publishing checks each integration for an existing
scheduled or published record before calling PostFast again. This prevents a
retry for one failed account from duplicating another account's successful
post.

The worker fails rather than silently substituting missing automations,
collections, generated copy, render output, or provider credentials. Image
slideshows render with Sharp and store PNGs in Appwrite Storage. Video exports
use Rendi.

`manual` and `review` describe the publication decision, not a provider-free
path: with active integrations, the scheduled worker still uploads generated
media to PostFast and therefore requires `POSTFAST_API_KEY`.

## X and Threads behavior

X/Threads schedules enqueue `run-x-automation` at the due slot without the
slideshow lead window. Publishing follows the automation configuration.
PostFast does not expose reply-chain publishing like a single post, so a
multi-post thread must be treated as an unpublished draft unless durable
publication records explicitly report scheduled or published status.

## Required function variables

| Variable | Required when |
| --- | --- |
| `APPWRITE_API_KEY` | Always; requires TablesDB and Storage scopes. |
| `APPWRITE_DATABASE_ID` | Optional database override; defaults to `cfarm`. |
| `OPENROUTER_API_KEY` | Slideshow copy, AI image matching, or scheduled X/Threads generation. |
| `POSTFAST_API_KEY` | Any active social integration, including scheduled manual/review uploads. |
| `RENDI_API_KEY` | The automation requests video export. |
| `DEEPL_KEY` | Translation is requested. |
| `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` | Manual/review reminders or dead-job alerts; configure both together. |

Appwrite injects the function endpoint and project ID. Function scopes and
non-secret defaults are declared in `appwrite.json`.

## Local development and deployment

`pnpm dev` ensures the shared Appwrite stack is available and runs the scheduler
and worker entrypoints in-process. Do not start the deprecated per-repository
compose stack or stop the shared machine stack when development ends.

Before deploying function changes:

```bash
pnpm appwrite:check-shared
node appwrite/functions/deploy.mjs
```

Verify a non-production slot by checking one deduped job, worker completion,
owner-scoped run/output records, exact PostFast target time for `auto`, and a
`needs_action` record without provider publication for manual/review. Retrying
must not create another provider post.

## Troubleshooting

| Symptom | Likely cause or check |
| --- | --- |
| Planned slot never becomes a job | Automation is not live, is paused, has the wrong timezone/time, or the scheduler is not deployed. |
| Duplicate projection and job | Compare exact UTC slot, automation ID, and migrated schedule values. |
| Job stays queued | Check `available_at`, worker deployment, and queue depth; the batch is one. |
| Job stays processing | Check function execution and `leased_by`/`leased_until`; stale leases are reclaimed after queued work. |
| Job dead-letters | Inspect the job error, run error, collections, provider keys, and render output. |
| Auto output generated but was not scheduled | Check active integrations, per-account publication records, PostFast response, and `POSTFAST_API_KEY`. |
| Review output appears too late | Increase `generation_lead_minutes` and inspect queue depth. |
| Two posting times are too close | `min_gap_minutes` is not enforced; space the rows manually. |

## Source map

- Schedule schema and modes: `lib/realfarm-automation.ts`
- Posting-time editor: `components/realfarm/automation-settings/schedule-settings.tsx`
- Slot computation: `lib/automation-slots.ts`
- Scheduler: `appwrite/functions/automation-scheduler/src/main.js`
- Worker and retry logic: `appwrite/functions/job-worker/src/main.js`
- Slideshow execution: `appwrite/functions/job-worker/src/slideshow-automation.js`
- Function cadence and variables: `appwrite.json`
