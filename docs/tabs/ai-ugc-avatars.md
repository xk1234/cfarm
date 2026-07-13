# AI UGC Avatars Tab

Route key: `avatars`

Component: `AvatarsView` in `components/realfarm-workspace.tsx`

## Functionality

AI UGC Avatars manages saved AI character records and local character generation previews. It can create, edit, rename, delete, and display characters. It also has local UI for image generation prompts, reference uploads, persisted categorized assets, and generated image previews.

Main actions:

- Load characters from `/api/characters`.
- Create a new character with normalized attributes.
- Generate a headshot through `/api/characters/headshot`.
- Upload JSON attributes or a source image reference for headshot generation.
- Edit/rename/delete saved characters.
- Add local reference images.
- Create avatar assets by upload or local placeholder generation.
- Select persisted assets for use in avatar prompts.
- Debug the final image prompt and attachments before generation.
- Create in-memory generation cards from prompts.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `CharacterRecord[]` | `GET /api/characters` | Sidebar list and selected character. |
| `Character` | `CharacterRecord.attributes` | Character profile data and editor fields. |
| `CharacterPayload` | `POST /api/characters` | Save/create payload. |
| `defaultCharacterAttributes` | `lib/characters.ts` | Initial character defaults. |
| `defaultCharacterPreviewUrl` | Component constant | Fallback avatar/headshot image. |
| `AssetRecord[]` | `GET /api/assets?scope=ugc_avatar&category=...` | Assets panel library and selected prompt assets. |
| `CharacterPromptAttachment[]` | `buildCharacterPromptPackage()` | Selected character headshot and selected asset attachments. |

## Persistence

Appwrite `characters` table (via `lib/json-store.ts`); working file `data/characters.json` (filesystem fallback)

Headshots: `data/characters/headshots`

Avatar assets: Appwrite `assets` table (via `lib/json-store.ts`); working file `data/assets/assets.json` (filesystem fallback)

Avatar asset files: `data/assets/files`

API:

- `GET /api/characters`
- `POST /api/characters`
- `DELETE /api/characters?id=...`
- `POST /api/characters/headshot`
- `GET /api/assets?scope=ugc_avatar&category=...`
- `POST /api/assets/upload`
- `POST /api/assets/generate`
- `POST /api/assets/caption`

Prompt generations inside the selected character view are stored in React state only and disappear on reload. The prompt package always includes the selected character attributes JSON and the selected character headshot attachment. Selected assets are added as extra attachments.

Assets created from the Assets panel are persisted in the local asset DB and reload after refresh.

Uploaded source images are passed to Kie/Flux Kontext as `inputImage` references when generating a headshot. The uploaded file is not saved directly as the character headshot.

## Hardcoded / Demo Behavior

- `USER_ID` is hardcoded in `lib/characters.ts`.
- Default character name is `"UU's character 1"`.
- Character option lists are hardcoded in `characterAttributeOptions`.
- Generation model names and related model links are hardcoded arrays.
- Generated image assets currently use a local placeholder SVG generator unless a provider is wired later.
- Reference images are object URLs in browser memory, not uploaded to permanent storage.
- The Generate button creates placeholder generation cards; it does not call an image-generation backend.
