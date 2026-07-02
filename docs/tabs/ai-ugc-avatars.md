# AI UGC Avatars Tab

Route key: `avatars`

Component: `AvatarsView` in `components/realfarm-workspace.tsx`

## Functionality

AI UGC Avatars manages saved AI character records and local character generation previews. It can create, edit, rename, delete, and display characters. It also has local UI for image generation prompts, reference uploads, assets, and generated image previews.

Main actions:

- Load characters from `/api/characters`.
- Create a new character with normalized attributes.
- Generate or fallback to a headshot through `/api/characters/headshot`.
- Edit/rename/delete saved characters.
- Add local reference images.
- Create in-memory generation cards from prompts.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `CharacterRecord[]` | `GET /api/characters` | Sidebar list and selected character. |
| `Character` | `CharacterRecord.attributes` | Character profile data and editor fields. |
| `CharacterPayload` | `POST /api/characters` | Save/create payload. |
| `defaultCharacterAttributes` | `lib/characters.ts` | Initial character defaults. |
| `defaultCharacterPreviewUrl` | Component constant | Fallback avatar/headshot image. |

## Persistence

Backing file: `data/characters.json`

Headshots: `data/characters/headshots`

API:

- `GET /api/characters`
- `POST /api/characters`
- `DELETE /api/characters?id=...`
- `POST /api/characters/headshot`

Prompt generations inside the selected character view are stored in React state only and disappear on reload.

## Hardcoded / Demo Behavior

- `USER_ID` is hardcoded in `lib/characters.ts`.
- Default character name is `"UU's character 1"`.
- Character option lists are hardcoded in `characterAttributeOptions`.
- Generation model names and related model links are hardcoded arrays.
- Assets panel tabs (`outfits`, `accessories`, `background`, `products`) are UI-only and show empty states.
- Reference images are object URLs in browser memory, not uploaded to permanent storage.
- The Generate button creates placeholder generation cards; it does not call an image-generation backend.
