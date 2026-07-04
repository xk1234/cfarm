# AI UGC Ads Tab

Route key: `ugcads`

Component: `UGCAdsView` in `components/realfarm-workspace.tsx`

## Functionality

AI UGC Ads is a builder-style tab for composing a UGC ad from a hook, avatar, demo setting, text placement, and sound.

Main actions:

- Cycle/edit hook text.
- Select an AI avatar from `data/realfarm.json`.
- Select no demo or a project demo video from `GET /api/assets?scope=ugc_demo&kind=video`.
- Change text placement in the phone preview.
- Select background music.
- Create a queued generated-video export in `/api/generated-videos`.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `RealFarmData.ugcAds.hooks` | `data/realfarm.json` | Initial hook list. |
| `RealFarmData.ugcAds.selectedHook` | `data/realfarm.json` | Initial selected hook index. |
| `RealFarmData.ugcAds.avatars` | `data/realfarm.json` | Data-backed test avatar image URLs. |
| `RealFarmData.ugcAds.demos` | `data/realfarm.json` | Demo selectors. |
| `AssetRecord[]` | `GET /api/assets?scope=ugc_demo&kind=video` | Uploaded project demo videos. |
| `GeneratedVideoExport[]` | `GET /api/generated-videos?type=ugc_ad` | Queued/generated UGC ad export cards. |
| `LocalAsset[]` | `data.assets.music` | Sound selector options. |
| `LocalAsset` | Selected sound state | Current background sound. |

## Persistence

Generated-video exports are persisted through `/api/generated-videos` into `data/generated-videos/exports.json`. New exports start as `queued` and include a queue position. Uploaded project demo videos are stored as `ugc_demo` assets under `data/assets/demos`. Sound selection remains workspace React state.

## Hardcoded / Demo Behavior

- The preview is a styled placeholder, not rendered video output.
- Fallback hook copy is hardcoded if no hooks exist.
- Text placement options are hardcoded to top/middle/bottom.
