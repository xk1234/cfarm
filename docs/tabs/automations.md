# Automations Tab

Route key: `automations`

Component: `AutomationsView` in `components/realfarm-workspace.tsx`

Related drawer/components:

- `AutomationSettingsDrawer`
- `AutomationOverviewPanel`
- `AutomationFormatPanel`
- `TikTokSettingsPanel`
- `PromptConfigPanel`
- `SchedulePanel`

## Functionality

Automations lists slideshow automation cards and opens a settings drawer for editing automation configuration. It supports local renaming and favorite toggles.

Main actions:

- Display built-in and locally created automation cards.
- Rename an automation card.
- Toggle favorite state.
- Open the template/new automation modal.
- Open the edit drawer.
- Edit generated `AutomationSchema` settings in memory.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `Automation[]` | `data.automations` plus local `createdAutomations` | Cards and template entries. |
| `AutomationSchema` | `defaultAutomationSchema()` / `mergeAutomationSchema()` | Edit drawer settings. |
| `ImageCollectionConfig` | `AutomationSchema.image_collection_ids` | Format/settings collection references. |
| `AutomationTextItem` | `AutomationSchema.format.*.text_items` | Text controls in format editor. |

## Persistence

No automation persistence exists in the current repo. Renames, favorite toggles, created automations, and drawer config edits are React state only.

## Hardcoded / Demo Behavior

- Built-in automations come from `data/realfarm.json`.
- Locally created automations get IDs like `auto-local-${Date.now()}` or `auto-template-${Date.now()}`.
- `defaultAutomationSchema()` hardcodes default hooks, TikTok settings, collection IDs, prompt text, schedule day sets, and format defaults.
- Pause button is visual only.
- Filter button is visual only.
- Edit drawer saves to local state only.
- Preview cards use generated thumbnails and placeholder text.
