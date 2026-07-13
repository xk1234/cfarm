# 01 — Character Creation

Create or import a character: optionally extract attributes from a reference image, generate a headshot preview, then upsert the `CharacterRecord`.

Entry: `components/realfarm/character-create.tsx` → `/api/characters/attributes`, `/api/characters/headshot`, `/api/characters`
Core: `lib/characters.ts` (`saveCharacter`), `lib/character-model.ts` (`normalizeCharacterAttributes`)

```mermaid
flowchart TD
    START(["User opens Create Character"]) --> MODE{"Have a reference image?"}

    MODE -->|Yes| UP["Upload image as data URL"]
    UP --> ATTR["POST /api/characters/attributes"]
    ATTR --> LLM1["OpenRouter LLM extracts Character attributes"]
    LLM1 --> NORM["normalizeCharacterAttributes -> fill gaps from defaults"]

    MODE -->|No| MANUAL["Manual attribute entry in modal"]
    MANUAL --> NORM

    NORM --> HEAD{"Generate headshot?"}
    HEAD -->|Yes| HREQ["POST /api/characters/headshot"]
    HREQ --> IMG["Image model generates preview"]
    IMG --> PREVIEW["preview_url set"]
    HEAD -->|No| PREVIEW

    PREVIEW --> SAVE["POST /api/characters -> saveCharacter (upsert)"]
    SAVE --> REC["CharacterRecord written to 'characters' store"]
    REC --> DONE(["Character appears in Avatars list"])
```
