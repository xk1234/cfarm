---
title: Workspace components
description: Component ownership for the authenticated product shell and primary views.
---

## Shell and navigation

| Component           | Source                                        | Responsibility                                                                                          |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `RealFarmWorkspace` | `components/realfarm-workspace.tsx`           | Authenticated client shell, cross-view state, initial data, automation selection, and top-level dialogs |
| `Sidebar`           | `components/realfarm/navigation.tsx`          | Primary view switching, schedule badge, docs/settings links, and logout                                 |
| `HomeView`          | `components/realfarm/home-view.tsx`           | Dashboard, template entry points, and recent generated runs                                             |
| `UserSettingsModal` | `components/realfarm/user-settings-modal.tsx` | Account connections, team, demo uploads, and settings surfaces                                          |

The workspace views are state-selected rather than separate App Router pages.
`ViewKey` currently supports `home`, `schedule`, `analytics`, `collections`, and
`automations`.

## Product views

| Component              | Responsibility                                                                    | Main server dependencies                                                      |
| ---------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `AutomationsView`      | Lists content and X/Threads automations, previews recent runs, and opens editors  | `/api/automations`, `/api/automations/runs`, `/api/x-automations`             |
| `CollectionsView`      | Lists image, video, variable, and product collections                             | `/api/image-collections`, `/api/word-collections`, `/api/product-collections` |
| `CollectionDetailView` | Collection media management, imports, captions, and image actions                 | Image collection import/caption/action routes                                 |
| `ContentCalendarView`  | Merged scheduled, draft, failed, and published projections                        | `/api/calendar`, `/api/calendar/summary`, PostFast routes                     |
| `AnalyticsView`        | Account/post analytics, drill-downs, synchronization, and CSV export              | `/api/analytics/report`                                                       |
| `GreenscreenMemesView` | Legacy-compatible greenscreen media browser                                       | Runtime media library                                                         |
| `XAutomationStudio`    | Dedicated X/Threads strategy, generation, publishing, and account settings editor | `/api/x-automations/**`                                                       |

## Collections and account components

- `CollectionSelector` chooses one or more image collections for an automation.
- `PinterestCollectionSearch` imports discovery results into an image
  collection.
- `ProductCollectionsPanel` provides the current read-only product catalog;
  `VariableCollectionsPanel` provides CRUD for reusable text inputs.
- [Collections](../collections/overview.md) is the canonical reference for the
  four types, their different lifecycle rules, and automation usage.
- `SocialAccountSelectionGrid`, `SocialAccountPickerModal`, and
  `SocialAccountStatusRow` share PostFast integration display and selection.
- `SocialPlatformIcon` is the canonical provider icon/label boundary.
- `PublicationStatusControl` owns draft, scheduled, published, failed, and
  manually-published presentation.

## Data-flow guidance

Prefer SWR for independently refreshable server resources. Mutations should
update or invalidate the same cache key used by the view. When an interactive
generation finishes, insert the returned run immediately and then refresh;
`RealFarmWorkspace` contains revision protection so an older response cannot
erase a newly generated run.
