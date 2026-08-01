---
title: "Slideshow generation pipeline"
description: "Transform a slideshow automation and its asset collections into rendered slides and an optional MP4."
---

# Slideshow generation pipeline

The pipeline transforms an automation snapshot, asset collections, and generation history into a
stored slideshow. `"...output": "stage-N output"` means the complete preceding output is piped
into the next input.

## Stage 1 — Validate generation input

**Input**

```json
{
  "automationId": "automation-astrology-01",
  "automationName": "Daily zodiac signs",
  "scheduledFor": "2026-08-01T03:00:00.000Z",
  "schema": {
    "hooks": [{ "id": "hook-1", "text": "3 signs that need to hear this", "enabled": true }],
    "hook_slots": { "SIGN": "zodiac-signs" },
    "formatting": [
      { "id": "hook", "slideCount": 1 },
      { "id": "content", "slideCount": 3 },
      { "id": "cta", "slideCount": 1 }
    ],
    "image_collection_ids": {
      "first_slide": { "collection_id": "zodiac-covers", "mode": "collection" },
      "content_slides": { "collection_id": "zodiac-scenes" },
      "cta_slide": { "collection_id": "zodiac-cta", "check": true }
    },
    "language": "English",
    "web_search_enabled": true
  },
  "collections": [
    { "id": "zodiac-covers", "assetCount": 20 },
    { "id": "zodiac-scenes", "assetCount": 80 },
    { "id": "zodiac-cta", "assetCount": 5 }
  ],
  "wordCollections": [{ "id": "zodiac-signs", "values": ["Aries", "Cancer", "Pisces"] }],
  "usageHistory": [],
  "generationSettings": { "slideshowTextModel": "openai/gpt-5.6-luna" }
}
```

**Processing:** normalize the schema and require enabled hooks, referenced collections, usable
assets, valid word-collection bindings, slide sections, and an OpenRouter key.

**Output**

```json
{
  "automation": { "id": "automation-astrology-01", "name": "Daily zodiac signs" },
  "scheduledFor": "2026-08-01T03:00:00.000Z",
  "schema": { "status": "valid", "language": "English", "webSearchEnabled": true },
  "collectionsById": {
    "zodiac-covers": { "assetCount": 20 },
    "zodiac-scenes": { "assetCount": 80 },
    "zodiac-cta": { "assetCount": 5 }
  },
  "wordCollectionsById": { "zodiac-signs": { "valueCount": 3 } },
  "usageHistory": [],
  "textModel": "openai/gpt-5.6-luna",
  "blockers": []
}
```

**Model/provider:** none.

## Stage 2 — Resolve slide count

**Input**

```json
{
  "...output": "stage-1 output",
  "formatting": {
    "hook": { "slideCount": 1 },
    "content": { "slideCountMode": "static", "slideCount": 3 },
    "cta": { "slideCount": 1 }
  }
}
```

**Processing:** resolve static or ranged body count. A hook-specific `bodySlideCount` overrides the
automation default when that hook is later selected.

**Output**

```json
{
  "...output": "stage-1 output",
  "slideCount": {
    "mode": "static",
    "hook": 1,
    "body": 3,
    "cta": 1,
    "total": 5,
    "minimum": 3,
    "maximum": 3
  }
}
```

**Model/provider:** none.

## Stage 3 — Select and expand hook

**Input**

```json
{
  "...output": "stage-2 output",
  "enabledHooks": [
    { "id": "hook-1", "text": "3 signs that need to hear this", "enabled": true },
    { "id": "hook-2", "text": "Why [[SIGN]] goes quiet", "enabled": true }
  ],
  "hookSlots": { "SIGN": "zodiac-signs" },
  "recentPublishedHookKeys": [],
  "distinctVariableDraws": true
}
```

**Processing:** exclude recently published hooks and combinations, choose a hook, draw variable
values, enforce distinct draws, and apply casing plus hook-specific tone/count overrides.

**Output**

```json
{
  "...output": "stage-2 output",
  "hook": "Why Cancer goes quiet",
  "hookId": "hook-2",
  "hookTemplate": "Why [[SIGN]] goes quiet",
  "hookSubstitutions": { "SIGN": "Cancer" },
  "hookToneOverride": null,
  "bodySlideCountOverride": null
}
```

**Model/provider:** none.

## Stage 4 — Optional web research

**Input**

```json
{
  "...output": "stage-3 output",
  "enabled": true,
  "hook": "Why Cancer goes quiet",
  "automationName": "Daily zodiac signs",
  "model": "openai/gpt-5.4-mini",
  "maxResults": 5
}
```

**Processing:** research the exact hook and keep concise facts with source URLs. When disabled,
`research` is `null` and the preceding output passes through.

**Output**

```json
{
  "...output": "stage-3 output",
  "research": {
    "summary": "Concise source-grounded facts relevant to the selected hook.",
    "sources": [
      { "title": "Source title", "url": "https://example.com/source" }
    ]
  },
  "webSearchSources": ["https://example.com/source"]
}
```

**Model/provider:** `openai/gpt-5.4-mini` via OpenRouter, using the Exa web plugin.

## Stage 5 — Build structured generation prompt

**Input**

```json
{
  "...output": "stage-4 output",
  "tone": "Conversational & Relatable",
  "narrative": "Explain the behavior without making medical claims.",
  "slideRoles": ["hook", "content", "content", "content", "cta"],
  "wordLimits": {
    "hook": { "minimum": 4, "maximum": 12 },
    "content": { "minimum": 12, "maximum": 35 },
    "cta": { "minimum": 3, "maximum": 12 }
  },
  "recentHeadings": [],
  "research": { "summary": "Concise source-grounded facts." }
}
```

**Processing:** compile all content, formatting, metadata, avoidance, and research instructions
into a structured OpenRouter request.

**Output**

```json
{
  "...output": "stage-4 output",
  "promptPayload": {
    "model": "openai/gpt-5.6-luna",
    "selectedHook": "Why Cancer goes quiet",
    "messages": [
      { "role": "system", "content": "Slideshow generation rules and JSON contract" },
      { "role": "user", "content": "Automation, slide, research, and avoidance instructions" }
    ]
  },
  "responseSchema": {
    "name": "slideshow_text",
    "required": ["title", "caption", "hashtags", "text"]
  }
}
```

**Model/provider:** none; this stage only constructs the next provider request.

## Stage 6 — Generate slideshow text

**Input**

```json
{
  "...output": "stage-5 output",
  "model": "openai/gpt-5.6-luna",
  "promptPayload": { "messages": "stage-5 messages" },
  "responseSchema": { "name": "slideshow_text" }
}
```

**Processing:** generate structured metadata and slide text, normalize punctuation/case, and
validate required fields and configured word ranges.

**Output**

```json
{
  "...output": "stage-5 output",
  "generatedText": {
    "title": "Why Cancer Goes Quiet",
    "caption": "Silence is sometimes how Cancer makes room to process.",
    "hashtags": ["cancer", "zodiac", "astrology"],
    "text": {
      "hook": "Why Cancer goes quiet",
      "content-1": "They notice the emotional shift before anyone names it.",
      "content-2": "Distance gives them time to separate instinct from reaction.",
      "content-3": "They return when their words feel honest instead of defensive.",
      "cta": "Save this for the Cancer in your life."
    }
  },
  "textModel": "openai/gpt-5.6-luna",
  "violations": [],
  "providerAttempts": 1
}
```

**Model/provider:** configured `slideshowTextModel`; default `openai/gpt-5.6-luna` via
OpenRouter.

## Stage 7 — Similarity retry

**Input**

```json
{
  "...output": "stage-6 output",
  "generatedSignature": "why cancer goes quiet they notice the emotional shift",
  "recentPublishedSignatures": ["why cancer goes quiet they feel every emotional shift"],
  "similarityThreshold": 0.85
}
```

**Processing:** compare normalized output with recent published text. When the threshold is met,
regenerate once with exact text and heading exclusions. Otherwise pass stage 6 through unchanged.

**Output**

```json
{
  "...output": "stage-6 output",
  "generatedText": { "title": "What Cancer's Silence Is Doing", "text": "revised structured text" },
  "textSimilarityRetry": true,
  "similarityAfterRetry": 0.41
}
```

**Model/provider:** same configured slideshow model via OpenRouter.

## Stage 8 — Derive visual concepts

**Input**

```json
{
  "...output": "stage-7 output",
  "model": "openai/gpt-5.6-luna",
  "slides": [
    { "id": "content-1", "text": "They notice the emotional shift before anyone names it." },
    { "id": "content-2", "text": "Distance gives them time to separate instinct from reaction." }
  ]
}
```

**Processing:** convert abstract copy into concrete subjects, objects, settings, lighting, and
colors suitable for caption matching. Provider failure returns an empty array per slide.

**Output**

```json
{
  "...output": "stage-7 output",
  "visualConceptsBySlide": [
    { "slideId": "content-1", "concepts": ["person noticing a mood change", "dim room", "blue light"] },
    { "slideId": "content-2", "concepts": ["solitary figure by water", "moonlight", "quiet reflection"] }
  ]
}
```

**Model/provider:** same configured slideshow model via OpenRouter.

## Stage 9 — Build image shortlists

**Input**

```json
{
  "...output": "stage-8 output",
  "collectionBindings": {
    "hook": "zodiac-covers",
    "content": "zodiac-scenes",
    "cta": "zodiac-cta"
  },
  "visualConceptsBySlide": "stage-8 concepts",
  "recentImageUsage": ["image-used-last-week"],
  "shortlistLimit": 12
}
```

**Processing:** load candidates, exclude recent usage, honor pinned assets, score caption/concept
overlap locally, and retain at most 12 candidates for each unpinned slide.

**Output**

```json
{
  "...output": "stage-8 output",
  "shortlists": [
    {
      "slideId": "content-1",
      "candidates": [
        { "index": 0, "id": "image-44", "caption": "Person in blue light watching a quiet room", "localScore": 16 },
        { "index": 1, "id": "image-12", "caption": "Moonlit portrait near water", "localScore": 8 }
      ]
    }
  ]
}
```

**Model/provider:** none.

## Stage 10 — Select images

**Input**

```json
{
  "...output": "stage-9 output",
  "model": "openai/gpt-5.6-luna",
  "slideText": "They notice the emotional shift before anyone names it.",
  "visualConcepts": ["person noticing a mood change", "dim room", "blue light"],
  "candidates": [
    { "index": 0, "id": "image-44", "caption": "Person in blue light watching a quiet room" },
    { "index": 1, "id": "image-12", "caption": "Moonlit portrait near water" }
  ]
}
```

**Processing:** choose one candidate index per slide. A malformed or out-of-range provider result
falls back to candidate 0.

**Output**

```json
{
  "...output": "stage-9 output",
  "selectedImages": [
    { "slideId": "content-1", "imageId": "image-44", "imageUrl": "/api/local-assets/image-44.jpg", "selection": "model" }
  ]
}
```

**Model/provider:** same configured slideshow model via OpenRouter.

## Stage 11 — Assemble slideshow plan

**Input**

```json
{
  "...output": "stage-10 output",
  "generatedText": "stage-7 structured text",
  "selectedImages": "stage-10 selected images",
  "layout": {
    "aspectRatio": "9:16",
    "imageFit": "cover",
    "font": "Inter",
    "slideDurationSeconds": 3
  }
}
```

**Processing:** attach each text item to its selected image, role, overlay, icon layout, aspect
ratio, placement, and duration.

**Output**

```json
{
  "plan": {
    "title": "What Cancer's Silence Is Doing",
    "caption": "Silence is sometimes how Cancer makes room to process.",
    "hashtags": "#cancer #zodiac #astrology",
    "hook": "Why Cancer goes quiet",
    "textModel": "openai/gpt-5.6-luna",
    "slides": [
      {
        "id": "slide-1",
        "role": "hook",
        "imageUrl": "/api/local-assets/hook.jpg",
        "textItems": [{ "id": "hook-text", "text": "Why Cancer goes quiet" }],
        "aspectRatio": "9:16",
        "durationMs": 3000
      }
    ]
  }
}
```

**Model/provider:** none.

## Stage 12 — Optional translation

**Input**

```json
{
  "...output": "stage-11 output",
  "language": "German",
  "texts": ["Why Cancer goes quiet", "They notice the emotional shift before anyone names it."]
}
```

**Processing:** translate every displayed text item when the language maps to a DeepL target.
English and unsupported targets pass through unchanged. Missing translations fail the stage.

**Output**

```json
{
  "...output": "stage-11 output",
  "localizedPlan": {
    "language": "German",
    "slides": [
      { "id": "slide-1", "textItems": [{ "id": "hook-text", "text": "Warum Krebs still wird" }] }
    ]
  }
}
```

**Model/provider:** DeepL API. LumenClip does not select a DeepL model.

## Stage 13 — Render PNG slides

**Input**

```json
{
  "...output": "stage-12 output",
  "slideshowId": "slideshow-run-01",
  "plan": "localized stage-12 plan",
  "renderSettings": { "aspectRatio": "9:16", "font": "Inter", "imageFit": "cover" }
}
```

**Processing:** load source/overlay/icon bytes, render each slide to SVG, rasterize it with
`sharp`, and persist ordered PNGs.

**Output**

```json
{
  "...output": "stage-12 output",
  "slideshowId": "slideshow-run-01",
  "outputImages": [
    "/api/local-assets/slideshows/outputs/slideshow-run-01/slide-001.png",
    "/api/local-assets/slideshows/outputs/slideshow-run-01/slide-002.png"
  ],
  "thumbnailUrl": "/api/local-assets/slideshows/outputs/slideshow-run-01/slide-001.png",
  "renderedSlides": [{ "id": "slide-1", "role": "hook", "durationMs": 3000 }]
}
```

**Model/provider:** none; local SVG renderer and `sharp`.

## Stage 14 — Optional MP4 render

**Input**

```json
{
  "...output": "stage-13 output",
  "publishType": "video",
  "frames": ["slide-001.png", "slide-002.png"],
  "durationSecondsPerFrame": 3,
  "outputFormat": "mp4"
}
```

**Processing:** upload frames to Rendi, build an FFmpeg concat command, render H.264, download the
video, and persist it. Slideshow publish type skips this stage.

**Output**

```json
{
  "...output": "stage-13 output",
  "videoUrl": "/api/local-assets/slideshows/outputs/slideshow-run-01/slideshow-export.mp4",
  "videoProvider": "rendi",
  "videoProcessor": "ffmpeg"
}
```

**Model/provider:** no AI model; Rendi executes FFmpeg.

## Stage 15 — Validate generated output

**Input**

```json
{
  "...output": "stage-14 output",
  "expectedSlideCount": 5,
  "slides": "rendered stage-13 slides",
  "hookSubstitutions": { "SIGN": "Cancer" },
  "reusePolicy": { "textSimilarityThreshold": 0.85 }
}
```

**Processing:** check count, empty text, unresolved tokens, word ranges, duplicate variable draws,
and near-duplicate output.

**Output**

```json
{
  "...output": "stage-14 output",
  "qa": {
    "valid": true,
    "findings": [],
    "checked": [
      "COUNT_MISMATCH",
      "EMPTY_SLIDE_TEXT",
      "UNRESOLVED_TOKEN",
      "WORD_LENGTH_VIOLATION",
      "DUPLICATE_VARIABLE_DRAW",
      "NEAR_DUPLICATE_OUTPUT"
    ]
  }
}
```

**Model/provider:** none.

## Stage 16 — Persist final output

**Input**

```json
{
  "...output": "stage-15 output",
  "automationId": "automation-astrology-01",
  "runId": "run-01",
  "slideshowId": "slideshow-run-01",
  "plan": "stage-12 localized plan",
  "artifacts": {
    "outputImages": "stage-13 PNG URLs",
    "videoUrl": "stage-14 MP4 URL",
    "thumbnailUrl": "stage-13 thumbnail URL"
  },
  "qa": "stage-15 QA result"
}
```

**Processing:** write the slideshow, result, run, artifact references, prompt/model trace, and
candidate usage. Published-use history is committed only after downstream publication evidence.

**Output**

```json
{
  "id": "slideshow-run-01",
  "kind": "slideshow",
  "runId": "run-01",
  "automationId": "automation-astrology-01",
  "title": "What Cancer's Silence Is Doing",
  "caption": "Silence is sometimes how Cancer makes room to process.",
  "hashtags": "#cancer #zodiac #astrology",
  "outputImages": [
    "/api/local-assets/slideshows/outputs/slideshow-run-01/slide-001.png",
    "/api/local-assets/slideshows/outputs/slideshow-run-01/slide-002.png"
  ],
  "videoUrl": "/api/local-assets/slideshows/outputs/slideshow-run-01/slideshow-export.mp4",
  "thumbnailUrl": "/api/local-assets/slideshows/outputs/slideshow-run-01/slide-001.png",
  "model": "openai/gpt-5.6-luna",
  "qa": { "valid": true, "findings": [] }
}
```

**Model/provider:** none; Appwrite database/storage. Publication consumes this output downstream
and is not part of the pipeline.
