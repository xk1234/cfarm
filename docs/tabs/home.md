# Home Tab

Route key: `home`

Component: `HomeView` in `components/realfarm-workspace.tsx`

## Functionality

Home is the workspace landing/dashboard view. It shows the primary ReelFarm positioning, quick-start automation cards, recent generated content, and entry points into the automation/template flow.

Main actions:

- Open the template/new automation modal.
- Navigate to Automations.
- Preview automation formats using generated example runs.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `RealFarmData.brand` | `data/realfarm.json` | Brand/sidebar context inherited from workspace. |
| `Automation[]` | `data.automations` | Quick-start automation/template cards. |
| `PinterestSearchResult[]` | `data.defaultCollections.backgrounds.images` | Preview images for automation cards. |
| `Project[]` | `data.projects` | Draft/project seed content where rendered. |

## Persistence

No Home-specific persistence. Actions either change the current view or create local in-memory automation/editor state.

## Hardcoded / Demo Behavior

- Hero copy is hardcoded in the component.
- Quick-start cards are limited to `data.automations.slice(0, 6)`.
- Preview images are sliced from `defaultCollections.backgrounds.images`.
- No backend dashboard metrics are loaded here.
