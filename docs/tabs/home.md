# Home Tab

Route key: `home`

Component: `HomeView` in `components/realfarm/home-view.tsx`

## Functionality

Home is the landing/dashboard view. It surfaces quick-start automation templates and the user's recent generated output.

Main actions:

- Show a paged strip of quick-start **template** cards (built from `templates: Automation[]`).
- Toggle between recent **slideshows** and **videos** output.
- Show recent generated runs per automation (`recentRunsByAutomationId`, `generatedRunsByAutomationId`).
- Show generated video exports loaded from the backend.
- Enter the automation/template flow from a card.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `Automation[]` (`templates`) | Server-loaded automation templates | Quick-start cards, paged via `quickStartTemplates`/`quickStartPage`. |
| `recentRunsByAutomationId` | Server props | Recent run status per automation. |
| `generatedRunsByAutomationId` | Server props | Completed generation output per automation. |
| `GeneratedVideoExport[]` | Backend (`generated_video_exports`) | Recent video output in the slideshows/videos toggle. |

## Persistence

Home is read-only. Template cards come from the `automation_templates` store; generated output comes from the `generated_video_exports` and `automation_runs` tables. Appwrite is authoritative — there is no `data/*.json` fallback for these mapped stores.

## Hardcoded / Demo Behavior

- The editorial welcome block (headline, value statement, actions) is static copy.
- Placeholder creator media in the welcome strip is decorative.
