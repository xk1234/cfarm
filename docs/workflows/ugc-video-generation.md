---
title: "UGC video generation pipeline"
description: "Transform a product source and actor configuration into a voiced, animated, lip-synced, composited video."
---

# UGC video generation pipeline

**Availability:** implemented and checkpointed, but requires `ENABLE_UGC_AUTOMATION=true` plus
provider credentials in the worker.

`"...output": "stage-N output"` means the complete JSON output from stage N is piped into the
next stage. The example values below are abbreviated, but every block is valid JSON.

Each stage writes a checkpoint. On retry, a stage is skipped only when its checkpoint exists and
every referenced storage file is still durable.

## Stage 1 — Analyze the product

**Input**

```json
{
  "automationId": "ugc-automation-123",
  "scheduledFor": "2026-08-01T09:00:00.000Z",
  "productUrl": "https://example.com/product",
  "productBrief": "A lightweight analytics product for small SaaS teams.",
  "targetDurationSeconds": 30,
  "actorSource": "generate",
  "actorAssetUrl": null,
  "actorPrompt": "Friendly product operator in a bright home office",
  "motionPrompt": "Natural delivery with subtle head and hand movement",
  "voiceId": "voice-123",
  "voiceModel": "eleven_multilingual_v2",
  "lipSyncTier": "standard",
  "brollCount": 3,
  "captions": { "enabled": true, "style": "bold" },
  "hookOverlay": { "enabled": true, "position": "top" }
}
```

**Output**

```json
{
  "input": {
    "automationId": "ugc-automation-123",
    "scheduledFor": "2026-08-01T09:00:00.000Z",
    "targetDurationSeconds": 30,
    "actorSource": "generate",
    "voiceId": "voice-123",
    "voiceModel": "eleven_multilingual_v2",
    "lipSyncTier": "standard",
    "brollCount": 3
  },
  "analysis": {
    "product": "Lightweight SaaS analytics",
    "audience": "Small SaaS product teams",
    "painPoints": ["Slow reporting", "Scattered activation data"],
    "differentiators": ["Fast setup", "Focused dashboards"],
    "proof": ["Product-page proof extracted in stage 1"],
    "prohibitedClaims": ["Guaranteed revenue growth"],
    "cta": "Start a trial",
    "visualCues": ["Dashboard close-up", "Team reviewing metrics"]
  },
  "checkpoint": { "stage": "analysis", "status": "complete" }
}
```

**Processing:** fetch the public product page behind SSRF, DNS, redirect, HTML, and 1 MB guards;
combine it with the manual brief; then extract the product, audience, pains, differentiators,
proof, prohibited claims, CTA, and visual cues.

**Model/provider:** `openai/gpt-5.4-mini` via OpenRouter.

## Stage 2 — Generate the script plan

**Input**

```json
{
  "...output": "stage-1 output",
  "scriptConstraints": {
    "targetDurationSeconds": 30,
    "requiredPhases": ["hook", "problem", "solution", "cta"]
  }
}
```

**Output**

```json
{
  "...output": "stage-1 output",
  "plan": {
    "hook": "Your weekly product report should not take all morning.",
    "caption": "A faster way to see what drives activation.",
    "hashtags": ["saas", "productanalytics"],
    "hookOverlay": "STOP BUILDING REPORTS BY HAND",
    "segments": [
      {
        "phase": "hook",
        "spokenText": "Your weekly product report should not take all morning.",
        "startMs": 0,
        "endMs": 4500,
        "brollPrompt": "Operator switching from a spreadsheet to a clean dashboard"
      },
      {
        "phase": "problem",
        "spokenText": "stage-2 problem segment",
        "startMs": 4500,
        "endMs": 11000,
        "brollPrompt": "Messy reporting workflow"
      },
      {
        "phase": "solution",
        "spokenText": "stage-2 solution segment",
        "startMs": 11000,
        "endMs": 24000,
        "brollPrompt": "Focused activation dashboard"
      },
      {
        "phase": "cta",
        "spokenText": "Start a trial and see your activation path today.",
        "startMs": 24000,
        "endMs": 30000,
        "brollPrompt": "Product trial call to action"
      }
    ]
  },
  "checkpoint": { "stage": "script", "status": "complete" }
}
```

**Processing:** generate hook/problem/solution/CTA segments, spoken text, timing, b-roll prompts,
caption, hashtags, and hook overlay; validate all phases and keep duration within 125% of target.

**Model/provider:** `anthropic/claude-sonnet-5` via OpenRouter.

## Stage 3 — Resolve or generate the actor

**Input**

```json
{
  "...output": "stage-2 output",
  "actor": {
    "source": "generate",
    "assetUrl": null,
    "prompt": "Friendly product operator in a bright home office"
  }
}
```

**Output**

```json
{
  "...output": "stage-2 output",
  "actor": {
    "source": "generated",
    "path": "runs/ugc-run-123/actor.png",
    "mimeType": "image/png",
    "model": "fal-ai/flux-2-pro"
  },
  "checkpoint": {
    "stage": "actor",
    "status": "complete",
    "files": ["runs/ugc-run-123/actor.png"]
  }
}
```

**Processing:** use a configured gallery/upload portrait when supplied; otherwise generate a
portrait from actor settings and product analysis, download it, and persist `actor.png`.

**Model/provider:** generated branch uses `fal-ai/flux-2-pro` via fal.ai; configured-asset branch
uses no model.

## Stage 4 — Synthesize the voice track

**Input**

```json
{
  "...output": "stage-3 output",
  "voice": {
    "voiceId": "voice-123",
    "model": "eleven_multilingual_v2",
    "text": "stage-2 spoken segments joined in order"
  }
}
```

**Output**

```json
{
  "...output": "stage-3 output",
  "voice": {
    "audioPath": "runs/ugc-run-123/voice.mp3",
    "timingsPath": "runs/ugc-run-123/voice-timings.json",
    "words": [
      { "text": "Your", "startMs": 0, "endMs": 260 },
      { "text": "weekly", "startMs": 260, "endMs": 610 }
    ],
    "durationMs": 29600,
    "model": "eleven_multilingual_v2"
  },
  "checkpoint": {
    "stage": "voice",
    "status": "complete",
    "files": ["runs/ugc-run-123/voice.mp3", "runs/ugc-run-123/voice-timings.json"]
  }
}
```

**Processing:** join the spoken segments, synthesize speech with timestamps, and persist the audio
and word-timing data.

**Model/provider:** configured voice model; default `eleven_multilingual_v2` via ElevenLabs.

## Stage 5 — Animate the actor

**Input**

```json
{
  "...output": "stage-4 output",
  "motion": {
    "sourceImagePath": "runs/ugc-run-123/actor.png",
    "prompt": "Natural delivery with subtle head and hand movement"
  }
}
```

**Output**

```json
{
  "...output": "stage-4 output",
  "motion": {
    "videoPath": "runs/ugc-run-123/motion.mp4",
    "model": "fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video"
  },
  "checkpoint": {
    "stage": "motion",
    "status": "complete",
    "files": ["runs/ugc-run-123/motion.mp4"]
  }
}
```

**Processing:** animate the actor still with the configured or default motion prompt, download the
result, and persist the video.

**Model/provider:** `fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video` via fal.ai.

## Stage 6 — Lip-sync the performance

**Input**

```json
{
  "...output": "stage-5 output",
  "lipSync": {
    "tier": "standard",
    "videoPath": "runs/ugc-run-123/motion.mp4",
    "audioPath": "runs/ugc-run-123/voice.mp3"
  }
}
```

**Output**

```json
{
  "...output": "stage-5 output",
  "lipsync": {
    "videoPath": "runs/ugc-run-123/lipsync.mp4",
    "tier": "standard",
    "model": "veed/lipsync"
  },
  "checkpoint": {
    "stage": "lipsync",
    "status": "complete",
    "files": ["runs/ugc-run-123/lipsync.mp4"]
  }
}
```

**Processing:** synchronize the animated actor video with the synthesized speech and persist the
result.

**Model/provider:** standard tier uses `veed/lipsync`; premium uses
`fal-ai/kling-video/ai-avatar/v2/standard`; both run through fal.ai.

## Stage 7 — Generate b-roll assets

**Input**

```json
{
  "...output": "stage-6 output",
  "broll": {
    "count": 3,
    "prompts": [
      "Operator switching from a spreadsheet to a clean dashboard",
      "Messy reporting workflow",
      "Focused activation dashboard"
    ]
  }
}
```

**Output**

```json
{
  "...output": "stage-6 output",
  "broll": {
    "assets": [
      {
        "path": "runs/ugc-run-123/broll-0.png",
        "startMs": 0,
        "endMs": 4500,
        "prompt": "Operator switching from a spreadsheet to a clean dashboard"
      },
      {
        "path": "runs/ugc-run-123/broll-1.png",
        "startMs": 4500,
        "endMs": 11000,
        "prompt": "Messy reporting workflow"
      },
      {
        "path": "runs/ugc-run-123/broll-2.png",
        "startMs": 11000,
        "endMs": 24000,
        "prompt": "Focused activation dashboard"
      }
    ],
    "model": "fal-ai/flux-2-pro"
  },
  "checkpoint": {
    "stage": "broll",
    "status": "complete",
    "files": [
      "runs/ugc-run-123/broll-0.png",
      "runs/ugc-run-123/broll-1.png",
      "runs/ugc-run-123/broll-2.png"
    ]
  }
}
```

**Processing:** generate up to six prompted supporting images, persist them, and attach each
asset's display window from the script plan.

**Model/provider:** `fal-ai/flux-2-pro` via fal.ai.

## Stage 8 — Composite video, captions, and thumbnail

**Input**

```json
{
  "...output": "stage-7 output",
  "render": {
    "baseVideoPath": "runs/ugc-run-123/lipsync.mp4",
    "audioPath": "runs/ugc-run-123/voice.mp3",
    "broll": "stage-7 broll.assets",
    "wordTimings": "stage-4 voice.words",
    "captions": { "enabled": true, "style": "bold" },
    "hookOverlay": { "enabled": true, "position": "top" },
    "width": 1080,
    "height": 1920,
    "fps": 30
  }
}
```

**Output**

```json
{
  "...output": "stage-7 output",
  "composite": {
    "videoPath": "runs/ugc-run-123/final.mp4",
    "thumbnailPath": "runs/ugc-run-123/thumbnail.jpg",
    "command": "stage-8 generated FFmpeg command",
    "width": 1080,
    "height": 1920,
    "fps": 30
  },
  "checkpoint": {
    "stage": "composite",
    "status": "complete",
    "files": ["runs/ugc-run-123/final.mp4", "runs/ugc-run-123/thumbnail.jpg"]
  }
}
```

**Processing:** build one FFmpeg specification with the lip-synced base, timed b-roll/Ken Burns
overlays, hook text, word-timed ASS captions, and thumbnail; render at 1080×1920 and 30 fps.

**Model/provider:** none; Rendi executes FFmpeg.

## Stage 9 — Store the final output

**Input**

```json
{
  "...output": "stage-8 output",
  "run": {
    "id": "ugc-run-123",
    "automationId": "ugc-automation-123"
  }
}
```

**Output**

```json
{
  "output": {
    "id": "ugc-output-123",
    "kind": "ugc_ad",
    "runId": "ugc-run-123",
    "automationId": "ugc-automation-123",
    "videoPath": "runs/ugc-run-123/final.mp4",
    "thumbnailPath": "runs/ugc-run-123/thumbnail.jpg",
    "hook": "Your weekly product report should not take all morning.",
    "caption": "A faster way to see what drives activation.",
    "hashtags": ["saas", "productanalytics"],
    "segments": "stage-2 plan.segments",
    "checkpoints": "stage-1 through stage-9 checkpoint map",
    "providerUsage": [
      { "provider": "OpenRouter", "model": "openai/gpt-5.4-mini", "stage": "analysis" },
      { "provider": "OpenRouter", "model": "anthropic/claude-sonnet-5", "stage": "script" },
      { "provider": "fal.ai", "model": "fal-ai/flux-2-pro", "stage": "actor" },
      { "provider": "ElevenLabs", "model": "eleven_multilingual_v2", "stage": "voice" }
    ]
  }
}
```

**Processing:** persist the final video, thumbnail, script plan, model/provider provenance,
checkpoint map, usage ledger, and output/media records.

**Model/provider:** none; Appwrite storage and database.

Publication is downstream and is not part of this generation pipeline. Missing or deleted
checkpoint files cause that stage to run again and may rebill its provider. A composite failure
keeps earlier checkpoints but emits no final output record.
