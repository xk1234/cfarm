# Schedule Tab

Route key: `schedule`

Component: `ContentCalendarView` in `components/realfarm-workspace.tsx`

## Functionality

Schedule renders a monthly content calendar with month navigation. It asks PostFast for posts in the visible month and renders returned scheduled/published dates on the calendar when `POSTFAST_API_KEY` is configured.

Main actions:

- Move between months.
- Toggle scheduled-post visibility.
- Select a calendar day.
- Click "Go to automations" to navigate to automation management.
- Sync posts from `GET /api/postfast/posts?startDate=&endDate=`.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `DateTime` | `luxon` | Calendar month/week/day calculation. |
| `PostFastListedPost[]` | `/api/postfast/posts` | Real scheduled/published posts for the visible month. |
| `PostFastPostRecord[]` | `data/postfast-posts.json` | Local mapping/cache records for posts created through the explicit PostFast scheduling flow. Not used to populate the calendar. |

## Persistence

PostFast post mappings are persisted in `data/postfast-posts.json`. Calendar schedule data comes from PostFast on each month load; local mapping records do not appear unless PostFast itself returns the post.

## Hardcoded / Demo Behavior

- Scheduled-post filter state is local only.
- Calendar starts from the current month using `DateTime.now()`.
- If `POSTFAST_API_KEY` is missing, the tab shows a setup empty state instead of demo posts.
