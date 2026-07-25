---
title: "Scheduling posts"
description: "Turning a slideshow automation into recurring posts — the schedule model, the two cron cadences, when auto-publish actually fires, and the failures worth checking."
---

# Scheduling posts

Setting posting times so the automation generates and publishes on its own, and reading back
what is projected.

`Last tested: 2026-07-25, live against cfarm-eight.vercel.app`

## Workflow summary

### 1. User asks

> "Post this twice a day on weekdays, and publish automatically."

### 2. Agent calls `lumenclip_automation_update`

The schedule write path. There is no dedicated scheduling tool.

**In**

```json
{
  "automationId": "…",
  "schedule": {
    "timezone": "Asia/Singapore",
    "postingTimes": [
      { "time": "9:00 AM", "days": ["Mon","Tue","Wed","Thu","Fri"] },
      { "time": "6:30 PM", "days": ["Mon","Tue","Wed","Thu","Fri"], "enabled": true }
    ],
    "jitterMinutes": 10
  }
}
```

`postingTimes` is a **complete replacement list**, 1–20 entries. `time` must match
`h:mm AM/PM` or 24-hour `H:mm`. `days` uses `Mon`–`Sun`, 1–7 entries. `jitterMinutes` is
0–720. `action: "pause" | "resume"` and `expectedUpdatedAt` (optimistic lock) are also
available.

### 3. Agent calls `lumenclip_schedule_get`

**In**

```json
{ "automationId": "…", "days": 14, "includePaused": true, "limit": 100 }
```

`from` must be an ISO datetime with an offset. `days` is 1–90, default 14.

**Out** — `{ from, to, automations: [{ id, name, kind, status, updatedAt, schedule }], slots, calendarItems }`.
Slots are **computed projections**, not stored rows.

### 4. Intermediate steps

Two independent crons, at different cadences:

| Component | Cron | What it does |
| --- | --- | --- |
| `automation-scheduler` | `*/5 * * * *` | Scans live automations, enqueues a `run-automation` job per due slot |
| `job-worker` | `*/2 * * * *` | Leases a job and runs the real generation |

Generation is queued **30 minutes before** the posting time. The worker generates, uploads
media to PostFast, then branches on posting mode:

- `auto` → creates a PostFast post with `status: "SCHEDULED"` and `scheduledAt` set to the
  slot. PostFast holds it until then.
- `review` → records `ready_for_review`; nothing is sent.
- `manual` → records `awaiting_manual_post` and sends a Telegram reminder.

### 5. Result

The calendar shows the slot moving through `planned` → `generating` → `scheduled` →
`published`. Because generation runs half an hour early, `generating` appears well before the
posting time.

## UI workflow

| Step | Action | What happens |
| --- | --- | --- |
| 1 | Open the automation, choose **Schedule** | Panel heading is **Posting times** |
| 2 | Read the timezone line | Display only — there is no timezone picker |
| 3 | Set a time in the `Posting time N` input | Native time input |
| 4 | Toggle days | Rendered as `Su Mo Tu We Th Fr Sa` |
| 5 | Press **Add posting time** | Disabled at 5 entries |
| 6 | Press **Save Changes** | |
| 7 | Choose **Social Media Settings** → **Publishing workflow** | **Manual — remind me to post**, **Review — approve before publishing**, **Auto — schedule automatically** |
| 8 | Press **Save Settings** | |

## Failures to check

1. **An empty `days: []` means every day**, not "no days".
2. **Jitter is deterministic, not random.** The offset comes from an FNV-1a hash of the slot's
   ISO string, so the same slot always jitters by the same amount. There is no jitter field in
   the UI — only `jitterMinutes` over MCP.
3. **`min_gap_minutes` does nothing.** It is typed, persisted, and defaulted to 180 for X
   automations, but slot generation never reads it. No minimum-gap enforcement exists.
4. **Slot claiming is not a compare-and-swap.** The scheduler inserts a job with a
   deterministic row id and treats a `409` as `"duplicate"`. The worker writes
   `status: "processing"` then reads back and bails if another worker won. Every claimant
   increments `attempts`, including losers.
5. **`not_due` never appears from the cron path.** That skip reason comes from the Next.js
   runner; the Appwrite scheduler just moves on with no reason string.
6. **A publish failure is thrown so the job retries**:
   `PostFast scheduling failed for N integration(s)`. PostFast calls retry 3 times, but only
   on `429` or `5xx`.
7. **Zero connected accounts is silent.** With no active integrations the publishing block
   simply never runs — no error, no warning.
8. **Disabled accounts are dropped, not reported.** Every publish helper filters on
   `!integration.disabled`.
9. **Caption-only posts are actively prevented.** Media is uploaded before any posting
   workflow is recorded, so approving a review-mode post later cannot degrade into a
   caption-only post. There is a regression test pinning this.
10. **The X auto-publish path is a different implementation.** It only fires for single posts
    with `autoPost` enabled, and schedules 60 seconds from execution rather than at the slot.
    Do not describe it as the slideshow path.
11. **`sync-post-analytics` jobs never drain in Appwrite.** The worker explicitly excludes
    that type; only the in-process local worker handles it.

## Additional workflow notes

The schedule model is `timezone` + `posting_times[]` (each with `time`, `days`, optional
`enabled`) + optional `paused`, `jitter_minutes`, `min_gap_minutes`. There is no `slots`
field anywhere.

Accepted time formats when parsing are `h:mm a`, `h a`, `H:mm`, `HH:mm`. An invalid timezone
silently falls back to the machine's local zone.

Calendar lifecycle states are `planned`, `generating`, `generation_failed`, `needs_action`,
`draft`, `failed`, `scheduled`, `published`, merged from four sources — projections, queue
jobs, local post records, and PostFast — deduped on `auto:<automationId>:<slotISO>`.

MCP cannot drain the queue, tick the scheduler, or schedule a one-off run.
`lumenclip_automation_run` always produces an unscheduled draft. One-off scheduling goes
through `lumenclip_output_publish` with a target `mode: "schedule"`.

Previous: [Testing automation variations](/docs/workflows/test-automation-variations) ·
Next: [Linking a TikTok account](/docs/workflows/link-tiktok-account)
