---
title: "Automations Tab"
---

Route key: `automations`

Primary component: `AutomationsView` in
`components/realfarm/automations-view.tsx`.

The tab is a shared automation library, not a slideshow-only page. It displays
slideshow, video, X, and Threads automation cards in one grid and opens the
matching editor for each type.

For the screenshot-backed product guides, see:

- [Main Automations page](../automations/index.mdx)
- [Slideshow automations](../automations/slideshow-automations.mdx)
- [Video automations — WIP](../automations/video-automations.mdx)
- [Social automations — WIP](../automations/social-automations.mdx)

## Main functionality

- Display persisted slideshow, video, X, and Threads automations.
- Open the template catalog or create a blank format-specific automation.
- Rename and favorite slideshow/video automation cards.
- Pause or resume scheduled automation activity.
- Show up to three recent generations on each card.
- Summarize connected accounts and upcoming schedule slots.
- Open the format-specific editor.
- Add, paste, disable, and inspect publication-locked hook catalog rows.
- Compare published hook performance inside each slideshow/video automation.
- Open generated slideshow/video viewers from card previews.

## Card variants

| Variant     | Card content                                                                                          | Editor status                                               |
| ----------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Slideshow   | Rendered slide previews, accounts, schedule, favorite, Pause/Resume, Edit.                            | Implemented; see the slideshow editor guide.                |
| Video       | Rendered video/thumbnail previews, accounts, schedule, favorite, Pause/Resume, Edit.                  | WIP; support varies by video template.                      |
| X / Threads | Platform mark, generated copy, content type, benchmark score, accounts, schedule, Pause/Resume, Edit. | WIP; draft generation exists, publishing capabilities vary. |
| LinkedIn    | Intended to use the social automation model.                                                          | WIP; no complete editor in the current UI.                  |

## Objects used

| Object                     | Source                                                  | Usage                                                         |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `AutomationRecord[]`       | Appwrite `automations` table through `/api/automations` | Persisted slideshow/video automation source of truth.         |
| `Automation[]`             | Persisted summaries plus X/Threads projections          | Shared automation-card view models.                           |
| `AutomationSchema`         | Stored slideshow/video automation schema                | Shared editor configuration.                                  |
| `XAutomation[]`            | `/api/x-automations`                                    | X and Threads strategy/editor state.                          |
| `AutomationRunApiRecord[]` | `/api/automations/runs`                                 | Slideshow/video recent-generation previews.                   |
| `XAutomationRun[]`         | X automation run store/API                              | X/Threads recent-generation previews and benchmark summaries. |

## Persistence

- Slideshow/video records: `GET`, `POST`, and `PATCH /api/automations`.
- X/Threads records: `GET`, `POST`, and `PATCH /api/x-automations`.
- Recent slideshow/video runs: `/api/automations/runs`.
- Hook lock and performance state:
  `/api/automations/[id]/hook-analytics`.
- Template definitions and examples are repository-owned catalog data; using a
  template creates a user-owned automation instead of mutating the template.

## Current limitations

- Video templates do not all have equivalent end-to-end generation support.
- X/Threads reply-chain and discovery-based reaction publishing remain
  capability-limited.
- LinkedIn automation is not complete in the UI.
- Empty card preview cells are valid “no recent generation” states.
