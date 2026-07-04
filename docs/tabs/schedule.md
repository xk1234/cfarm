# Schedule Tab

Route key: `schedule`

Component: `ContentCalendarView` in `components/realfarm-workspace.tsx`

## Functionality

Schedule renders a monthly content calendar with month navigation. It asks Postiz for posts in the visible month and renders returned publish dates on the calendar when `POSTIZ_API_KEY` is configured.

Main actions:

- Move between months.
- Toggle scheduled-post visibility.
- Select a calendar day.
- Click "Go to library" to navigate to the editor.
- Sync posts from `GET /api/postiz/posts?startDate=&endDate=`.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `DateTime` | `luxon` | Calendar month/week/day calculation. |
| `PostizListedPost[]` | `/api/postiz/posts` | Real scheduled/published posts for the visible month. |
| `PostizPostRecord[]` | `data/postiz-posts.json` | Local mapping/cache records for posts created through the explicit Postiz scheduling flow. Not used to populate the calendar. |

## Persistence

Postiz post mappings are persisted in `data/postiz-posts.json`. Calendar schedule data comes from Postiz on each month load; local mapping records do not appear unless Postiz itself returns the post.

## Hardcoded / Demo Behavior

- Scheduled-post filter state is local only.
- Calendar starts from the current month using `DateTime.now()`.
- If `POSTIZ_API_KEY` is missing, the tab shows a setup empty state instead of demo posts.
