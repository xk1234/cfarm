# Schedule Tab

Route key: `schedule`

Component: `ContentCalendarView` in `components/realfarm/content-calendar/content-calendar-view.tsx`

## Functionality

A unified content calendar that merges planned, in-flight, and published content from four sources into a single timeline — not just PostFast posts.

The view fetches `GET /api/calendar?from=&to=` (via SWR) and merges four source types into one deduped `CalendarItem[]` (`lib/calendar-items.ts`):

1. **`projection`** — future automation slots from `automationSlotsInRange`.
2. **`job`** — queued `run-automation` / `run-x-automation` jobs.
3. **`local_post`** — `postfast_posts` records awaiting action.
4. **`postfast`** — live PostFast `/social-posts`.

Items are deduped by slot key.

Main actions:

- Browse the calendar across a date range.
- Filter by account, status, platform, automation, and source type (persisted to `localStorage` key `realfarm:calendar-filters:v1`).
- Open an item's detail panel: "View content", "Live post", and (for `scheduled` items) "Cancel", which DELETEs the PostFast post via `/api/calendar/items/[id]`.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `CalendarItem[]` | `GET /api/calendar` | Unified calendar timeline. |
| `CalendarLifecycleStatus` | `lib/calendar-items.ts` | 8-state status: `planned, generating, generation_failed, needs_action, draft, failed, scheduled, published`. |
| Alert summary | `GET /api/calendar/summary` (`calendarAlertSummary`) | Sidebar badge counts (needs-action + failed). |

## Posting modes

Automations carry a posting-mode tri-state (`AutomationPostingMode` in `lib/realfarm-automation.ts`, default `"auto"`):

- **`auto`** — publishes on schedule (`lib/publishing.ts`).
- **`manual`** — becomes `awaiting_manual_post`.
- **`review`** — becomes `ready_for_review`.

`manual` and `review` both surface on the calendar as `needs_action`.

## Persistence

Sources are the `postfast_posts`, `automations`, and `jobs` tables plus live PostFast. Appwrite is authoritative — no filesystem fallback. The only mutation from the calendar is cancel/delete of a scheduled PostFast post.

## Notes

- **Warmup is not a live feature.** Earlier warmup controls were removed; a regression test asserts they no longer exist (`components/realfarm/automation-publishing-lifecycle.test.ts`).
- There is no dedicated "reschedule" button on the calendar; rescheduling is done in the automation/publishing flow, not here.
