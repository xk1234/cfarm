# Production generation pipelines

The pipeline MCP surface exposes the live cfarm generation architecture, not a
generic wrapper around unrelated MCP tools. Every workflow is an ordered list
of registered stage handlers. Full-workflow execution and single-stage
execution look up and invoke the same handler object.

## Tools

| Tool                           | Purpose                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `lumenclip_pipeline_catalog`   | List workflows, ordered stages, stage kind, provider, model, and optionality.                         |
| `lumenclip_pipeline_stage_run` | Run one named stage with explicit JSON input.                                                         |
| `lumenclip_pipeline_run`       | Run a named workflow and pipe each complete structured stage output into the next registered handler. |

The older caller-defined `lumenclip_workflow_run` and
`lumenclip_workflow_step_run` tool-wrapper contracts are not part of this
surface. They were too coarse to expose production generation boundaries.

## Run a complete workflow

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

`input` is passed to stage 1. A stage returns the complete pipeline envelope,
which becomes the next stage's input without a client-side mapping layer. The
result includes ordered stage executions, the final structured output, and
published stage metadata.

Use `startAt` only to resume from an envelope previously returned by the prior
stage. Use `stopAfter` to deliberately stop after a named stage for inspection
or composition.

## Run one stage

```json
{
  "stageId": "slideshow-generation.build-image-shortlists",
  "requestId": "slideshow-2026-08-01",
  "input": {
    "visualConceptsBySlide": [
      {
        "slideId": "content-1",
        "concepts": ["person in blue light", "quiet room"]
      }
    ],
    "candidatesBySlide": [
      {
        "slideId": "content-1",
        "slideText": "They notice the emotional shift first.",
        "candidates": [
          {
            "id": "image-44",
            "imageUrl": "/api/assets/image-44.jpg",
            "caption": "Person in blue light watching a quiet room"
          }
        ]
      }
    ]
  }
}
```

The response identifies the stage as `deterministic`, `provider`, or
`storage`. Provider stages also publish provider/model metadata. Conditional
provider stages state when no provider was called in their structured output.

## Registered stages

### `slideshow-generation`

1. `validate-input` — owner-scoped storage read plus deterministic validation
2. `resolve-slide-count` — deterministic
3. `select-expand-hook` — deterministic
4. `research-hook` — OpenRouter + Exa (`openai/gpt-5.4-mini`), optional
5. `build-text-prompt` — deterministic
6. `generate-slide-text` — OpenRouter (configured slideshow model)
7. `retry-text-similarity` — deterministic comparison plus conditional OpenRouter rewrite
8. `derive-visual-concepts` — conditional OpenRouter
9. `build-image-shortlists` — deterministic caption/concept ranking, at most 12 candidates
10. `select-slide-images` — pinned/deterministic selection or conditional OpenRouter choice
11. `assemble-plan` — deterministic
12. `translate-plan` — conditional DeepL
13. `render-store-pngs` — local SVG/Sharp render plus owner-scoped storage
14. `render-store-mp4` — conditional Rendi/FFmpeg
15. `validate-output` — deterministic QA
16. `finalize-output` — owner-scoped result/run/reuse-memory storage

The fixed selected hook is context, never a model-fillable text placeholder.
Image stages exchange candidate IDs, captions, URLs, and storage references;
they never exchange image bytes.

### `ugc-video-generation`

1. `analyze-product` — guarded public HTTP fetch + OpenRouter analysis
2. `generate-script-plan` — OpenRouter script generation and validation
3. `resolve-generate-actor` — configured asset or fal.ai actor generation
4. `synthesize-voice` — ElevenLabs speech and timestamps
5. `animate-actor` — fal.ai image-to-video
6. `lip-sync-performance` — fal.ai standard/premium lip sync
7. `generate-broll` — fal.ai supporting images
8. `composite-output` — Rendi/FFmpeg captions, overlays, MP4, and thumbnail
9. `store-final-output` — owner-scoped canonical output and media references

Saved UGC stage calls return queue operations. They include `stopAfter` in the
worker job and resume through the production durable-checkpoint runner. Retain
the stage envelope, poll with `lumenclip_operation_get`, then pass that retained
envelope to the next stage after the operation succeeds. Deleted checkpoint
files make the provider stage run and bill again, matching the production UGC
retry contract.

### `linkedin-generation`

1. `validate-input` — deterministic
2. `resolve-brief` — supplied brief or OpenRouter derivation
3. `select-post-plan` — deterministic
4. `build-generation-request` — deterministic production prompt/schema
5. `generate-compose` — one OpenRouter structured generation attempt
6. `validate-draft` — deterministic format, proof, claim, and slot checks
7. `repair-draft` — conditional OpenRouter repair, at most three total attempts
8. `complete-batch` — repeat stages 3–7 through the same registry for 1–4 posts

This workflow is stateless and does not store or publish the returned posts.

### `x-threads-generation`

1. `validate-input` — owner-scoped storage read plus deterministic validation
2. `resolve-brief` — persisted brief or explicit OpenRouter preflight
3. `select-content-plan` — deterministic
4. `build-generation-request` — deterministic
5. `generate-draft` — OpenRouter structured generation
6. `humanize-draft` — optional brand-voice pass
7. `review-draft` — optional factual/brand review
8. `validate-draft` — deterministic platform and proof checks
9. `repair-draft` — one conditional OpenRouter retry
10. `benchmark-build-run` — deterministic scoring and run construction
11. `persist-run-memory` — owner-scoped run, reminder, and reuse memory
12. `generate-image` — optional KIE.ai `nano-banana-pro` generation and storage

Publication consumes the stored draft downstream and is never a pipeline
stage.

## Safety and operations

- Owner scope comes from the MCP server (`LUMENCLIP_MCP_OWNER_ID` or the
  configured system owner), never from stage JSON.
- Inputs and outputs reject secret-like fields, binary values, and media data
  URLs. Provider credentials are read only inside production handlers.
- Stages return durable storage paths, asset URLs, resource URIs, provider
  request IDs, and model metadata—not media bytes or credentials.
- A stage that returns a queued/running operation pauses full-workflow
  execution at that stage. No polling loop blocks the MCP request.
- Generation pipelines never append publication. Use
  `lumenclip_output_publish` separately with its normal explicit confirmation,
  QA override, account, and scheduling rules.
- The executor performs no generic retries. Retry policy belongs to the
  registered production stage (for example LinkedIn repair or UGC checkpoint
  resume), so whole and single-stage execution behave identically.
