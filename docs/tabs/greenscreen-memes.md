# Greenscreen Memes Tab

Route key: `greenscreen`

Component: `GreenscreenMemesView` in `components/realfarm-workspace.tsx`

## Functionality

Greenscreen Memes lets the user combine a caption, a local greenscreen meme video, and a background image. The preview uses a canvas-based chroma-key pass to remove green from the selected meme video.

Main actions:

- Edit caption text.
- Page through and select greenscreen meme videos.
- Randomize meme or background selection.
- Select a background image from the current background collection.
- Change caption placement.
- Trigger `onCreate`, which updates local draft/export state.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `LocalAsset[]` | `data.assets.greenscreenMemes` | Meme video library. |
| `PinterestSearchResult[]` | `backgroundCollection.images` or `data.defaultCollections.backgrounds.images` | Background picker and preview. |
| `Video[]` | `data.videos` | Demo "My Videos" grid. |
| `generatedAssets.higgsfieldCharacter.url` | `data.generatedAssets` | Avatar image for demo video grid. |

## Persistence

No greenscreen compositions are persisted. Local assets are read from disk through `loadRealFarmData()`.

## Hardcoded / Demo Behavior

- Initial caption is hardcoded.
- Initial selected meme/background indexes are hardcoded.
- Meme page size is hardcoded to 32; background page size is 10.
- "Generate a text caption" button has no API action.
- "My Videos (99)" count is hardcoded; cards use `data.videos`.
- Chroma key thresholds and canvas size are hardcoded in `ChromaKeyGreenscreenVideo`.
