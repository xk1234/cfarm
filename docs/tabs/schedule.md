# Schedule Tab

Route key: `schedule`

Component: `ContentCalendarView` in `components/realfarm-workspace.tsx`

## Functionality

Schedule renders a monthly content calendar shell with filters and month navigation. At the moment it always shows an empty-state overlay and links users back to the Slideshow Editor/library.

Main actions:

- Move between months.
- Toggle filter checkboxes.
- Select a calendar day.
- Click "Go to library" to navigate to the editor.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `DateTime` | `luxon` | Calendar month/week/day calculation. |
| `scheduledPosts` | Component constant | Demo post data, currently gated off. |

## Persistence

No persisted schedule records and no API calls.

## Hardcoded / Demo Behavior

- `scheduledPosts` is hardcoded in the component.
- `hasContent` is hardcoded to `false`, so scheduled posts never render.
- Filter labels and states are local only.
- Calendar starts from the current month using `DateTime.now()`.
- Empty state text is hardcoded.
