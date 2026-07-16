# AI UGC Avatars Tab

Route key: `avatars`

Component: `AvatarsView` in `components/realfarm/characters-view.tsx`, wrapping the real UI `CharactersView` in `components/realfarm/characters/characters-view.tsx`

## Functionality

Create and manage AI characters ("avatars") and generate real headshots, images, and videos for them. Generation is backed by the KIE provider and **persists** — it is no longer placeholder/demo behavior.

Main actions:

- Create, rename, and delete characters.
- Generate character images via `/api/characters/images` and poll real generations.
- Upload a reference/source image and reuse it ("Use as source image").
- Run image→video workflows for a character.
- Browse persisted image and video generations.

## Objects Used

| Object | Source | Usage |
| --- | --- | --- |
| `CharacterRecord[]` | `GET /api/characters` (`characters` table) | Character list source of truth. |
| `character_generations` records | `GET /api/characters/images?characterId=` | Persisted image generations. |
| `character_video_generations` records | Characters video routes | Persisted video generations. |
| Source image | Uploaded, stored in the `characters` Storage bucket | Reused as generation input. |

## Persistence

Characters persist in the `characters` table; image and video generations persist in the `character_generations` and `character_video_generations` tables; uploaded/source images live in the `characters` Storage bucket. Appwrite is authoritative — no filesystem fallback.

API routes:

- `GET / POST /api/characters`
- `DELETE /api/characters/[id]`
- `POST /api/characters/image` · `GET / POST /api/characters/images`
- `POST /api/characters/video`
- `/api/characters/workflows` · `/api/characters/attributes`

Provider: KIE (`kie.ai`) for image and video generation.

## Hardcoded / Demo Behavior

- Empty-state and loading copy are static.
- Model/attribute option lists come from the generation model registry (`lib/realfarm-generation-model-registry.ts`).
