# cfarm — Next-Level Roadmap (Codex briefs)

Work in the current repo. After each numbered item run `npx tsc --noEmit`. Do NOT run vitest (native bindings broken in this VM). Do not commit; leave changes in the working tree. Add/update co-located `*.test.ts` files where they exist for the module, keep them consistent even though they can't run here.

Each epic below is self-contained and sized to hand to Codex as one brief. Suggested order: **A2 → A8 → A1 → A3 → A6 → A4 → B1 → B3 → A5 → B2 → B4 → A7 → B5**. A2 and A8 first because everything downstream (more volume, more automation) is dangerous without dedup and correct scheduling.

Key files referenced throughout:
- Run engine: `lib/automation-runner.ts` (`createAutomationRunPlan`, `runDueAutomations`, `imagesForCollectionIds`, `chooseImages`)
- Automation schema: `lib/realfarm-automation.ts` (`AutomationSchema`, `automationHooks`, `schemaWithAutomationHooks`)
- Text gen: `lib/slideshow-text-generation.ts` + prompt builders in `lib/temp-slide-testing.ts`
- Hook expansion route: `app/api/automations/hooks/route.ts`
- Images: `lib/image-collections.ts`, `lib/slideshows.ts`
- Publishing: `lib/postfast-client.ts`, `lib/postfast-posts.ts`, `app/api/postfast/posts/route.ts`
- Characters/UGC: `lib/characters.ts`, `lib/character-workflows.ts`, `lib/character-image-generations.ts`
- Swipes: `lib/swipes.ts`, `components/realfarm/swipes-view.tsx`, `extension/`
- Storage: `lib/json-store.ts` (all new stores must use `readJsonArrayStore`/`withJsonArrayStore`)
- Model registry: `lib/realfarm-generation-model-registry.ts` (all new LLM calls must register a use case here, no inline model strings)

---

# PART A — ReelFarm side

## Epic A1 — Combinatoric & dynamic hooks (word collections)

Goal: hooks stop being a flat curated list. Introduce **word collections** (e.g. `soccer players`, `astrology signs`, `cities`) and **hook templates** with slots (`"POV: {soccer_player} uses this app"`), expanded combinatorially at run time.

- [ ] 1. New store `data/word-collections.json` + `lib/word-collections.ts`: `WordCollectionRecord { id, name, description?, words: string[], source: "manual" | "ai" | "research", created_at, updated_at }`. CRUD via `withJsonArrayStore`. Routes: `app/api/word-collections/route.ts` (GET/POST) and `app/api/word-collections/[id]/route.ts` (PATCH/DELETE). Mirror the route/auth patterns of `app/api/image-collections/`.
- [ ] 2. AI-fill endpoint `app/api/word-collections/[id]/generate/route.ts`: given name + description, call OpenRouter (register use case `wordCollectionFill` in `realfarm-generation-model-registry.ts`) with a strict JSON schema returning N words; dedupe case-insensitively against existing words before persisting (reuse the `normalizeHookKey` approach from `app/api/automations/hooks/route.ts`).
- [ ] 3. Hook templates: in `lib/realfarm-automation.ts`, extend the hook model so a stored hook line may contain `{slot_name}` placeholders, and add `schema.hook_slots?: Record<string, string /* word collection id */>` mapping slot names to word collections. Keep plain hooks working unchanged.
- [ ] 4. Expansion at run time: new module `lib/hook-expansion.ts` with `expandHook(hook, slots, collections, random)` — picks a random word per slot, returns `{ text, template, substitutions }`. Call it in `createAutomationRunPlan` (`lib/automation-runner.ts`) after hook selection, before `generateAutomationText`. Persist `template` and `substitutions` on the run plan so A2 can dedupe on the *combination*, not just the final string. Unit tests in `lib/hook-expansion.test.ts` (pure function, seedable random).
- [ ] 5. UI: word-collections manager view under `components/realfarm/` (list, edit words as a textarea, AI-fill button) + slot picker in the automation-settings hook section. Follow existing view/nav patterns in `components/realfarm/`.

## Epic A2 — Duplicate detection & avoidance

Goal: never post the same image or the same hook (or near-identical text) twice for the same automation/account. Today `chooseImages` samples **with replacement** and nothing tracks historical usage.

- [ ] 1. Usage ledger `lib/usage-ledger.ts` + `data/usage-ledger.json`: `UsageRecord { id, automation_id, account_key?, kind: "image" | "hook" | "hook_combination" | "text", key: string, run_id, used_at }`. Append via `withJsonArrayStore`; helper `recentUsageKeys(kind, automationId, { withinDays?, limit? })`. Cap file growth (prune records older than N days on write).
- [ ] 2. Image identity: add a content hash to collection images. In `lib/image-collections.ts`, compute sha256 of file bytes on import (`importRemoteImagesToCollection` and local upload path) and store as `image.hash`. One-off backfill script `scripts/backfill-image-hashes.ts` for existing files in `data/image-collections/files/`. Optionally also store a perceptual hash (aHash/dHash implemented in TS over a sharp-downscaled 8x8 grayscale — no new native deps) as `image.phash` for near-dup detection across differently-encoded copies.
- [ ] 3. Wire into image picking: replace `chooseImages` sampling in `lib/automation-runner.ts` with "sample WITHOUT replacement, excluding hashes used in the last N runs for this automation" (N configurable via `schema` with a default, e.g. exclude anything used in last 20 runs or 14 days). Only fall back to reuse when the pool is exhausted — and when falling back, prefer least-recently-used. Record chosen hashes to the ledger when the run completes.
- [ ] 4. Hook dedupe: in `createAutomationRunPlan`, exclude hooks (by `normalizeHookKey`) and hook-combinations (template + substitutions key from A1) used in the last N runs. Also apply on AI hook expansion (`app/api/automations/hooks/route.ts`) — it already dedupes against stored hooks; additionally dedupe against ledger history.
- [ ] 5. Near-duplicate generated text: after `generateSlideshowText` returns, compare title+body against the last M runs' text via normalized trigram/Jaccard similarity (pure TS helper in `lib/text-similarity.ts`, threshold ~0.85); on collision, retry generation once with a "avoid these prior outputs" instruction appended to the prompt (extend `buildTempSlideUserPrompt` in `lib/temp-slide-testing.ts`). Tests for the similarity helper.
- [ ] 6. Surface in UI: on the run detail view, show "reuse warnings" if a fallback happened; on collections view, show per-image last-used date.

## Epic A3 — Context-dependent image selection

Goal: instead of random images, AI picks the image from the linked collection that best matches the slide text (or the hook's substituted word, e.g. the actual soccer player).

- [ ] 1. Ensure captions exist: `app/api/image-collections/captions` already captions images (`imageCaptioning` use case). Add an "auto-caption on import" option in `lib/image-collections.ts` so every image has a caption; backfill route/button for existing collections.
- [ ] 2. New module `lib/image-matching.ts`: `rankImagesForText(text, images, { topK })`. Implementation: single OpenRouter call (register use case `imageMatching`) sending the slide/hook text plus a numbered list of image captions, strict JSON schema returning ranked indices with scores. No embeddings infra needed at current collection sizes (≤80 images); design the interface so an embedding backend can replace it later.
- [ ] 3. Wire into the runner: in `createAutomationRunPlan`, add per-section selection mode `schema.image_selection?: "random" | "context"` (default `random` for backward compat). For `context`: generate text FIRST, then call `rankImagesForText` per slide, then apply A2's dedup exclusion to the ranked list (best non-recently-used match wins). Note this inverts today's order (images are currently chosen before text) — restructure `createAutomationRunPlan` accordingly and keep the random path on the old order.
- [ ] 4. Tag-based fast path: if a hook slot substitution (A1) matches an image caption/tag (e.g. word collection "soccer players" + image captioned "Ronaldo"), prefer that match without an LLM call. Add optional `tags: string[]` to collection images and simple normalized matching in `lib/image-matching.ts`.
- [ ] 5. Persist match rationale (`{ slide_index, image_hash, score, reason }`) on the run plan for debuggability; show it in the run detail UI.

## Epic A4 — Knowledge bases + research-fed hooks & text

Goal: each automation draws generation context from a durable **knowledge collection** (linkable resource, like image collections). Manual entries hold stable business facts (products, prices, packages, zodiac lore); a research layer refreshes time-sensitive facts into the KB on a schedule. Runs NEVER scrape inline — they read the KB. `.env` already has `FIRECRAWL_API_KEY` and `APIFY_KEY` (currently unwired).

- [ ] 1. Knowledge collections: `lib/knowledge-collections.ts` + `data/knowledge-collections.json`: `KnowledgeCollection { id, name, entries: KnowledgeEntry[] }`, `KnowledgeEntry { id, fact, source: "manual" | "research", source_url?, query?, fetched_at, expires_at? /* undefined = evergreen */, status: "fresh" | "stale" }`. CRUD routes mirroring `app/api/image-collections/`. Manual entries editable in UI.
- [ ] 2. Research client `lib/research.ts`: `runResearch(query, { sources, maxItems })` → items `{ title, snippet, url, fetched_at }`. Backends behind one interface: (a) Firecrawl via `FIRECRAWL_API_KEY`, (b) plain fetch of user-provided RSS/URLs. Distill items into KB entries via OpenRouter (use case `researchDistill`, strict JSON: array of atomic facts with source_url) and upsert into the target knowledge collection with `expires_at` = now + configured TTL. Dedupe near-identical facts against existing entries (reuse `lib/text-similarity.ts` from A2.5).
- [ ] 3. Refresh loop: knowledge collection config `refresh?: { queries: string[], every_hours, ttl_hours }`. Refresh runs inside the existing 5-min cron (guard by `last_refreshed_at`, no new cron): expire stale entries, run queries, upsert facts. Hard timeout per query (~30s, shared fetch helper from brief-3); a failed refresh leaves the KB as-is and records the error on the collection — it must never block or fail an automation run.
- [ ] 4. Automation config: `schema.knowledge_collection_ids?: string[]` + `schema.research_mode?: "hooks" | "text" | "both"` in `lib/realfarm-automation.ts` + editor section in automation-settings UI (link collections, view freshness).
- [ ] 5. Prompt integration: build a KB context block (fresh entries first, evergreen included, hard token budget with priority = freshest research then manual) in `lib/knowledge-collections.ts`; include it in hook generation (`app/api/automations/hooks/route.ts` — tag generated hooks `source: "research"` + entry ids so stale-sourced hooks can be expired) and text generation (`buildTempSlideUserPrompt` in `lib/temp-slide-testing.ts`, threaded through `generateAutomationText`). Persist which entry ids were injected on the run plan for auditability.
- [ ] 6. Run-time behavior: runner reads the KB only. If every research entry is expired and `research_mode` is set, proceed with evergreen/manual entries and flag the run `knowledge: "stale"` (visible on run detail) — never scrape inline, never fail the run for staleness.

## Epic A5 — Video automation templates

Goal: automations can output simple videos, not just slideshows: **reaction / greenscreen + product demo + hook text overlay** as composable templates. Building blocks exist: `lib/generated-video-types.ts` (`greenscreen`, `ugc_ad`), `lib/rendi-ffmpeg.ts` (cloud ffmpeg), `lib/kie-video.ts` (image-to-video), demo/music assets in `lib/assets.ts`.

- [ ] 1. Server-side rendering path: today greenscreen/ugc_ad rendering is client-canvas (`components/realfarm/generated-video-renderer.ts`) — an automation cron can't use it. Build `lib/video-template-renderer.ts` that composes segments via Rendi ffmpeg: input spec `VideoTemplateSpec { segments: [{ type: "reaction_clip" | "demo_clip" | "still_image", source, duration?, overlay_text?, overlay_style }], music?, aspect: "9:16" }` → mp4 in `data/generated-videos/`. Overlay text rendered via the existing SVG→PNG pipeline (`lib/slideshow-renderer.ts` + sharp) then overlaid with ffmpeg — reuse, don't duplicate, the text-styling logic.
- [ ] 2. Template presets `lib/video-templates.ts` + `data/video-templates.json`: ship 3 presets — (a) `hook_demo`: hook text over UGC/reaction clip → product demo clip → CTA; (b) `greenscreen_meme`: meme background (from `data/greenscreen_memes/`) + hook overlay; (c) `slideshow_video`: existing slideshow frames → mp4 (replace the macOS-only `materializeSlideshowVideo` ffmpeg shell-out in `lib/slideshows.ts` with the Rendi path so it works on Vercel; delete or quarantine the unused embedded Swift renderer).
- [ ] 3. Automation integration: `schema.output_format?: "slideshow" | "video" | "both"` + `schema.video_template_id`. In `createAutomationRunPlan`, when video is selected: pick hook (A1/A2 apply), pick a random reaction/demo clip from linked asset groups (`lib/assets.ts` — extend with asset groups if needed), render via `lib/video-template-renderer.ts`, attach to the run/result record (`lib/results.ts`) and to publishing payloads (PostFast `mediaItems` already supports video).
- [ ] 4. Status/queue: video renders are slow — persist a `GeneratedVideoExport`-style status record (`lib/generated-videos.ts`) per render, poll Rendi with the shared poll helper (brief-3), and make the run record reference it so the run can complete `rendering` → `ready` asynchronously. The publish step (A8) must wait for `ready`.
- [ ] 5. UI: template picker in automation settings; preview player on run detail.

## Epic A6 — UGC grouping (creator collections)

Goal: group UGC assets (images/videos) under one creator, and bind a posting account to a creator so everything that account posts looks like the same person.

- [ ] 1. Data model: `lib/creator-collections.ts` + `data/creator-collections.json`: `CreatorCollection { id, character_id?, name, image_ids: [], video_ids: [], voice_id?, created_at }`. `character_id` links to `CharacterRecord` (`lib/characters.ts`); collections may also wrap imported real-UGC assets with no generated character. Auto-create/sync a collection from a character's generated images (`data/characters/images`, `lib/character-image-generations.ts`).
- [ ] 2. Account binding: `data/account-bindings.json` + `lib/account-bindings.ts`: map PostFast integration id (from `app/api/postfast/integrations`) → `creator_collection_id` (+ optional persona defaults: caption voice, hashtag style). One creator can serve many accounts; one account has at most one creator.
- [ ] 3. Runner integration: in `createAutomationRunPlan`, when the target integration has a binding, source avatar/UGC imagery ONLY from that creator collection (intersected with A2 dedup). For `ugc_ad`/`hook_demo` video templates (A5), the reaction clip must come from the bound creator's videos.
- [ ] 4. Consistency guard: prevent cross-creator leakage — validation that every image/video attached to a post for a bound account belongs to that creator collection; warn in UI and block publish (configurable) otherwise.
- [ ] 5. UI: creators view showing collection contents grouped by creator, binding editor on the integrations/accounts view.

## Epic A7 — UGC personality (living personas)

Goal: a character is a person, not a face: personality, voice, a simulated "current status" (Sims-style), and a chat interface. Depends on A6.

- [ ] 1. Extend `Character` (`lib/characters.ts`) with `persona: { personality_traits: string[], bio, speaking_style, interests: string[], daily_routine: { time_range, activity }[], voice: { provider, voice_id, sample_url? } }`. Migrate existing records with sensible defaults (the type already has `voice` and `emotional_baseline` — fold them in, don't duplicate).
- [ ] 2. Persona generator: route `app/api/characters/[id]/persona/route.ts` — one OpenRouter call (use case `characterPersona`) generating a coherent persona from the character's appearance + a user-supplied archetype prompt. Editable in the character UI.
- [ ] 3. Live status: `lib/character-status.ts` — deterministic function of (persona.daily_routine, character timezone, current time, seeded daily randomness) returning `{ activity, mood, flavor_text }`. No cron needed: compute on read. Route `app/api/characters/[id]/status`. Show as a status chip on the characters view.
- [ ] 4. Chat: `app/api/characters/[id]/chat/route.ts` — streaming OpenRouter chat (use case `characterChat`) with system prompt built from persona + current status; persist history per character in `data/characters/chats/`. Simple chat panel in `components/realfarm/characters/`. Guardrail: refuse to break character but never claim to be human when directly asked.
- [ ] 5. Persona-conditioned content: thread the persona's `speaking_style` into caption/text generation (`buildTempSlideUserPrompt`) whenever the posting account is bound (A6) to this creator — captions posted from a bound account should sound like that person.
- [ ] 6. Voice (scoped, optional last step): store a TTS voice id per persona and add `lib/tts.ts` behind an interface (pick one provider; KIE if it exposes TTS, otherwise leave the provider impl stubbed with a clear TODO and wire the interface into A5's video renderer for voiceover segments).

## Epic A8 — Timing & scheduling overhaul

Goal: close the biggest gap — the cron generates content but **never publishes** (`socialStatusesForRun` marks integrations `queued`/`disabled` forever; `schema.tiktok_post_settings.auto_post` is read into the plan as `autoPost` but nothing ever publishes). Then make timing smart.

- [ ] 1. Wire auto-publish: in `lib/automation-runner.ts`, after a run's assets are materialized, when `auto_post` is enabled, call PostFast (`createPostFastPostPayload` in `lib/postfast-client.ts`, upload via the same path as `app/api/postfast/upload`) for each configured integration; update `socialStatuses` on the run (`queued → publishing → published | failed` with error message) and create the `PostFastPostRecord` (`lib/postfast-posts.ts`) exactly like the manual `POST /api/postfast/posts` path does — extract the shared logic from that route into `lib/publishing.ts` and have both call it.
- [ ] 2. Retry & failure handling: transient publish failures retry with backoff on subsequent cron ticks (max N attempts, then `failed`); the 5-min cron picks up `queued`/`retrying` publish jobs from a new `data/publish-queue.json` (`lib/publish-queue.ts`, claimed via `withJsonArrayStore` like `claimAutomationRunSlot`). Video runs (A5) publish only when the render is `ready`.
- [ ] 3. Jitter & humanization: `schema.schedule.jitter_minutes?` — offset each slot by a random ±N minutes (computed at claim time, stored on the run so it's stable). Also `min_gap_minutes` per ACCOUNT across all automations (query recent runs/queue before claiming; skip to next tick if violated).
- [ ] 4. Scheduling upgrades in `lib/realfarm-automation.ts` + `dueAutomationSlots`: raise/remove the 5-slot cap; add interval mode (`every_n_hours` within a time window) alongside explicit times; add `schema.schedule.paused` and per-slot enable flags. Keep Luxon; extend the existing tests for `dueAutomationSlots`.
- [ ] 5. Content calendar UI: new view rendering the next 7 days of computed slots across all automations (pure function over schemas + queue state — reuse `dueAutomationSlots` logic in preview mode), plus past runs with status. Drag-to-adjust optional; a read-only calendar is enough for v1.
- [ ] 6. Analytics-informed timing (last): nightly job (guard inside the existing 5-min cron by time-of-day, no new cron) pulls per-post analytics via `app/api/postfast/analytics` into `data/post-analytics.json`; compute engagement-by-hour-of-week per account; show "suggested times" in the schedule editor. Suggestion only, no auto-change.

---

# PART B — Swipe side (GetHookd-inspired)

Context: GetHookd = ads library (23M+ ads, FB/TikTok/Google) + swipe file with boards + Brand Spy (competitor's ads/landing pages/traffic) + transcription + AI video scripts ("upload winning ad + product info → hooks/angles/scripts") + Clone Ads (image ad variations) + static ad/funnel templates + creative analyzer + API/MCP. We can't replicate the 23M-ad crawled library, so the moat is: (1) better organization/analysis of what the user swipes, and (2) a pipeline GetHookd doesn't have — **swipe → your own automation**.

## Epic B1 — Swipe organization: boards, tags, search

- [ ] 1. Extend `SwipeRecord` (`lib/swipes.ts`): `tags: string[]`, `boards: string[]` (replace single `folder` — migrate existing `folder` into `boards[0]`, keep reading old field), `notes?: string`, `rating?: 1-5`, `saved_from_url`. Migration on read like other stores.
- [ ] 2. Full-text search: search across advertiser, `full_script_transcription`, aesthetic-analysis fields, tags, notes. In-memory index built from the store is fine at current scale; implement in `lib/swipe-search.ts` with tests (tokenize, AND-match, rank by field weight).
- [ ] 3. AI auto-tagging: extend `completeSwipeProcessing` to also emit `suggested_tags` (niche, format, hook-type: question/POV/listicle/negativity, emotion) from the existing `swipeAnalysis` call — extend its JSON schema rather than adding a second call. User confirms/edits in UI.
- [ ] 4. UI (`components/realfarm/swipes-view.tsx` + `swipe-detail-page.tsx`): board sidebar, tag chips + filter, search box, bulk move/tag. Keep ag-grid where it helps.

## Epic B2 — Brand Spy (advertiser intelligence)

- [ ] 1. Advertiser aggregation `lib/advertisers.ts`: derive advertiser profiles from existing swipes (group by normalized advertiser name + platform): ad count, formats mix, first/last seen, landing pages seen (from existing landing-page screenshot fields), common hooks (from transcriptions). Computed view, no new store initially.
- [ ] 2. Longevity tracking: extension already captures ads; add `first_seen_at`/`last_seen_at` and a `times_seen` counter — when a swipe for an already-saved ad arrives (match by platform + ad id/URL), bump `last_seen_at` instead of duplicating (dedupe in `POST /api/swipes`). Long-running ad = likely winner; surface "running for X days" on cards.
- [ ] 3. Watch list: `data/watched-advertisers.json` — user marks advertisers to watch; extension badge/highlight when browsing a watched advertiser's ads (extension reads watch list via a new GET route; per `todo/hardcoded-extension-platform-selectors.md`, do adapter refactor first if touching `extension/content.js` heavily).
- [ ] 4. Advertiser page UI: per-advertiser view with their swiped ads timeline, hook patterns, landing pages. Route + view under `components/realfarm/`.

## Epic B3 — AI scripts & hooks FROM swipes (+ the swipe→automation pipeline)

This is the highest-leverage swipe feature: GetHookd generates scripts you copy out; we can inject them straight into automations.

- [ ] 1. `app/api/swipes/[id]/generate/route.ts`: given a swipe (transcription + aesthetic analysis already on the record) + user product info (`data/brand-profile.json` — small new store: product name, description, audience, tone), generate `{ hooks: string[], angles: string[], script: { hook, body, cta } }` via OpenRouter (use case `swipeScriptGeneration`, strict JSON). Store generations on the swipe record (`generations: []`).
- [ ] 2. Batch mode: select N swipes (a board) → one combined "angle report": common hooks/patterns across the board + generated variants. Route `app/api/swipes/generate-batch`.
- [ ] 3. **Send-to-automation**: button on swipe detail / generation results → appends selected hooks into a chosen automation's hook list via `schemaWithAutomationHooks` (`lib/realfarm-automation.ts`), with provenance `{ source: "swipe", swipe_id }` so A2's ledger can trace lineage. Also "create word collection from these" (A1 integration).
- [ ] 4. Hook pattern extraction: from all transcribed swipes, nightly-ish (reuse A8.6's in-cron nightly guard) extract recurring hook TEMPLATES ("POV: you just...", "5 things I wish...") into suggested hook templates for A1. One OpenRouter call over the corpus of first-lines.
- [ ] 5. UI: generation panel on `swipe-detail-page.tsx`, product-profile settings page.

## Epic B4 — Clone ads (creative variations from a swipe)

- [ ] 1. For image swipes: `app/api/swipes/[id]/clone/route.ts` — take the swiped image asset, generate K variations via the existing KIE image stack (`lib/kie-image.ts`, Flux Kontext edit / Nano Banana recreation patterns from `lib/character-workflows.ts`): recolor, swap avatar (optionally to a bound creator from A6 — "this winning ad, but starring MY UGC persona"), restyle. Persist as generated assets linked to the swipe.
- [ ] 2. For video swipes: v1 = "recreate the script" (B3) + render through a video template (A5) with own assets; do NOT attempt video-to-video cloning.
- [ ] 3. Compliance guard: cloned outputs must be transformations (own product, own creator, new copy) — add a fixed instruction to generation prompts to avoid reproducing logos/trademarks of the source ad, and a UI notice that swiped creative is for inspiration/recreation, not republication.
- [ ] 4. UI: clone panel with variation grid, "send to image collection" (feeds A3) and "attach to automation".

## Epic B5 — Creative analyzer & winners dashboard

- [ ] 1. Winner score: `lib/swipe-scoring.ts` — score each swipe from available signals: engagement fields, performance ranks (ctr/cvr already on `SwipeRecord`), longevity (B2.2), recency. Weighted, documented, unit-tested. Show score + breakdown on cards; sort/filter by it.
- [ ] 2. Own-performance loop: join published posts' analytics (A8.6 data) back to their source hooks/images/creators via the A2 ledger + provenance (B3.3) → "your winning hooks/images/creators" dashboard. This closes the loop swipe → generate → post → measure → generate more of what works.
- [ ] 3. Dashboard view: recharts-based; top hooks by engagement, image reuse heat, creator performance (A6), best posting hours (A8.6). One new nav tab.

---

# Cross-cutting notes for every brief

- All new persistence goes through `lib/json-store.ts` helpers; no ad-hoc `fs.writeFile`. If brief-2 (json-store hardening) hasn't landed yet, land it first.
- All new LLM calls: register a use case in `lib/realfarm-generation-model-registry.ts`; strict JSON schemas for structured output; use the shared fetch/poll helpers from brief-3.
- All new external fetches need timeouts and must respect the SSRF guard (`lib/url-guard.ts`, brief-1) where URLs are user-supplied.
- New routes follow the `proxy.ts` auth model; extension-facing routes keep the CORS pattern of `app/api/swipes/route.ts`.
- Don't grow `data/realfarm.json` seed coupling (see `todo/hardcoded-seed-data-and-static-assets.md`); new features get their own store files.
- Next.js 16 App Router quirks: check `AGENTS.md` before writing route handlers.
