---
title: Component architecture
description: Ownership boundaries and conventions for the React component tree.
---

The frontend is a Next.js App Router application with a large authenticated
client workspace. Components are organized by responsibility rather than by
route because most product views are switched inside `RealFarmWorkspace`.

## Directory map

| Location                                   | Responsibility                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `components/ui/`                           | Reusable product primitives with no LumenClip domain ownership                       |
| `components/realfarm/`                     | Workspace navigation, product views, collections, publishing, and media surfaces     |
| `components/realfarm/automation-settings/` | Automation editor shell and individual settings panels                               |
| `components/realfarm/analytics/`           | Analytics browsing and export UI                                                     |
| `components/realfarm/content-calendar/`    | Schedule projections and publication actions                                         |
| `components/marketing/`                    | Public marketing navigation, footer, and page sections                               |
| `components/debug/` and `components/temp/` | Internal testing surfaces; not stable product components                             |
| `components/*.tsx`                         | Route-level feature roots such as auth, workspace, team invite, and X/Threads studio |

## Main ownership chain

```text
app/app/page.tsx
  -> RealFarmWorkspace
     -> Sidebar
     -> HomeView
     -> ContentCalendarView
     -> AnalyticsView
     -> CollectionsView / CollectionDetailView
     -> AutomationsView
     -> AutomationSettingsDrawer
     -> UserSettingsModal
```

`RealFarmWorkspace` owns cross-view state, initial server data, selected
automations, recent generation runs, and modal visibility. Feature components
should own state that is local to one view. Data required by multiple views
belongs in the workspace or a shared data hook.

## Component rules

1. Extend `components/ui/` when a visual or interaction pattern is genuinely
   reusable and domain-neutral.
2. Keep provider calls and route-specific payload normalization in feature
   components or `lib/client-api.ts`, not in UI primitives.
3. Reuse `shared-media.tsx`, social-account components, and settings-layout
   primitives before introducing another card, toggle, or media state.
4. Keep renderer calculations in `lib/` when they must be shared by preview,
   export, and tests.
5. Every modal must expose an explicit close action and close on backdrop or
   outside interaction when doing so cannot lose an in-flight destructive
   operation.

## Related references

- [Workspace components](workspace.md)
- [Automation settings](automation-settings.md)
- [Media viewers](media-viewers.md)
- [UI primitives](ui-primitives.md)
- [Browser test workflows](../reference/browser-test-workflows.md)
