# Automations Tab

Route key: `automations`

Component: `AutomationsView` in `components/realfarm/automations-view.tsx`

Related drawer/components:

- `AutomationSettingsDrawer`
- `AutomationOverviewPanel`
- `AutomationFormatPanel`
- `TikTokSettingsPanel`
- `PromptConfigPanel`
- `SchedulePanel`

## Functionality

Automations lists slideshow automation cards and opens a settings drawer for editing automation configuration. It now loads persisted imported/local automation records from this app's automation DB when available, falling back to seed data only when the DB is empty.

Main actions:

- Display built-in and locally created automation cards.
- Rename an automation card.
- Toggle favorite state.
- Open the template/new automation modal.
- Open the edit drawer.
- Edit generated or imported `AutomationSchema` settings.
- Persist imported automation renames, favorites, and settings through `/api/automations`.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `AutomationRecord[]` | Appwrite `automations` table via `/api/automations` | Imported/local persisted automation source of truth. |
| `Automation[]` | Persisted automation summaries, falling back to `data.automations` plus local `createdAutomations` | Cards and template entries. |
| `AutomationSchema` | Imported schema or `defaultAutomationSchema()` / `mergeAutomationSchema()` | Edit drawer settings. |
| `ImageCollectionConfig` | `AutomationSchema.image_collection_ids` | Format/settings collection references. |
| `AutomationTextItem` | `AutomationSchema.formatting[].textItems` | Reelfarm-shaped text controls in format editor. |

## Persistence

Persisted automations live in the Appwrite `automations` table (via `lib/json-store.ts`) — authoritative, no filesystem fallback. The `AutomationSchema` includes the `posting_mode` tri-state (`manual` / `review` / `auto`) and knowledge-context fields (`knowledge_context_enabled`, `knowledge_base_ids`). The API supports:

- `GET /api/automations`
- `POST /api/automations`
- `PATCH /api/automations`

Chrome extraction status: the app-side DB/import path exists, but direct structured extraction from the logged-in Chrome Reelfarm tab was blocked because Chrome has JavaScript execution from Apple Events disabled and the available accessibility tree did not expose page content.

## Hardcoded / Demo Behavior

- Built-in automations from `data/realfarm.json` are fallback/demo data when the local automation DB is empty.
- Locally created automations may still get IDs like `auto-local-${Date.now()}` or `auto-template-${Date.now()}` when created from flows that have not been fully migrated.
- `defaultAutomationSchema()` hardcodes default Reelfarm-shaped `prompt_formatting`, `formatting[]`, TikTok settings, collection IDs, prompt text, schedule day sets, and format defaults.
- Pause button is visual only.
- Filter button is visual only.
- Preview cards use generated thumbnails and placeholder text.
