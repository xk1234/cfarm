---
title: "Analysing a slideshow's tone"
description: "Point at a public TikTok slideshow, transcribe its slides, analyse how it sounds, and pre-fill an automation from the result."
---

# Analysing a slideshow's tone

Take a slideshow that works — any public TikTok `/photo/` post — read the words off its slides,
describe how it sounds, and turn that into a filled-in automation.

`Last tested: 2026-07-26, unit-tested against mocked providers — not yet run against a live TikTok URL`

> **Swipes are not wired up.** The URL path below is built. Selecting a swipe from LumenLab is not:
> swipes live in a different application behind its own MCP surface, and LumenClip has no client
> for it. Paste the TikTok URL for now.

## What already exists

**Slide text extraction is real and shipped.** `extractTikTokSlideTexts` in
`lib/tiktok-publication-import.ts` sends every slide image of an imported post to OpenRouter in one
call:

| Setting | Value |
| --- | --- |
| Model | `google/gemini-2.5-flash`, resolved through `openRouterModelForUseCase("imageCaptioning")` |
| Schema | Strict JSON, name `tiktok_slide_text`, `slides[]` of `{ index, text }`, exactly one entry per photo |
| Temperature | `0` |
| Timeout | 90,000 ms |
| Max tokens | `max(600, slideCount × 350)` |

Its system instruction is explicit about what to ignore: transcribe visible editorial text in
order, preserve words and sentence order, skip decorative symbols, watermarks, and background art,
and return an empty string only when an image genuinely has no text.

**Getting the images is also shipped.** `lumenclip_tiktok_import_start` takes `urls` and runs the
Apify actor `maximedupre/tiktok-slideshow-downloader` (overridable via
`APIFY_TIKTOK_SLIDESHOW_ACTOR`), capped at **20 URLs** and **20 photos per URL**. The dataset comes
back grouped by post id with caption, author username, photo count, and ordered photos. Publish
time is not scraped — it is decoded from the post id itself, which is a Snowflake whose top 32 bits
are a Unix timestamp.

**A comparison step already reads that text.** `lumenclip_tiktok_import_preview` scores each
imported post against one automation's generated slideshows using a weighted blend —
caption similarity 0.45, hook similarity 0.35, slide count 0.10, publish time 0.10 — and returns
verdicts such as `Caption closely matches` / `Caption differs`.

So the pipeline "URL → images → per-slide text" runs in production today. What it does with that
text is match publications. Nothing more.

## What was added

`extractTikTokSlideTexts` is now exported rather than duplicated — there is still exactly one
slide-image transcription implementation, and the publication-matching path is unchanged. Around
it:

| Piece | Name |
| --- | --- |
| Single-URL scrape | `fetchTikTokSlideshowPost(url)` — an Apify **sync** run, capped at 45 s |
| Transcript | `transcribeTikTokSlideshow(url)` |
| Analysis | `analyzeSlideshowTone(transcript)` |
| Field mapping | `slideshowToneToAutomationFields(analysis)` |
| Route | `POST /api/slideshows/analyze-tone`, `maxDuration = 60` |
| MCP tool | `lumenclip_slideshow_analyze` |
| Model use case | `toneAnalysis` in the generation model registry |
| UI | **Match slideshow**, beside **New automation** in the automations view |

The scrape and transcription both happen inline, which is why the actor run is capped well below
the route's own budget. A slideshow that needs longer belongs on the existing asynchronous
`startTikTokPublicationImport` path instead — this route is deliberately for the one-URL,
answer-now case.

## Workflow summary

### 1. User asks

> "Analyse this TikTok and build me an automation that sounds like it."

### 2. Agent calls `lumenclip_slideshow_analyze`

**In**

```json
{ "url": "https://www.tiktok.com/@horoiq/photo/7662360324313517330" }
```

**Out**

```json
{
  "transcript": {
    "postId": "7662360324313517330",
    "caption": "…",
    "hashtags": ["#astrology", "#cancerzodiac"],
    "slides": [{ "index": 1, "text": "The Silent Test" }]
  },
  "analysis": {
    "tone": { "value": "Bold & Provocative", "preset": "bold-provocative" },
    "structure": { "hookSlides": 1, "bodySlides": 3, "ctaSlides": 1 },
    "wordRange": { "min": 28, "max": 62 },
    "language": "en",
    "observations": ["Second-person address throughout", "Each slide is titled"]
  }
}
```

`analysis.tone.value` must land on one of the nine stored presets, or be marked `"Custom"`:

`Conversational & Relatable` · `Motivational & Empowering` · `Educational & Informative` ·
`Bold & Provocative` · `Calm & Reflective` · `Witty & Humorous` · `Witty & Relatable` ·
`Practical & Aspirational` · `Authoritative & Reassuring`

That constraint is the point. A free-text tone is what `applyAutomationTone` stores as
`preset: "custom"`, and a custom tone is invisible to every preset-driven surface in the app.

### 3. Intermediate steps

Transcription reuses the shipped function unchanged. Analysis is one further model call over the
transcript — text only, no images — which makes it cheap and independent of the vision step.

**Only the judgement calls go to the model.** `wordRange` and the slide counts are computed in code
from the transcript, because they are arithmetic; the model is asked for tone, language, and
observations, which are not. That keeps the deterministic parts deterministic and testable, and it
is why `computeWordRange` and `extractHashtags` are separately exported and unit-tested.

The slide-role split (hook / content / cta) is not guessed from scratch: `TempSlideSectionId` is
already the three-value union `"hook" | "content" | "cta"`, so the analysis emits the same shape
the editor consumes.

### 4. The derived fields become an automation

The analysis maps onto real schema fields, not new ones:

| Analysis output | Schema field |
| --- | --- |
| `tone` | `tone: { value, preset }` |
| Per-slide word counts | `wordLengthMin` / `wordLengthMax` on each text item |
| Slide roles and count | `formatting` sections |
| Detected language | `language` |
| Frame shape | `aspect_ratio` |
| Opening line | A seed entry in the hook pool |

### 5. Result

A draft automation whose tone, structure, and word ranges came from a slideshow that already
performs, ready to edit before its first run.

## UI workflow

| Step | Action | What happens |
| --- | --- | --- |
| 1 | Open the automations view | **Match slideshow** sits beside **New automation** |
| 2 | Paste a public TikTok `/photo/` URL | The dialog scrapes and transcribes it |
| 3 | Review the transcript and analysis | Per-slide text, detected tone, word range, observations |
| 4 | Create | The automation is created from `suggestedFields` and opened in the existing editor |

## Failures to check

1. **A `/video/` TikTok has no path here at all.** The Apify actor is a *slideshow* downloader and
   the transcription step reads still images. There is no audio transcription anywhere in the
   repository — no Whisper, no ASR client. The route rejects these with a 400 rather than returning
   an empty transcript.
2. **Without an OpenRouter key, transcription silently degrades.** `extractTikTokSlideTexts`
   returns `fallbackSlideTexts` when `getOpenRouterApiKey()` is empty — the caption body on slide 1
   and an empty string on every other slide. That is a plausible-looking result that is not a
   transcription, so the route reports it explicitly in a `warning` field. **Check for that field
   before trusting an analysis**; it is the difference between "this slideshow sounds bold" and
   "this caption sounds bold".
3. **The strict schema demands exactly one entry per photo.** `minItems` and `maxItems` both equal
   the photo count. A model that returns fewer entries fails the structured-output contract rather
   than returning partial text.
4. **Indices are one-based in the response and zero-based in the array.** The prompt asks for
   one-based indices and the reader maps `byIndex.get(index + 1)`. An off-by-one here shifts every
   slide's text by one position, which reads as a subtly wrong analysis rather than an error.
5. **Slides are capped at 20** per post, truncated at the dataset read rather than rejected.
6. **The sync scrape has 45 seconds.** A slow or unavailable actor run fails inside the route's own
   60-second budget and returns a 404. This is a deliberate trade: the one-URL case answers now or
   not at all, rather than hanging.
7. **A derived tone is a guess, and a preset is a commitment.** Mapping onto one of nine presets
   loses information the free-text `value` field could hold. Both are stored — the preset for the
   UI, the observations for the prompt.
8. **The LLM-slop guardrail applies downstream, not here.** `llmSlopPromptLine` shapes generation.
   It does not filter what a *swipe* sounds like, so an analysis can faithfully describe a tone the
   generator will then refuse to reproduce.
9. **Not yet exercised against a live URL.** Every test mocks Apify and OpenRouter. The actor
   request body matches the shape the existing import path already sends, but the sync endpoint
   itself is new here and has not been run for real.

## Still to do

- **Swipes.** Selecting from LumenLab needs a client for its MCP surface (`search_swipes`,
  `get_swipe`) that LumenClip does not have.
- **Video posts.** Blocked on there being no ASR path in the repo.
- **A live run.** Point it at a real TikTok URL with `OPENROUTER_API_KEY` and `APIFY_TOKEN` set
  before trusting the output.

Previous: [Creating a slideshow automation](/docs/workflows/create-slideshow-automation) ·
Next: [The testing facility](/docs/workflows/testing-facility)
