# Production generation pipelines

The pipeline MCP surface exposes the four Windmill-owned generation workflows.
Callers can queue a complete workflow, invoke one named stage with JSON, or
retain a stage envelope and pass it to another stage.

## Execution model

`lumenclip_pipeline_catalog` returns two stage lists per workflow:

- `workflowStages` is the ordered Windmill flow used by
  `lumenclip_pipeline_run`.
- `stages` is the complete catalog, including every independently callable
  atomic stage used inside composites.

Every catalog entry publishes these machine-readable boundary fields:

| Field                | Meaning                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `granularity`        | `atomic` performs one transformation/boundary; `composite` invokes registered stages through `context.runStage`.                                        |
| `sideEffect`         | `none`, `network`, or `storage`. Appwrite/database/storage access is `storage`.                                                                         |
| `operation`          | The named provider, storage, or deterministic action.                                                                                                   |
| `maxExternalCalls`   | `0` for deterministic/composite handlers and `1` for an atomic network/storage handler. The executor rejects a second declared boundary before it runs. |
| `provider` / `model` | Provider and model provenance when applicable.                                                                                                          |
| `workflowStep`       | Whether the stage participates in the ordered full workflow.                                                                                            |

Atomic provider handlers never own retry loops. A repair or retry is another
invocation of the same registered atomic handler by a composite. Async APIs use
separate create, one-status-read, result/download, and persistence stages. A
composite may return a running operation so the caller can resume later with
the retained structured output.

Full workflow execution is queued in Windmill. Each ordered stage is visible as
its own Windmill module and uses the same private stage boundary as
`lumenclip_pipeline_stage_run`. Decomposed convenience composites still call
atomic handlers through the registry during the incremental handler migration.

## Tools

| Tool                           | Purpose                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `lumenclip_pipeline_catalog`   | List all workflows, workflow stages, atomic stages, boundary metadata, and provider/model provenance. |
| `lumenclip_pipeline_stage_run` | Invoke one registered atomic or composite stage through Windmill with explicit JSON.                  |
| `lumenclip_pipeline_run`       | Queue an ordered named Windmill workflow and return its Windmill job ID.                              |

## Generate slideshow text for a fixed hook

First run `slideshow-generation.build-text-prompt`. Pipe its complete output to
the singular provider attempt and keep the same `hook` value:

```json
{
  "stageId": "slideshow-generation.generate-slide-text-attempt",
  "requestId": "slides-text-2026-08-01",
  "input": {
    "hook": "This hook must remain fixed",
    "textAutomation": {
      "id": "slideshow-1",
      "name": "Workflow lessons",
      "theme": "production workflows",
      "hooks": ["This hook must remain fixed"],
      "tone": "Educational & Informative",
      "imageCollectionIds": { "hook": "", "content": "", "cta": "" },
      "slides": [
        {
          "id": "content-1",
          "index": 0,
          "section": "content",
          "title": "Content",
          "aspectRatio": "9:16",
          "imageGrid": "none",
          "overlay": true,
          "displayText": true,
          "collectionId": "",
          "textItems": [
            {
              "id": "content-1__heading",
              "itemId": "heading",
              "section": "content",
              "slideId": "content-1",
              "label": "Heading",
              "contentDirection": "Explain the lesson",
              "wordLengthMin": 3,
              "wordLengthMax": 8,
              "textMode": "prompt",
              "staticText": "",
              "font": "TikTok Display Medium",
              "fontSize": "12px",
              "textStyle": "whiteText",
              "textPosition": "center",
              "textItemWidth": "80%",
              "textAlign": "left",
              "textAnchor": "flush",
              "textVerticalAnchor": "padded"
            }
          ]
        }
      ]
    },
    "promptPayload": {
      "model": "openai/gpt-5.6-luna",
      "stream": false,
      "messages": [
        { "role": "system", "content": "Return the supplied strict schema." },
        {
          "role": "user",
          "content": "Write the non-hook slide text for the fixed hook."
        }
      ],
      "response_format": {
        "type": "json_schema",
        "json_schema": {
          "name": "temp_slide_testing_text",
          "strict": true,
          "schema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["title", "caption", "hashtags", "text"],
            "properties": {
              "title": { "type": "string" },
              "caption": { "type": "string" },
              "hashtags": { "type": "array", "items": { "type": "string" } },
              "text": {
                "type": "object",
                "additionalProperties": false,
                "required": ["content-1__heading"],
                "properties": { "content-1__heading": { "type": "string" } }
              }
            }
          }
        }
      }
    },
    "finalAttempt": true
  }
}
```

The response always reports `selectedHook` equal to the input `hook`. The hook
is context, not a model-fillable text placeholder. To use production prompt
wording and schema, pass the exact `promptPayload` emitted by
`build-text-prompt` rather than constructing it manually.

## Select one image for one slideshow slide

This singular stage consumes exactly one supplied shortlist. It returns IDs,
URLs, and captions only—never image bytes:

```json
{
  "stageId": "slideshow-generation.select-one-slide-image",
  "requestId": "slide-image-content-1",
  "input": {
    "shortlist": {
      "slideId": "content-1",
      "slideText": "They notice the emotional shift first.",
      "aiImageSelection": true,
      "concepts": ["person in blue light", "quiet room"],
      "candidates": [
        {
          "id": "image-44",
          "imageUrl": "/api/assets/image-44.jpg",
          "caption": "Person in blue light watching a quiet room"
        },
        {
          "id": "image-57",
          "imageUrl": "/api/assets/image-57.jpg",
          "caption": "Empty warm office"
        }
      ]
    },
    "recentImageUsage": {},
    "usedImageIds": [],
    "usedImageUrls": []
  }
}
```

`slideshow-generation.select-slide-images` is only an aggregate composite. It
invokes `select-one-slide-image` once per slide through the registry and never
calls OpenRouter directly.

## Ordered workflow stages

The full-workflow order remains aligned with the four production specs:

- Slideshow: `validate-input` → `resolve-slide-count` →
  `select-expand-hook` → `research-hook` → `build-text-prompt` →
  `generate-slide-text` → `retry-text-similarity` →
  `derive-visual-concepts` → `build-image-shortlists` →
  `select-slide-images` → `assemble-plan` → `translate-plan` →
  `render-store-pngs` → `render-store-mp4` → `validate-output` →
  `finalize-output`.
- UGC: `analyze-product` → `generate-script-plan` →
  `resolve-generate-actor` → `synthesize-voice` → `animate-actor` →
  `lip-sync-performance` → `generate-broll` → `composite-output` →
  `store-final-output`.
- LinkedIn: `validate-input` → `resolve-brief` → `select-post-plan` →
  `build-generation-request` → `generate-compose` → `validate-draft` →
  `repair-draft` → `complete-batch`.
- X/Threads: `validate-input` → `resolve-brief` → `select-content-plan` →
  `build-generation-request` → `generate-draft` → `humanize-draft` →
  `review-draft` → `validate-draft` → `repair-draft` →
  `benchmark-build-run` → `persist-run-memory` → `generate-image`.

Publishing is deliberately absent from all four lists.

## Atomic stage groups

- Slideshow: owner-scoped document and page reads, one hook-research attempt,
  one slide-text attempt, one slide-image selection, one source/overlay/icon
  download, one output-object create/delete, one result create/update, one
  media-row create/delete, and one post-identity/post-intent create/update.
  PNG rendering, result construction, and video-finalization updates are local
  deterministic stages. Pagination, replacement, result/media persistence,
  video preparation, and post-intent persistence are composites over singular
  registered stages.
- UGC: one DNS lookup, one product-page HTTP response, one OpenRouter product
  analysis, one OpenRouter script attempt, one checkpoint enqueue/read, and
  fal task create/status/result. ElevenLabs synthesis is separate from its two
  storage writes. fal and Rendi expose create/upload, one-status-read, result,
  remote download, and persistence boundaries. `generate-one-broll-image`,
  `synthesize-voice-assets`, and `render-rendi-composite` are resumable
  composites over those registered stages. Saved checkpoint rows, durable
  assets, final output rows/media, usage rows, and generated notification jobs
  also expose fixed-domain one-request stages.
- LinkedIn: validation, plan selection, request construction, one brief
  derivation, one per-post generation attempt, draft validation, repair
  orchestration, and batch orchestration. Each post attempt is independently
  callable.
- X/Threads: one brief attempt, one generation/humanize/review attempt,
  deterministic planning/validation, fixed template/run document reads,
  separate creates and updates, singular output-media page/create/delete
  stages, reminder storage, and KIE image task
  build/create/status/download/persist stages. Upsert and media
  synchronization are zero-call composites.

Use `lumenclip_pipeline_catalog` as the canonical source of exact stage IDs;
the catalog includes atomic stages that are intentionally absent from the
ordered `workflowStages` list.

## Run and resume

```json
{
  "workflowId": "linkedin-generation",
  "requestId": "linkedin-batch-2026-08-01",
  "input": {
    "niche": "B2B SaaS onboarding",
    "persona": "practitioner",
    "proof": ["Reduced activation time from 9 days to 3 days"],
    "count": 2
  }
}
```

`startAt` resumes an ordered workflow from an envelope returned by the prior
stage. `stopAfter` stops after a named workflow stage for inspection. For an
async atomic sequence, retain the complete output containing the provider task
ID, invoke its one-status-read stage after `nextPollAfterMs`, and pipe a
succeeded output to download and persistence. No stage blocks in an internal
poll loop.

## Safety

- Owner identity is supplied by the MCP server, never trusted from stage JSON.
- Inputs and outputs reject secret-like fields, binary values, and media data
  URLs. Provider credentials stay inside production handlers.
- Publication is not a generation stage. Use `lumenclip_output_publish`
  separately; its explicit confirmation, QA override, account, and scheduling
  rules are unchanged.
- Provider stages return provider/model/task metadata and durable references,
  not secrets or media bytes.

## Boundary audit

All slideshow Rendi, UGC ElevenLabs, UGC fal, and UGC Rendi provider calls now
have independently callable atomic stages. Rendi multipart initialization,
each signed part PUT, completion, one file-status read, command submission, one
command-status read, each output download, and each persistence action are
separate. MCP composites resume through the registered handlers.

The storage boundary is decomposed as well:

- `render-store-pngs` invokes registered prepare, per-asset staging,
  per-slide local render, per-file create/delete, result create/update,
  per-media create/delete, and post-identity/post-row stages. It no longer
  calls `createSlideshowResultRecord`.
- slideshow video preparation reads the result through registered page/media
  stages and stages each rendered PNG with `read-one-video-slide`.
  Finalization builds the update locally, invokes `update-result-document`,
  then synchronizes media through registered singular stages.
- saved UGC state exposes one-request template/run/usage/output reads,
  separate creates and updates, one-object inspect/read/create/delete stages,
  one output-media page/create/delete, and one notification-job create.
- image/word/usage/run/result pagination is driven by composites that repeatedly
  invoke fixed-domain page stages. X/Threads create-vs-update and media
  replacement similarly dispatch registered document and media stages.

No stage accepts a physical Appwrite table/collection ID, bucket, owner, or
arbitrary query. The server supplies the owner; fixed-domain handlers derive
row and file IDs. Storage replacement and transient retries are explicit repeat
invocations of registered atomics, never hidden second calls inside an atomic
handler.
