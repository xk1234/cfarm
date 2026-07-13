# 02 — Character Image Generation

Generate images for a character through one of several named workflows. A single POST dispatches on `payload.workflow`; each branch builds a provider-specific payload, calls KIE, polls, and upserts a generation record.

Entry: `/api/characters/image`, `/api/characters/workflows`
Core: `lib/character-workflows.ts`, `lib/kie-image.ts`, `lib/character-image-generations.ts`

```mermaid
flowchart TD
    START(["User picks a character + workflow"]) --> POST["POST /api/characters/workflows"]
    POST --> DISPATCH{"dispatch on payload.workflow"}

    DISPATCH -->|recreate_reference| RR1["buildReferenceAnalysis (LLM analyzes reference)"]
    RR1 --> RR2["buildReferenceRecreationPrompt"]
    RR2 --> NB["Nano Banana Pro payload"]

    DISPATCH -->|seedream_bedroom_selfie| SD["buildSeedreamBedroomSelfiePrompt -> Seedream V4 Edit"]
    DISPATCH -->|outfit_transfer| OT["buildWanClothingEditPayload"]
    DISPATCH -->|pose_variation| PV["buildPoseVariationPrompt -> Kling V2.5 start/end frame"]
    DISPATCH -->|motion_control| MC["buildKlingMotionControlPayload"]
    DISPATCH -->|unsupported| ERR["400 Unsupported character workflow"]

    NB --> CALL["Call KIE image model"]
    SD --> CALL
    OT --> CALL
    PV --> CALL
    MC --> CALL

    CALL --> POLL["Poll KIE task until ready/failed"]
    POLL --> META["Store recipe + attachments in workflowMetadata"]
    META --> UPSERT["upsertCharacterImageGeneration"]
    UPSERT --> REC["CharacterImageGenerationRecord in 'character_generations' store"]
    REC --> DONE(["Image shown in character detail view"])
```
