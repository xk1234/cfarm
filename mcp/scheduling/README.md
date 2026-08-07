# Scheduling MCP behavior

> Schedule inspection, common recurring schedule updates, and confirmed
> one-output scheduled publishing are callable.

Scheduling is an app use case with two public entry points:

1. Inspection through `lumenclip_schedule_get`.
2. Recurring template configuration through the implemented safe subset of
   `lumenclip_template_update`; preview and create/save remain proposed.
3. One-output scheduling through `lumenclip_output_publish` with a target whose
   `mode` is `schedule` and whose `scheduledAt` is an ISO-8601 datetime.

## `lumenclip_schedule_get`

Implemented, read-only, and idempotent.

| Field           | Type              | Required | Description                                               |
| --------------- | ----------------- | -------- | --------------------------------------------------------- |
| `templateId`    | string            | no       | Restrict the result to one template.                      |
| `from`          | ISO-8601 datetime | no       | Projection start; defaults to now.                        |
| `days`          | integer 1-90      | no       | Projection window; default 14.                            |
| `includePaused` | boolean           | no       | Include paused template settings and slots; default true. |
| `limit`         | integer 1-200     | no       | Maximum projected slots; default 100.                     |

The result includes normalized saved schedules, a chronological projected slot
list, and a merged `calendarItems` view. The latter overlays queue jobs and
local publication records onto projections and exposes `planned`,
`generating`, `generation_failed`, `needs_action`, `draft`, `failed`,
`scheduled`, and `published` lifecycle states with a status summary. A
materialized job/publication replaces its matching projected slot. Timestamps
are UTC ISO strings and projected entries retain the template's IANA
timezone and paused state.

## Recurring schedule fields

Template briefs and patches may contain a normalized `schedule` object with
timezone, enabled/paused state, cadence or slots, start boundary, and supported
platform/account targets. The preview result must show the resolved timezone,
next eligible slot, validation issues, and any platform capability mismatch.

Use `lumenclip_template_update` with `action: "pause"` or `action: "resume"`
to stop or restart recurring runs. Timezone, posting rows, and jitter can be
updated in the same call. `expectedUpdatedAt` provides optional optimistic
concurrency protection.

## One-output scheduled publication

Use the publishing contract:

```json
{
  "outputId": "out_123",
  "targets": [
    {
      "accountId": "acct_123",
      "mode": "schedule",
      "scheduledAt": "2026-07-20T09:00:00+08:00"
    }
  ],
  "confirmPublish": true,
  "requestId": "schedule-out-123"
}
```

Output is a publish operation with resolved workspace time, provider schedule
capability, and warnings.

## Intentionally unavailable

- No tool exposes “run due templates,” queue draining, or scheduler ticks.
- No tool mutates the app calendar directly.
- Manual `lumenclip_template_run` calls remain unscheduled drafts.
- The server never infers a publishing account or time from conversational
  context when those fields are absent.
