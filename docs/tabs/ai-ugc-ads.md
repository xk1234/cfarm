# AI UGC Ads Tab

Route key: `ugcads`

Component: `UGCAdsView` in `components/realfarm-workspace.tsx`

## Functionality

AI UGC Ads is a builder-style tab for composing a UGC ad from a hook, avatar, demo setting, text placement, and sound.

Main actions:

- Cycle/edit hook text.
- Select an AI avatar if available.
- Select demo mode.
- Change text placement in the phone preview.
- Select background music.
- Trigger `onCreate`, which adds a local draft/export count through workspace state.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `RealFarmData.ugcAds.hooks` | `data/realfarm.json` | Initial hook list. |
| `RealFarmData.ugcAds.selectedHook` | `data/realfarm.json` | Initial selected hook index. |
| `LocalAsset[]` | `data.assets.music` | Sound selector options. |
| `LocalAsset` | Selected sound state | Current background sound. |

## Persistence

No API persistence for ad drafts from this tab. Sound selection and draft creation are workspace React state.

## Hardcoded / Demo Behavior

- `avatars` is currently an empty array in the component, so it shows "No AI avatars yet" even though `data.ugcAds.avatars` exists.
- `demos` is hardcoded to `["None", "Add"]`, not `data.ugcAds.demos`.
- The preview is a styled placeholder, not rendered video output.
- Fallback hook copy is hardcoded if no hooks exist.
- Text placement options are hardcoded to top/middle/bottom.
