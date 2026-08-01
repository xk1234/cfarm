---
title: "LinkedIn generation pipeline"
description: "Transform a niche, persona, proof bank, and optional brief into validated LinkedIn posts."
---

# LinkedIn generation pipeline

**Availability:** `POST /api/linkedin-automations/generate` executes this pipeline without
persistence. The store, editor, scheduler, and publisher are not wired.

`"...output": "stage-N output"` means the complete JSON output from stage N is piped into the
next stage. The example values below are abbreviated, but every block is valid JSON.

## Stage 1 — Validate and normalize input

**Input**

```json
{
  "niche": "B2B SaaS onboarding",
  "brief": null,
  "persona": "practitioner",
  "archetypeId": null,
  "hookStyleId": null,
  "pillar": null,
  "topic": "Reducing time to first value",
  "excludedTopics": ["generic growth hacks"],
  "proof": ["Cut median activation time from 9 days to 3 days"],
  "count": 2,
  "briefModel": "google/gemini-3.1-flash-lite",
  "model": "openai/gpt-5.6-luna"
}
```

**Output**

```json
{
  "normalizedInput": {
    "niche": "B2B SaaS onboarding",
    "brief": null,
    "persona": "practitioner",
    "archetypeId": null,
    "hookStyleId": null,
    "pillar": null,
    "topic": "Reducing time to first value",
    "excludedTopics": ["generic growth hacks"],
    "proof": ["Cut median activation time from 9 days to 3 days"],
    "count": 2,
    "briefModel": "google/gemini-3.1-flash-lite",
    "model": "openai/gpt-5.6-luna"
  },
  "validationErrors": []
}
```

**Processing:** require a non-empty niche, normalize optional arrays and persona, and clamp
`count` to the supported range of 1–4.

**Model/provider:** none.

## Stage 2 — Resolve the niche brief

**Input**

```json
{
  "...output": "stage-1 output"
}
```

**Output**

```json
{
  "...output": "stage-1 output",
  "brief": {
    "audience": "Product and growth leaders at B2B SaaS companies",
    "promise": "Shorten the path from signup to demonstrated value",
    "pillars": [
      { "name": "Activation design", "weight": 0.45 },
      { "name": "Onboarding operations", "weight": 0.35 },
      { "name": "Measurement", "weight": 0.2 }
    ],
    "keywords": ["activation", "time to value", "onboarding"],
    "painPoints": ["Long setup paths", "Weak activation signals"]
  },
  "briefSource": "generated"
}
```

**Processing:** reuse a supplied valid brief. Otherwise, generate the audience, promise, three
weighted pillars, keywords, and pain points from the niche.

**Model/provider:** requested `briefModel`; default `google/gemini-3.1-flash-lite` via
OpenRouter. No model is called when a valid brief is supplied.

## Stage 3 — Select the post plan

**Input**

```json
{
  "...output": "stage-2 output",
  "batchState": {
    "postIndex": 0,
    "recentArchetypeIds": [],
    "recentHookStyleIds": []
  }
}
```

**Output**

```json
{
  "...output": "stage-2 output",
  "plan": {
    "archetypeId": "problem-playbook",
    "archetypeLabel": "Problem → playbook",
    "hookStyleId": "contrarian-observation",
    "pillar": "Activation design",
    "topic": "Reducing time to first value",
    "proof": ["Cut median activation time from 9 days to 3 days"]
  },
  "batchState": {
    "postIndex": 0,
    "recentArchetypeIds": ["problem-playbook"],
    "recentHookStyleIds": ["contrarian-observation"]
  }
}
```

**Processing:** choose or validate an archetype and hook style, require proof for formats that
need it, choose a pillar/topic, and avoid repeating recent selections within the batch.

**Model/provider:** none.

## Stage 4 — Build the prompt and response schema

**Input**

```json
{
  "...output": "stage-3 output"
}
```

**Output**

```json
{
  "...output": "stage-3 output",
  "generationRequest": {
    "model": "openai/gpt-5.6-luna",
    "messages": [
      { "role": "system", "content": "LinkedIn post generation rules and voice constraints" },
      { "role": "user", "content": "Niche brief, selected plan, proof, exclusions, and topic" }
    ],
    "responseSchema": {
      "type": "object",
      "required": ["hook", "body", "closing"]
    }
  }
}
```

**Processing:** combine the brief, practitioner/educator voice, archetype slots, hook formula,
proof, exclusions, and LinkedIn formatting rules into a structured-generation request.

**Model/provider:** none.

## Stage 5 — Generate and compose the post

**Input**

```json
{
  "...output": "stage-4 output"
}
```

**Output**

```json
{
  "...output": "stage-4 output",
  "draft": {
    "slots": {
      "hook": "Most onboarding problems are activation-design problems.",
      "body": "stage-5 generated body",
      "closing": "Measure the first moment a user proves value."
    },
    "post": "Most onboarding problems are activation-design problems.\n\nstage-5 generated body\n\nMeasure the first moment a user proves value."
  },
  "generation": {
    "model": "openai/gpt-5.6-luna",
    "provider": "OpenRouter",
    "attempt": 1
  }
}
```

**Processing:** fill the selected archetype's structured slots, validate the response shape, and
compose the slots into plain-text LinkedIn content.

**Model/provider:** requested `model`; default `openai/gpt-5.6-luna` via OpenRouter.

## Stage 6 — Run deterministic validation

**Input**

```json
{
  "...output": "stage-5 output"
}
```

**Output**

```json
{
  "...output": "stage-5 output",
  "validation": {
    "violations": [],
    "characterCount": 684,
    "needsRepair": false
  }
}
```

**Processing:** check required slot lengths, total character count, first-line length, whitespace
blocks, links, markdown, hashtags, emoji and em-dash limits, banned closers/AI wording, and
unsupported numeric claims.

**Model/provider:** none.

## Stage 7 — Repair violations when necessary

**Input**

```json
{
  "...output": "stage-6 output",
  "repairPolicy": {
    "maximumAttempts": 2
  }
}
```

**Output**

```json
{
  "...output": "stage-6 output",
  "generatedPost": {
    "post": "stage-7 validated or repaired post",
    "archetypeId": "problem-playbook",
    "archetypeLabel": "Problem → playbook",
    "hookStyleId": "contrarian-observation",
    "pillar": "Activation design",
    "violations": [],
    "needsReview": false,
    "attempts": 1,
    "characterCount": 684
  }
}
```

**Processing:** if violations exist, regenerate with the exact validation failures as repair
instructions. Keep the last violations and set `needsReview` when the final attempt still fails.
If validation already passed, preserve the post without another model call.

**Model/provider:** the same requested post model via OpenRouter on the repair branch; none when
no repair is needed.

## Stage 8 — Complete the batch and return the response

**Input**

```json
{
  "...output": "stage-7 output",
  "completedPosts": ["stage-7 generatedPost"],
  "requestedCount": 2
}
```

**Output**

```json
{
  "niche": "B2B SaaS onboarding",
  "model": "openai/gpt-5.6-luna",
  "brief": {
    "audience": "Product and growth leaders at B2B SaaS companies",
    "promise": "Shorten the path from signup to demonstrated value",
    "pillars": [
      { "name": "Activation design", "weight": 0.45 },
      { "name": "Onboarding operations", "weight": 0.35 },
      { "name": "Measurement", "weight": 0.2 }
    ],
    "keywords": ["activation", "time to value", "onboarding"],
    "painPoints": ["Long setup paths", "Weak activation signals"]
  },
  "posts": [
    {
      "post": "stage-7 validated or repaired post",
      "archetypeId": "problem-playbook",
      "archetypeLabel": "Problem → playbook",
      "hookStyleId": "contrarian-observation",
      "pillar": "Activation design",
      "violations": [],
      "needsReview": false,
      "attempts": 1,
      "characterCount": 684
    },
    {
      "post": "second generated post",
      "archetypeId": "mistake-lesson",
      "archetypeLabel": "Mistake → lesson",
      "hookStyleId": "specific-result",
      "pillar": "Onboarding operations",
      "violations": [],
      "needsReview": false,
      "attempts": 1,
      "characterCount": 731
    }
  ]
}
```

**Processing:** return to stage 3 until `count` posts exist, carrying recent archetype and hook
IDs so the batch varies. Then serialize the route response.

**Model/provider:** stages 3–7 repeat for each post; the final serialization itself uses no model.

The current endpoint does not accept a brand profile, so the optional humanization and model-review
helpers used by other social pipelines are not stages in this route. The final output is returned
to the caller and is not stored or published.
