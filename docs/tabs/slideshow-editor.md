# Slideshow Editor Tab

Route key: `editor`

Component: `EditorView` in `components/realfarm-workspace.tsx`

Related components:

- `ViaPromptPanel`
- `FormatPickerModal`
- `SlideshowImagePickerModal`
- `ExportSettingsModal`
- `QuickPublishModal`

## Functionality

Slideshow Editor is a local slideshow builder. It can start from predefined hooks and default background images, generate slides from a prompt, edit slide text/image/layout/aspect/duration, pick images from Pinterest or saved collections, and export a slideshow into an in-memory list.

Main actions:

- Choose or edit a hook.
- Switch between New and Via Prompt modes.
- Generate preview slides from prompt text.
- Add/delete slides.
- Replace slide images.
- Edit text elements.
- Pick a format.
- Select export settings and sound.
- Export and quick publish local slideshow entries.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `RealFarmData.editor.slides` | `data/realfarm.json` | Default slide text. |
| `PinterestSearchResult[]` | `data.defaultCollections.backgrounds.images` | Initial slides and format previews. |
| `CreatedImageCollection[]` | Workspace state and `/api/image-collections` | Image picker collection source. |
| `Automation[]` | `data.automations` | Format picker formats/templates. |
| `LocalAsset[]` | `data.assets.music` | Export sound selector. |
| `LocalAsset` | Selected sound state | Current export sound. |

## Persistence

No slideshow persistence exists. `exportedSlideshows`, prompt-generated slides, edits, and quick publish state are local React state.

Image search uses:

- `POST /api/pinterest/search?limit=24`

Collections shown in the image picker come from workspace collection state, which may be loaded from:

- `GET /api/image-collections`

## Hardcoded / Demo Behavior

- `hookOptions` is a hardcoded array inside `EditorView`.
- Initial slides use the first three default background images.
- Default slide duration, aspect ratio, text colors, font sizes, and positions are hardcoded.
- "Generate Slideshow" shows `0 credits`.
- Via Prompt mode uses default background images and local state; no generation backend is called.
- Export only adds to `exportedSlideshows` in memory.
- Quick publish modal is a UI placeholder and does not publish.
- Format picker contains many hardcoded defaults for aspect ratios, text styles, overlays, and slide count.
- Recent Pinterest searches are local browser state/helper driven, not a server object.
