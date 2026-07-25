---
title: "Creating a UGC video automation"
description: "Configuring a talking-actor product video — why it is currently gated off, the ten stages and what each provider bills, how resume works, and the failures worth checking."
---

# Creating a UGC video automation

A product brief becomes a voiced, lip-synced talking-actor video with captions and b-roll.

> **Not currently available.** This pipeline is fully built but gated behind
> `ENABLE_UGC_AUTOMATION`, which must equal the literal string `"true"`. It is absent from the
> current environment, as is `ELEVENLABS_API_KEY`. You can configure and save a UGC automation
> today, set it live, and it will silently never run. See [Enabling it](#enabling-it) below.

`Last tested: 2026-07-25 — configuration and estimate paths only; generation is gated off`

## Workflow summary

### 1. User asks

> "Make me a UGC ad for this product."

### 2. Agent calls `lumenclip_ugc_estimate`

Costs money to run, so price it first. This tool is **not** gated by the feature flag.

**In**

```json
{
  "targetDurationSeconds": 30,
  "brollCount": 3,
  "actorSource": "generate",
  "lipSyncTier": "standard"
}
```

Every field is optional. With an `automationId` the saved config is merged, overrides winning.
`targetDurationSeconds` is 15–180, `brollCount` 0–6, `actorSource` is
`"generate" | "gallery" | "upload"`, `lipSyncTier` is `"standard" | "premium"`.

**Out** — `{ automationId, estimate, assumptions }`. The estimate is itemised in USD.

### 3. Agent calls `lumenclip_ugc_generate`

**In**

```json
{ "automationId": "…", "requestId": "ugc-test-001" }
```

Both required. `requestId` is a real queue dedupe key — reusing it returns the same operation
with the warning *Returned the existing operation for this requestId.*

**Out**

```json
{
  "runId": "ugcrun…",
  "expectedOutputId": "ugc-…",
  "estimate": { … },
  "operation": {
    "kind": "ugc.generate",
    "status": "running",
    "stage": "queued",
    "nextPollAfterMs": 5000,
    "resourceUri": "lumenclip://operations/…"
  },
  "nextActions": [{ "tool": "lumenclip_operation_get", "arguments": { "operationId": "…" } }]
}
```

Checks run in this order: automation exists → kind is `ugc` → status is `live` → configuration
is valid → **then** the feature flag.

### 4. Intermediate steps

Ten stages, in order, each checkpointed:

| # | Stage | Provider | What it produces |
| --- | --- | --- | --- |
| 1 | `analysis` | OpenRouter | Product facts from a URL or brief |
| 2 | `script` | OpenRouter | Four-phase plan: hook, problem, solution, CTA |
| 3 | `actor` | FAL image | Still portrait |
| 4 | `voice` | ElevenLabs | Audio plus word timings |
| 5 | `motion` | FAL video | Image → video |
| 6 | `lipsync` | FAL | Standard or premium avatar |
| 7 | `broll` | FAL image | 0–6 supporting stills |
| 8 | `composite` | Rendi | FFmpeg burn-in, 1080×1920, 30fps |
| 9 | `store` | Appwrite | Output row plus media rows |
| 10 | `publish` | PostFast | Skipped for agent-initiated runs |

A run's `status` field is literally the current stage name — `"voice"`, `"lipsync"`, and so on.

Compositing burns karaoke captions from an ASS subtitle file, overlays b-roll with a Ken Burns
`zoompan`, draws the hook with `drawtext`, and emits `output.mp4` and `thumbnail.jpg` from a
single command.

### 5. Result

An output row of kind `ugc_ad` with a rendered video and thumbnail. **Agent-initiated runs pass
`draftOnly: true`**, so stage 10 returns `{ skipped: true, reason: "draft_only" }` even on a
live automation with `posting_mode: "auto"`.

## What it costs

Per-clip figures for a ~30-second vertical video. The table is a budgeting estimate refreshed
2026-07-22 from provider pricing pages — providers bill per megapixel, per minute, per second,
and per character, so re-verify before enabling.

| Item | Cost |
| --- | --- |
| OpenRouter analysis | $0.01 |
| OpenRouter script | $0.01 |
| FAL image (actor, and each b-roll item) | $0.03 |
| FAL motion, per 6s clip | $0.19 |
| FAL lipsync — standard | $0.20 |
| FAL lipsync — premium | $1.69 |
| ElevenLabs | $0.0001 per character |
| Rendi composite | $0.03 |

Character count is synthesised as `durationSeconds × 15`. Actual spend is read back from the
`usage_ledger` rows the worker writes per stage, each tagged `source: "estimate" | "ledger" | "derived"`.
`"derived"` means the provider reported no dollar amount, so the table was applied
retroactively.

**The estimate is advisory only — there is no approval gate.** No confirmation parameter exists
on the generation path, unlike `lumenclip_output_publish`'s `confirmPublish`.

## UI workflow

| Step | Action | What happens |
| --- | --- | --- |
| 1 | Create from the **UGC Ad — AI actor** preset | *Generated actor, voice, lip sync, and b-roll*. Forced to `paused` |
| 2 | Open the format panel | H2 **AI actor format**, and the notice **Gated — needs FAL_KEY, ELEVENLABS_API_KEY, and ENABLE_UGC_AUTOMATION.** |
| 3 | **Product input** | A **Product URL** or a **Product brief** — either is enough |
| 4 | **Actor** | Source **Generate**, **Gallery**, or **Upload**, plus a prompt or asset URL |
| 5 | **Voice and lip sync** | **ElevenLabs voice ID**, **Voice model**, tier **Standard** or **Premium · Kling** |
| 6 | **Length and supporting footage** | **Target duration (seconds)**, **B-roll count** |
| 7 | **On-screen text** | **Captions**, **Caption style**, **Caption fallback** (**Draw text** / **PNG frames**), **Hook overlay**, **Hook style**, **Hook duration (milliseconds)** |
| 8 | **Estimated provider cost** | Reads *Calculating estimate…*, then the itemised table |
| 9 | Press **Save changes** | Disabled while validation errors remain |

Progress lives at `/app/ugc/{runId}` — eyebrow **UGC generation**, H1 **Honest progress & cost**,
ten stage chips, **Retry from cache**, and cost cards **{Premium\|Low-cost} estimate** and
**Actual so far**.

## Enabling it

`ENABLE_UGC_AUTOMATION=true` must be set in **both** processes — the Next.js/MCP environment
and the Appwrite job worker read separate environments. The worker additionally requires
`FAL_KEY`, `ELEVENLABS_API_KEY`, `OPENROUTER_API_KEY`, and `RENDI_API_KEY`, plus
`POSTFAST_API_KEY` when auto-publishing. Any missing key throws a non-retryable configuration
error and sends a Telegram alert.

## Failures to check

1. **The settings panel is not gated — only the estimate route and the runners are.** You can
   configure, save, and set a UGC automation live with the flag off, and nothing warns you
   beyond the notice text.
2. **`lumenclip_ugc_estimate` bypasses the flag; `/api/ugc-runs/estimate` does not.** The same
   calculation is available to an agent and returns `404 UGC automation is not enabled.` to the
   UI, which surfaces that string where the cost table would be.
3. **The scheduler silently skips UGC automations** every cycle when the flag is off — no log,
   no error.
4. **Tier vocabulary is inconsistent in three places.** The config uses
   `"standard" | "premium"`; the cost type uses `"lowcost" | "premium"`; the settings panel
   renders **Standard total** while the run page renders the same value as
   **Low-cost estimate**.
5. **Duration defaults and limits disagree by path.** Config normalisation defaults to 30s;
   the estimator defaults to 60s when the value is falsy. The panel input allows 10–90 while
   every server clamp is 15–180 — typing 10 silently becomes 15 on save.
6. **"Retry from cache" resets nothing.** It re-enqueues the same deterministic job; stages
   whose checkpoint files still exist in the `ugc_videos` bucket are skipped. If a file was
   deleted, that stage re-runs **and re-bills**.
7. **Checkpoint durability is verified against storage, not just presence.** A checkpoint
   claiming files that no longer exist is treated as incomplete.
8. **`store` and `publish` are pipeline stages, not post-processing.** A failure at
   `composite` leaves no output row at all.
9. **Product URL fetching is behind a full SSRF guard** — DNS resolution, private and
   IPv4-mapped address rejection, HTML-only, 1 MB cap, at most 4 redirects.
10. **Script validation rejects an overlong plan**:
    `UGC script duration is outside configured limits` when the total exceeds
    `max(15, target) × 1.25`. A missing phase throws
    `UGC script is missing {hook|problem|solution|cta} phase`.
11. **A lost job is reported honestly**: `Generation job was lost. Completed stages remain
    cached.`
12. **Non-UGC video automations have no runner at all** —
    `Saved video automations do not yet have a server-side generation runner.`

## Additional workflow notes

Going live requires passing `ugcLiveConfigurationErrors`: *AI UGC must be explicitly enabled
before going live*, *AI UGC requires a product URL or brief*, *AI UGC requires an ElevenLabs
voice id*. Failing shows the toast **UGC automation is not ready to go live**.

Run and output ids are deterministic from `automationId` and `scheduledFor`, which is what
makes resume land on the same checkpoints.

Storage is the `ugc_videos` bucket under `ugc_avatar_videos/{ownerId}/{runId}/`; any path
outside that prefix is refused. Outputs are `outputs` rows with
`source_key: "generated_video"` and `kind: "ugc_ad"`, plus two `output_media` rows for the
video and thumbnail.

Only `429`, `408`, `409`, `425`, and `5xx` responses are retried; everything else is
dead-lettered immediately.

Previous: [Reading analytics](/docs/workflows/analytics-report)
