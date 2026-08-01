---
title: "X and Threads generation pipeline"
description: "Transform a persisted X/Threads automation and optional trend source into validated social text and optional generated media."
---

# X and Threads generation pipeline

`"...output": "stage-N output"` represents the complete preceding output. It is documentation
shorthand rather than a literal runtime field.

## Stage map

| #   | Stage                        | Adds to the preceding output                          |
| --- | ---------------------------- | ----------------------------------------------------- |
| 1   | Validate and normalize input | Platform automation and validation result             |
| 2   | Derive niche brief           | Audience, promise, pillars, keywords, and pain points |
| 3   | Select content plan          | Archetype, pillar, hook style, topic, and proof       |
| 4   | Build generation request     | Prompt messages and structured response schema        |
| 5   | Generate draft               | Hook, body, closer, and composed posts                |
| 6   | Optional humanize            | Brand-voice rewrite                                   |
| 7   | Optional model review        | Pass/fix verdict and reviewed content                 |
| 8   | Deterministic validation     | Platform, proof, formatting, and repetition findings  |
| 9   | Repair retry                 | Accepted content or unresolved review findings        |
| 10  | Build optional image prompt  | Topic-aware media prompt                              |
| 11  | Optional image generation    | Downloaded image URLs                                 |
| 12  | Benchmark and persist        | Draft run, score, trace, and recent-use memory        |

## Stage 1 — Validate and normalize input

**Input**

```json
{
  "automation": {
    "id": "x-auto-01",
    "platform": "x",
    "niche": { "label": "SaaS onboarding" },
    "brief": null,
    "proofBank": ["Reduced activation time from 3 days to 40 minutes"],
    "generation": {
      "model": "anthropic/claude-sonnet-5",
      "hookStyles": ["contrarian", "specific_observation"],
      "voicePreset": "practitioner"
    },
    "media": { "mode": "generate", "prompt": "Editorial product illustration" }
  },
  "topic": "activation checklists",
  "sourceCandidate": null,
  "brandProfile": {
    "voice": "Direct operator",
    "rules": ["Use concrete verbs", "Avoid motivational language"]
  }
}
```

**Output**

```json
{
  "automation": {
    "id": "x-auto-01",
    "platform": "x",
    "niche": "SaaS onboarding",
    "generationModel": "anthropic/claude-sonnet-5",
    "hookStyles": ["contrarian", "specific_observation"],
    "voicePreset": "practitioner",
    "mediaMode": "generate"
  },
  "topic": "activation checklists",
  "sourceCandidate": null,
  "proofBank": ["Reduced activation time from 3 days to 40 minutes"],
  "brandProfile": {
    "voice": "Direct operator",
    "rules": ["Use concrete verbs", "Avoid motivational language"]
  },
  "validationErrors": []
}
```

**Processing:** normalize platform defaults and require niche, limits, generation model, and
OpenRouter credentials.

**Model/provider:** none.

## Stage 2 — Derive niche brief

**Input**

```json
{
  "...output": "stage-1 output",
  "niche": "SaaS onboarding",
  "existingBrief": null,
  "primaryModel": "anthropic/claude-sonnet-5",
  "fallbackModels": ["google/gemini-3.1-flash-lite"]
}
```

**Output**

```json
{
  "...output": "stage-1 output",
  "brief": {
    "audience": "Product teams improving new-user activation",
    "promise": "Replace onboarding friction with measurable activation steps",
    "pillars": [
      { "label": "Activation design", "weight": 30 },
      { "label": "Onboarding research", "weight": 20 },
      { "label": "Retention systems", "weight": 15 }
    ],
    "keywords": ["activation", "onboarding", "time to value"],
    "painPoints": ["empty states", "long setup", "unclear first value"]
  },
  "selectedModel": "anthropic/claude-sonnet-5",
  "attempts": []
}
```

**Processing:** reuse a valid brief or generate one. The configured model receives two attempts;
the fallback receives one attempt after retryable failures.

**Model/provider:** configured/default `anthropic/claude-sonnet-5`, fallback
`google/gemini-3.1-flash-lite`, via OpenRouter.

## Stage 3 — Select content plan

**Input**

```json
{
  "...output": "stage-2 output",
  "platform": "x",
  "topic": "activation checklists",
  "proofBank": ["Reduced activation time from 3 days to 40 minutes"],
  "recentArchetypes": ["how_to"],
  "recentHookStyles": ["specific_observation"],
  "enabledHookStyles": ["contrarian", "specific_observation"]
}
```

**Output**

```json
{
  "...output": "stage-2 output",
  "plan": {
    "platform": "x",
    "archetype": {
      "id": "contrarian_lesson",
      "kind": "single",
      "label": "Contrarian lesson"
    },
    "pillar": { "label": "Activation design", "weight": 30 },
    "hookStyle": {
      "id": "contrarian",
      "formula": "Reject the common default, then explain why"
    },
    "topic": "activation checklists",
    "proof": ["Reduced activation time from 3 days to 40 minutes"],
    "recycleBody": null
  }
}
```

**Processing:** select an eligible non-repeating archetype, pillar, and hook style; enforce proof
requirements and platform eligibility.

**Model/provider:** none.

## Stage 4 — Build generation request

**Input**

```json
{
  "...output": "stage-3 output",
  "plan": "stage-3 plan",
  "platformLimits": { "maxCharacters": 280 },
  "voicePreset": "practitioner",
  "bannedRules": ["no links", "no unsupported claims", "no generic AI wording"]
}
```

**Output**

```json
{
  "...output": "stage-3 output",
  "generationRequest": {
    "model": "anthropic/claude-sonnet-5",
    "systemPrompt": "Platform, voice, factual, and anti-slop rules",
    "userPrompt": "Archetype, hook formula, topic, pillar, and proof",
    "responseSchema": {
      "name": "x_post_contrarian_lesson",
      "required": ["hook", "body", "closer"]
    }
  }
}
```

**Processing:** compile plan and platform rules into a structured-output request.

**Model/provider:** none.

## Stage 5 — Generate draft

**Input**

```json
{
  "...output": "stage-4 output",
  "generationRequest": "stage-4 request"
}
```

**Output**

```json
{
  "...output": "stage-4 output",
  "draft": {
    "hook": "Your onboarding checklist is probably too complete.",
    "body": "We cut every step that did not lead directly to first value. Activation time fell from 3 days to 40 minutes.",
    "closer": "Which setup step could disappear today?"
  },
  "rawPosts": [
    "Your onboarding checklist is probably too complete.\n\nWe cut every step that did not lead directly to first value. Activation time fell from 3 days to 40 minutes.\n\nWhich setup step could disappear today?"
  ],
  "model": "anthropic/claude-sonnet-5"
}
```

**Processing:** fill the selected schema or produce `---`-separated thread text.

**Model/provider:** automation's configured model; default `anthropic/claude-sonnet-5` via
OpenRouter.

## Stage 6 — Optional humanize

**Input**

```json
{
  "...output": "stage-5 output",
  "enabled": true,
  "brandProfile": {
    "voice": "Direct operator",
    "rules": ["Use concrete verbs", "Avoid motivational language"]
  },
  "draft": "stage-5 post text"
}
```

**Output**

```json
{
  "...output": "stage-5 output",
  "humanizedDraft": "Your onboarding checklist is too complete. We removed every step that didn't lead to first value. Activation time dropped from 3 days to 40 minutes. Which step can you delete today?",
  "trace": [{ "stage": "humanize", "model": "google/gemini-3.1-flash-lite" }]
}
```

**Processing:** when enabled with a brand profile, rewrite without changing facts, meaning, or
format. Otherwise pass the stage-5 draft through.

**Model/provider:** `google/gemini-3.1-flash-lite` via OpenRouter.

## Stage 7 — Optional model review

**Input**

```json
{
  "...output": "stage-6 output",
  "brandRules": ["Use concrete verbs", "Avoid motivational language"],
  "proofBank": ["Reduced activation time from 3 days to 40 minutes"],
  "content": "stage-6 humanized draft"
}
```

**Output**

```json
{
  "...output": "stage-6 output",
  "reviewedDraft": "Your onboarding checklist is too complete. We removed every step that didn't lead to first value. Activation time dropped from 3 days to 40 minutes. Which step can you delete today?",
  "verdict": "pass",
  "issues": [],
  "trace": [
    { "stage": "review", "model": "openai/gpt-5.4-mini", "verdict": "pass" }
  ]
}
```

**Processing:** review factual and brand constraints and return publishable content with a
`pass`/`fix` verdict.

**Model/provider:** `openai/gpt-5.4-mini` via OpenRouter.

## Stage 8 — Deterministic validation

**Input**

```json
{
  "...output": "stage-7 output",
  "platform": "x",
  "posts": ["stage-7 reviewed post"],
  "plan": "stage-3 plan",
  "proofBank": ["Reduced activation time from 3 days to 40 minutes"]
}
```

**Output**

```json
{
  "...output": "stage-7 output",
  "posts": [
    { "index": 0, "text": "stage-7 reviewed post", "characterCount": 203 }
  ],
  "validation": {
    "valid": true,
    "errors": [],
    "checks": [
      "slot lengths",
      "character limit",
      "links",
      "closer",
      "proof",
      "banned wording"
    ]
  }
}
```

**Processing:** enforce deterministic platform, proof, formatting, and anti-repetition rules.

**Model/provider:** none.

## Stage 9 — Repair retry

**Input**

```json
{
  "...output": "stage-8 output",
  "attempt": 1,
  "validationErrors": [
    "post exceeds 280 characters",
    "final line must end with a question"
  ]
}
```

**Output**

```json
{
  "...output": "stage-8 output",
  "posts": [
    { "index": 0, "text": "Repaired valid post", "characterCount": 238 }
  ],
  "attempts": 2,
  "needsReview": false,
  "reviewErrors": []
}
```

**Processing:** regenerate once with exact failures. If hard failures remain, retain them and mark
the output for review.

**Model/provider:** same configured generation model via OpenRouter.

## Stage 10 — Build optional image prompt

**Input**

```json
{
  "...output": "stage-9 output",
  "mediaMode": "generate",
  "baseMediaPrompt": "Editorial product illustration, high contrast",
  "topic": "activation checklists",
  "hook": "Your onboarding checklist is too complete."
}
```

**Output**

```json
{
  "...output": "stage-9 output",
  "imagePrompt": "Editorial product illustration, high contrast\n\nTopic: activation checklists\nCore idea: Your onboarding checklist is too complete."
}
```

**Processing:** produce the media prompt only when media mode is `generate`.

**Model/provider:** none.

## Stage 11 — Optional image generation

**Input**

```json
{
  "...output": "stage-10 output",
  "imagePrompt": "stage-10 image prompt",
  "aspectRatio": "16:9",
  "resolution": "1K"
}
```

**Output**

```json
{
  "...output": "stage-10 output",
  "image": {
    "taskId": "kie-task-01",
    "imageUrl": "/api/local-assets/x-automations/images/x-post-image.png",
    "aspectRatio": "16:9"
  },
  "imageUrls": ["/api/local-assets/x-automations/images/x-post-image.png"]
}
```

**Processing:** create and poll a KIE marketplace task, download the result, and attach at most
four images.

**Model/provider:** `nano-banana-pro` via KIE.ai.

## Stage 12 — Benchmark and persist final output

**Input**

```json
{
  "...output": "stage-11 output",
  "automationId": "x-auto-01",
  "plan": "stage-3 plan",
  "posts": "stage-9 validated posts",
  "imageUrls": "stage-11 images",
  "modelTrace": "stage-5 through stage-9 trace"
}
```

**Output**

```json
{
  "id": "xrun-01",
  "automationId": "x-auto-01",
  "platform": "x",
  "posts": [{ "text": "Repaired valid post" }],
  "hook": "Your onboarding checklist is too complete.",
  "imagePrompt": "Editorial product illustration, high contrast",
  "imageUrls": ["/api/local-assets/x-automations/images/x-post-image.png"],
  "sourceCandidate": null,
  "benchmark": { "score": 92, "passed": true },
  "attempts": 2,
  "needsReview": false,
  "reviewErrors": [],
  "status": "draft"
}
```

**Processing:** benchmark and store the generated content, source attribution, plan, model
attempts, validation state, and recent-use memory.

**Model/provider:** none. Publication consumes this draft downstream and is not part of the
generation pipeline.
