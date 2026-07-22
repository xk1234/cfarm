# AI UGC automation implementation plan

## Scope and architectural decision

Add a third unattended automation execution path for talking-AI-actor UGC. It will use the existing `automations` schedule/config table, `jobs` queue, `automation_runs` lifecycle table, consolidated `outputs`/`output_media` registry, Appwrite Storage, PostFast publishing, reminders, and Rendi remote FFmpeg. The scheduler will enqueue a distinct `run-ugc-automation` job so slideshow behavior remains unchanged and worker dispatch is explicit.

The canonical orchestration will live in portable `lib/` modules and be transpiled into the Appwrite worker bundle. The deployed function must not import the Next app at runtime. Worker-only TablesDB/Storage adapters remain in `appwrite/functions/job-worker/src/ugc-automation.js`, matching the current self-contained slideshow worker pattern.

No local FFmpeg process is part of this design. All composition commands and inputs go to Rendi.

## Existing code map (implementation template)

### Scheduler to worker

- `appwrite/functions/automation-scheduler/src/main.js`: `listLiveAutomations(db, table = "automations")` queries `status == "live"`, parses each row's `data`, and restores `ownerId` from `owner_id`. `automationScheduler({ log, error })` calls `dueAutomationSlots(a.schema, now, LOOKBACK, slideshowGenerationLeadMinutes(a.schema))`, then `enqueue(db, { type: "run-automation", payload: { automationId, scheduledFor }, dedupeKey, ownerId })`. `rowId(basis)` is `j` plus 35 SHA-256 hex characters; slideshow dedupe is exactly `auto:${a.id}:${slot}`.
- `lib/automation-slots.ts` is canonical; generated `appwrite/functions/automation-scheduler/src/automation-slots.js` exposes `dueAutomationSlots(scheduleOrSchema, now, lookbackMinutes, generationLeadMinutes = 0, random)` and `slideshowGenerationLeadMinutes(input)`. Lead time expands the scheduler's future window, allowing generation before the PostFast target.
- `appwrite/functions/job-worker/src/main.js`: `findCandidates(t)` claims queued or lease-expired jobs; `claim(t, job)` increments attempts and applies `LEASE_MS`; `failOrRetry(t, job, err)` uses exponential `1000 * 2^attempts` backoff capped at one hour, marks exhausted jobs `dead`, and calls `sendTelegram`. Handler `"run-automation"` calls `runSlideshowAutomation({ payload, tables: t, storage: storage(), job, databaseId: DB })`.
- `appwrite/functions/job-worker/src/slideshow-automation.js`: `slideshowRunId(automationId, scheduledFor)` deterministically returns `arun` + 32 hash characters. `runSlideshowAutomation({ payload, tables, storage, job, databaseId })` validates identity/slot, dedupes terminal runs, stores run state, creates the plan, renders/stores, writes a result output, uploads PostFast media, follows auto/review/manual posting, queues reminders, and records usage. `renderSlideshowVideo({ renderedBuffers, durationSeconds, soundUrl, outputPath })` is the worker-side Rendi encoder.

### Web-side slideshow runner

- `lib/automation-runner.ts`: `runDueAutomations(input = {})` rejects non-live records unless explicitly forced, computes slots, atomically claims each run, then calls `createAutomationRun(...)`. That function calls `createAutomationRunPlan(...)` (hook/text generation and image selection), `createSlideshowResultRecord(...)` (render/Rendi/store), queues `generated`, publishes or records review/manual state through `lib/publishing.ts`, queues posting reminders, and records usage. This is the lifecycle and persistence template for the new `runUgcAutomation(...)`; it is not directly callable by the Appwrite function.
- The existing runner distinguishes generation from publishing: assets/results are persisted before PostFast work, so a publication failure does not lose the generated artifact.

### Existing UGC/video registry scaffolding

- `lib/video-automation-templates.ts`: `ugcAdPreset` already registers template id `ugc_ad`, but its `buildFormat()` contains no segments; `videoAutomationTemplatePreset(id)` falls back to it. This is UI/template scaffolding, not an AI actor pipeline.
- `lib/generated-video-types.ts` already defines `GeneratedVideoType = "greenscreen" | "ugc_ad" | "template_video"` and the `GeneratedVideoExport` shape.
- `lib/generated-videos.ts`: `createGeneratedVideoExport(...)`, `updateGeneratedVideoExport(...)`, and `listGeneratedVideoExports(...)` persist `data/generated-videos/exports.json`, routed by Appwrite to `outputs` with `source_key = "generated_video"`. IDs are currently random UUIDs.
- `app/api/generated-videos/route.ts` exposes GET/POST/PATCH; a ready record queues a `generated` reminder. The automation worker should write the same physical schema directly and use a deterministic export id.
- `components/realfarm/generated-video-renderer.ts`: `renderAndUploadUgcAdVideo(input)` is a browser canvas recorder for a pre-existing avatar clip plus demo clip. It is useful for manual legacy exports, but cannot run unattended and must not be used as the production compositor.

### Exact shared interfaces

- `lib/openrouter.ts`: `openRouterJson({ apiKey, model, system, user, schema?, timeoutMs?, maxTokens?, temperature?, plugins? }): Promise<Record<string, unknown>>` requests `json_schema` when supplied; `openRouterChatCompletion(...)` is the lower-level call. Use this for analysis and script structured output.
- `lib/rendi-ffmpeg.ts`: `uploadLocalFileToRendi({ filePath, apiKey, ... })` performs multipart upload and polls to `STORED`; `runRendiFfmpegAndDownload({ apiKey, ffmpegCommand, inputFiles, outputFiles, outputAlias, outputPath, localOutputPath?, ... })` submits, polls, downloads, and persists the output. Extend this seam for buffer/remote assets rather than introducing a second Rendi implementation.
- `lib/asset-storage.ts`: `persistAsset(absPath, bytes)`, `readAssetBytes(absPath)`, and `stageAssetToTmp(absPath)` map data-tree paths to deterministic Appwrite files. `lib/appwrite-stores.ts:bucketForPath(relPath)` already maps `ugc_avatar_videos/*` to bucket `ugc_videos`; `fileIdForPath(relPath)` is a 36-character SHA-256 hash.
- `lib/publishing.ts`: `publishAutomationRun(input)`, `recordReadyForReviewAutomationRun(input)`, and `recordAwaitingManualAutomationRun(input)` share `sourceType: "automation"` and `sourceId: runId`; `publishPost(input)` creates PostFast payloads/records/reminders. `lib/postfast-client.ts:postfastRequest<T>(path, options)` and `createPostFastPostPayload(...)` are the provider seams.
- `lib/reminders.ts:enqueueReminder(input)` creates deterministic `send-notification` jobs after checking owner settings.
- `lib/queue.ts:enqueueJob(input)` hashes `${ownerId}:${dedupeKey}` and stores the standard queue shape. `retryGenerationJob(id)` currently admits only `run-automation` and `run-x-automation`.
- `lib/json-store.ts` performs owner-filtered CRUD; `lib/appwrite-stores.ts:routeForStore(...)`, `ownedRowIdFor(table, ownerId, rid, index)`, and each route's `sourceKey` enforce owner isolation and discrimination on consolidated tables.
- `scripts/sync-function-shared.mjs` transpiles an explicit `generatedModules` list and rewrites aliases. `pnpm appwrite:check-shared` verifies byte-for-byte generated targets; deploy runs the sync first. Every portable UGC module must be added to that list, and generated worker files must never be edited by hand.
- `.env.example` has `FAL_KEY` and `RENDI_API_KEY`; `appwrite/functions/deploy.mjs` forwards both and OpenRouter/PostFast/Telegram keys, but not ElevenLabs. `lib/realfarm-generation-model-registry.ts:openRouterModelForUseCase(useCase)` is the canonical model selector.

## Stage-by-stage design

All stages receive `{ ownerId, automationId, runId, scheduledFor }`; all remote responses are normalized before persistence. The run record gets a compact checkpoint after each stage, permitting an idempotent retry to reuse completed assets.

### 1. Analyze

- New `lib/ugc-video-generation.ts:analyzeUgcProduct(input: UGCAnalyzeInput): Promise<UGCProductAnalysis>`.
- Input is either `schema.ugc.productUrl` or non-empty `schema.ugc.productBrief`; require at least one. For URL mode, call new `fetchProductPage({ url, timeoutMs, maxBytes })`, permitting only HTTP(S), rejecting private/link-local hosts and redirects to them, limiting body size/time, stripping scripts/styles, and returning title/meta/readable text. Do not send cookies.
- Feed the extracted facts plus manual brief to `openRouterJson` with a strict schema: product, audience, pains, differentiators, proof points, prohibited/unsupported claims, CTA, visual cues, and source URL. Add `ugcAnalysis` to `OpenRouterModelUseCase`; it may point to the existing OpenRouter `webResearch` model. No Gemini API/provider is added.
- Persist structured analysis in `automation_runs.data.checkpoints.analysis`; do not persist full scraped HTML.

### 2. Script

- New `generateUgcScript(input: UGCScriptInput): Promise<UGCScriptPlan>` in `lib/ugc-video-generation.ts`.
- Call `openRouterJson` using registry use case `ugcScript` and a strict schema containing `hook`, ordered segments (`hook | problem | solution | cta`), spoken text, approximate duration, b-roll prompts/timing, caption/hashtags, and hook overlay. Validate that all four narrative phases exist and duration/config limits are met.
- Persist the plan in the run checkpoint and later in the generated-video `sourceConfig`; use a stable script hash for downstream idempotency.

### 3. Actor

- New `lib/fal-client.ts`: `falSubmitAndWait<T>({ endpoint, input, apiKey, requestId, timeoutMs }): Promise<T>`, `generateFalImage(input: FalImageInput): Promise<FalAsset>`, `generateFalVideo(input: FalVideoInput): Promise<FalAsset>`, and `lipSyncFalVideo(input: FalLipSyncInput): Promise<FalAsset>`. Use FAL queue submission/status/result APIs, bounded polling, retryable error classes, and exact endpoint IDs held in the model registry/config rather than scattered strings.
- Actor source priority: configured gallery asset/uploaded avatar URL; otherwise generate via Flux 2 Pro from `actorPrompt`, demographic/style controls, and product context. Validate media MIME/dimensions and mirror bytes immediately to `data/ugc_avatar_videos/${ownerId}/${runId}/actor.png` (bucket `ugc_videos`).
- Persist actor source/provenance, FAL request id, prompt, storage path, and URL in the checkpoint. Never overwrite gallery/upload originals.

### 4. Voice

- New `lib/elevenlabs-tts.ts`: `synthesizeElevenLabsSpeech(input: ElevenLabsTtsInput): Promise<{ audio: Uint8Array; contentType: string; durationMs?: number; words: WordTiming[] }>`.
- Send the final spoken script, configured `voiceId`, model/settings, and output format. Request ElevenLabs timestamps/alignment; normalize character alignment into word-level `{ word, startMs, endMs }`. If the selected ElevenLabs endpoint cannot return alignment, make a second timestamps-capable request; do not invent timings from word count except as an explicitly marked last-resort config.
- Store `voice.mp3` and `word-timings.json` under the run's `ugc_avatar_videos` prefix, plus voice/model metadata in the checkpoint.

### 5. Video

- `generateActorMotion(...)` calls FAL Hailuo 2.3 Fast img2video using the durable portrait URL and motion prompt. Store the silent/base clip as `actor-motion.mp4`.
- `lipSyncActor(...)` calls FAL VEED lipsync by default with base clip + voice URL; when `schema.ugc.lipSyncTier === "premium"`, use Kling Avatar v2. Endpoint/model IDs come from the registry. Store `actor-lipsynced.mp4` and FAL provenance.
- Validate duration against audio with tolerance; composition trims/pads safely, but a gross mismatch fails this stage.

### 6. B-roll

- `generateUgcBroll(input): Promise<UGCBrollAsset[]>` maps script visual beats to Flux 2 Pro prompts. Apply a configurable cap (default 3) and generate sequentially or with low bounded concurrency to avoid rate spikes.
- Store each image as `broll-00.png`, etc. under the run prefix. Checkpoints contain timing, prompt, FAL id, and durable URL. Rendi applies zoom/pan (`zoompan`, crop/scale) rather than generating b-roll video.

### 7. Composite

- New `lib/ugc-rendi-compositor.ts:buildUgcFfmpegCommand(input: UGCCompositeInput): UGCCompositeSpec` produces the deterministic command, named Rendi inputs/outputs, and subtitle sidecar bytes; `compositeUgcVideo(input): Promise<UGCCompositeResult>` calls `uploadLocalFileToRendi`/new buffer-upload helper then `runRendiFfmpegAndDownload`.
- Build a 1080x1920 H.264/AAC MP4: scale/crop actor footage; insert b-roll at planned times with Ken Burns motion; retain voice/lip-sync audio; burn word-timed captions; show escaped hook text during the configured opening window; enforce `yuv420p`, fixed frame rate, faststart, and bounded duration.
- Generate ASS with per-word karaoke/highlight timing and escaped text. Upload font and ASS as explicit Rendi inputs; the command must reference Rendi aliases only. Store `captions.ass`, the exact FFmpeg command/metadata, and final `video.mp4` in Appwrite. Also run a second Rendi output (or second command) to extract `thumbnail.jpg`; never call a local binary.

### 8. Store

- New `lib/ugc-automation-runner.ts:runUgcAutomation(input: RunUgcAutomationInput): Promise<RunUgcAutomationResult>` owns checkpoints and final records; worker adapter supplies TablesDB/Storage/provider methods.
- Upsert `automation_runs` throughout (`accepted`, `analyzing`, `scripting`, `generating-actor`, `voicing`, `animating`, `generating-broll`, `compositing`, `generated`, then posting state/`failed`).
- Upsert one generated-video-compatible output with `source_key = "generated_video"`, `type/subtype = "ugc_ad"`, final video and thumbnail in `output_media`, and `source_automation_id/source_run_id`. Queue the `generated` reminder only after both final assets are durable.

### 9. Publish

- Build content from generated caption + normalized hashtags. Upload final MP4 through the same PostFast media upload seam used by slideshow.
- For `posting_mode = auto`, schedule for `scheduledFor` when future or publish now; fail the job if any configured integration fails, preserving the generated artifact for retry. For `review`/`manual`, record the corresponding PostFast state and queue `ready_to_post`. Persist publication summaries on both run/output exactly as slideshow does.

## Data model and deterministic IDs

### Automation configuration

Continue using an owner-scoped `automations` row. Extend `AutomationSchema` with `automationKind: "slideshow" | "video" | "ugc"` (or, if UI compatibility requires retaining `video`, add required discriminator `generationPipeline: "template" | "ai_ugc"`; prefer the explicit `"ugc"` kind). Add:

```ts
ugc?: {
  enabled: boolean
  productUrl?: string
  productBrief?: string
  actorSource: "generate" | "gallery" | "upload"
  actorAssetUrl?: string
  actorPrompt?: string
  voiceId: string
  voiceModel?: string
  lipSyncTier: "standard" | "premium"
  targetDurationSeconds: number
  brollCount: number
  captions: { enabled: boolean; style: string; fallback: "drawtext" | "png_frames" }
  hookOverlay: { enabled: boolean; durationMs: number; style: string }
}
```

Normalize defaults in `defaultAutomationSchema`, `mergeAutomationSchema`, and `normalizeAutomationSchema`; reject live UGC configurations missing product input or `voiceId`. Preserve both row-level and schema-level status consistency, since the scheduler filters row `status` and the worker must re-check `automation.status` and `automation.schema.status`.

### Run and output

- Run id: `ugcrun` + first 29 hex characters of SHA-256(`${automationId}:${scheduledFor}`), within Appwrite's 36-character limit. The physical row id remains owner-scoped hash of `automation_runs:${ownerId}:${runId}` via the existing convention.
- Job id: scheduler `rowId("ugc-auto:${automationId}:${slot}")`; job type `run-ugc-automation`; payload `{ automationId, scheduledFor }`; `owner_id` remains a column, not trusted from payload.
- Generated export id: `ugc-` + first 32 hash characters of SHA-256(`${automationId}:${scheduledFor}`), stable across job retries. Store physically in `outputs` with `source_key = "generated_video"`, not a new table and not `source_key = "result"`. Set `sourceConfig = { automationId, runId, scheduledFor, script, actor/voice/model provenance }` and media rows for `rendered_video`, `thumbnail`, optionally `actor`, `voice`, and `broll`.
- Add a `data/ugc-automations/exports.json` route only if a separate logical API becomes necessary; preferred implementation writes/reads the existing `generated-videos/exports.json` route so `app/api/generated-videos/route.ts` and current UI work without duplicate records.

## Scheduler and worker wiring

1. `listLiveAutomations` continues to be the scheduler's outer safety filter. Branch each row by normalized automation kind: slideshow keeps `run-automation`/`auto:`; UGC uses `run-ugc-automation`/`ugc-auto:`. Both use `dueAutomationSlots` and the existing generation lead (rename to generic generation lead or add `ugcGenerationLeadMinutes`; default UGC lead should be longer, e.g. 60 minutes, but configurable).
2. The deterministic queue row makes repeated five-minute scheduler invocations harmless.
3. Add handler `"run-ugc-automation"` in worker `main.js`, passing `{ payload, tables, storage, job, databaseId, sendTelegram }` to `runUgcAutomation`.
4. Worker reloads the owner-scoped automation and rechecks row/schema live status and feature flag before any paid provider call. It computes the deterministic run id and returns deduped for terminal posting states.
5. Stage checkpoints and deterministic storage paths let lease-expired/retried jobs skip completed paid stages after verifying the referenced Appwrite file exists.
6. Final publication follows the same auto/review/manual branches and reminder lifecycle as slideshow.

## New files

- `lib/fal-client.ts` — portable FAL queue client and normalized Flux/video/lipsync calls.
- `lib/elevenlabs-tts.ts` — portable ElevenLabs TTS plus word-alignment normalization.
- `lib/ugc-video-generation.ts` — UGC analysis/script schemas, validation, and stage-level generation functions.
- `lib/ugc-rendi-compositor.ts` — ASS generation and deterministic Rendi FFmpeg composition specification/execution.
- `lib/ugc-automation-runner.ts` — provider-agnostic nine-stage orchestration, checkpoints, id helpers, and final record shaping.
- `appwrite/functions/job-worker/src/ugc-automation.js` — worker-specific TablesDB/Storage/PostFast adapter and orchestration entry point.
- Generated by sync (do not hand-edit): `appwrite/functions/job-worker/src/fal-client.js`, `elevenlabs-tts.js`, `ugc-video-generation.js`, `ugc-rendi-compositor.js`, and `ugc-automation-runner.js`.
- Tests: `lib/fal-client.test.ts`, `lib/elevenlabs-tts.test.ts`, `lib/ugc-video-generation.test.ts`, `lib/ugc-rendi-compositor.test.ts`, `lib/ugc-automation-runner.test.ts`, plus worker/scheduler UGC integration tests beside their existing tests.

## Modified files

- `lib/realfarm-automation.ts` — extend kind/config types, defaults, merge, normalization, and validation for UGC.
- `lib/automations.ts` and `app/api/automations/route.ts` — accept/persist the UGC discriminator without collapsing it to slideshow/video; enforce config errors before going live.
- `lib/automation-slots.ts` — add/rename lead-time selector for UGC while preserving slideshow semantics.
- `appwrite/functions/automation-scheduler/src/main.js` — branch UGC jobs, dedupe keys, feature flag, and reporting counts.
- `appwrite/functions/job-worker/src/main.js` — import/register UGC handler; expose reminder callback; include type in worker comments and dispatch.
- `lib/queue.ts`, `app/api/jobs/[id]/retry/route.ts`, and `app/api/calendar/route.ts` — recognize `run-ugc-automation` as a generation job for retry/calendar projections.
- `lib/realfarm-generation-model-registry.ts` — add OpenRouter `ugcAnalysis`/`ugcScript` and provider endpoint registry entries for Flux 2 Pro, Hailuo 2.3 Fast, VEED lipsync, Kling Avatar v2, and ElevenLabs defaults. OpenRouter models remain OpenRouter model IDs; no Gemini client/key.
- `lib/rendi-ffmpeg.ts` — add a buffer/bytes upload overload (needed for worker-generated ASS/audio/image bytes) while retaining multipart upload, polling, download, and Appwrite persistence behavior.
- `lib/generated-videos.ts` / `lib/generated-video-types.ts` — allow deterministic create/upsert ids, automation provenance/checkpoint fields, and worker-written UGC records without breaking manual UUID exports.
- `app/api/generated-videos/route.ts` — ensure automated `ugc_ad` records and publication fields serialize consistently; no rendering in the route.
- `components/realfarm/generated-video-renderer.ts` — label/route automated UGC outputs to their durable MP4 and retain browser renderer only for legacy/manual composition.
- `lib/video-automation-templates.ts` — make `ugcAdPreset` seed the new `ugc` config rather than implying its empty segment format is a complete renderer.
- `lib/appwrite-stores.ts` — confirm/extend UGC subpaths to `ugc_videos`; no new bucket is required.
- `scripts/sync-function-shared.mjs` — add all portable modules with alias rewrites; add the updated model registry/config dependencies.
- `appwrite/functions/deploy.mjs` — add `ELEVENLABS_API_KEY` and `ENABLE_UGC_AUTOMATION` to forwarded variables; keep `FAL_KEY`.
- `.env.example` — document `ELEVENLABS_API_KEY=` and `ENABLE_UGC_AUTOMATION=false` (default off).
- `appwrite/functions/job-worker/package.json` — add only dependencies required by the synced clients, if using the FAL SDK; prefer fetch-only clients to avoid dependency/bundle drift.
- Relevant UI automation editor/list files discovered during implementation — expose UGC config, actor gallery/upload selection, voice/tier, live validation, status/progress, and generated output. Do not silently treat UGC as generic template video.

## Safety guards

- Global kill flag: `ENABLE_UGC_AUTOMATION` must equal `"true"`. Check it in scheduler before enqueue and again at the very start of the worker handler. Default false in `.env.example`; deploy must forward it deliberately.
- Live-only: scheduler already queries live rows, but worker must reload the owner-scoped automation and require both persisted row `status === "live"` and normalized `schema.status === "live"` immediately before creating/checkpointing a run. A paused/deleted automation returns `{ skipped: true, reason: "not_live" }` without provider calls.
- Missing credentials: worker preflight checks `FAL_KEY`, `ELEVENLABS_API_KEY`, `OPENROUTER_API_KEY`, `RENDI_API_KEY`, and `POSTFAST_API_KEY` only when active integrations/posting require it. Specifically required behavior for missing FAL/ElevenLabs: send an immediate Telegram notice naming automation/run and missing keys, then throw a typed non-retryable configuration error. `failOrRetry` must recognize that error, mark the job `dead` on the first attempt (not spend provider retries), and avoid a duplicate generic dead-job Telegram notice. If Telegram is unconfigured, dead-lettering still succeeds.
- URL analysis enforces SSRF protections, response limits, and no credential forwarding. Prompts treat scraped content as untrusted data and explicitly ignore embedded instructions.
- Paid-stage idempotency: check a validated checkpoint plus durable asset before submitting again; use run/stage request IDs where FAL supports them.
- Bound script length, b-roll count, duration, output bytes, polling duration, and provider concurrency. Escape ASS, drawtext, filenames, and FFmpeg filter values; never concatenate untrusted raw text into a shell context.

## Cost, retries, and failure handling

- Queue-level transient retry remains the current maximum three attempts with exponential backoff capped at one hour. Extend the worker error classification so provider 408/409/425/429/5xx, network errors, and polling timeouts retry; invalid config, unsupported media, content-policy rejection, and missing keys dead-letter immediately.
- Analyze/script: validate strict JSON; one bounded repair retry through OpenRouter, then fail without entering paid media stages.
- Actor/video/lipsync/b-roll: save provider request id before polling and checkpoint each durable result. Retry polling/resume request before resubmission. Never regenerate already stored assets on a publish-only retry.
- TTS: cache by voice/model/settings/script hash. A retry reads the stored MP3/timings.
- Composite: retain all inputs; Rendi timeout retries command submission using the same assets. Persist command id/command for diagnosis. Validate non-empty MP4 and thumbnail before marking generated.
- Publish: generation stays `generated` when PostFast fails; publication records capture per-integration failure. A queue retry resumes at publish, preventing new FAL/ElevenLabs charges.
- Cost ledger: extend `usage_ledger` records with per-stage provider/model, request id, estimated/returned units, and cost when available. Enforce optional per-run maximums before b-roll/video generation; do not log API keys or full provider payloads containing secrets.

## Open questions and risks

- Confirm the exact current FAL endpoint slugs, request/response schemas, idempotency support, and commercial availability for Flux 2 Pro, Hailuo 2.3 Fast, VEED lipsync, and Kling Avatar v2 before implementation; keep them registry-configured because provider identifiers change.
- Verify ElevenLabs timestamp endpoint/model compatibility with the selected voice and whether word timing is returned with the requested MP3 format.
- Run a Rendi capability probe for `subtitles`/libass, bundled fonts, `zoompan`, and complex filter graphs. If ASS/libass is unavailable, fallback order is escaped `drawtext` expressions for timed word groups, then pre-rendered transparent PNG caption frames uploaded as Rendi inputs and overlaid by time. The hook overlay can use the same fallback. Record the chosen capability mode in output metadata.
- The worker timeout is 900 seconds and lease 960 seconds; multi-provider UGC may exceed both. Measure worst-case polling. If it does, split stages into deterministic continuation jobs or increase Appwrite timeout/lease together—never merely increase lease below actual execution time.
- FAL/ElevenLabs assets may be signed/temporary URLs. Mirror every intermediate needed by later stages to Appwrite immediately and use accessible URLs or Rendi uploads from Appwrite bytes.
- Current generated-video records use `source_key = "generated_video"`, while slideshow results use `"result"`. Reusing generated-video is best for existing UGC UI, but publication summary columns must be populated consistently with result outputs.
- Existing `automationKind: "video"` and `ugc_ad` template semantics overlap. Migration/UI behavior for existing `ugc_ad` automations must be explicit: do not automatically turn existing live template automations into paid AI generation; require `ugc.enabled === true` and an explicit save/go-live action.
- Product scraping quality varies with JS-heavy/paywalled sites. Manual brief remains the supported fallback; do not add a new scraping provider unless product requirements authorize it.

## Build order

1. Add failing tests for kind normalization, deterministic ids, live/flag/key guards, scheduler dedupe, checkpoint resume, and output source discrimination.
2. Extend automation/model types and registry; add safe defaults and migration behavior with UGC disabled.
3. Implement/test fetch-only FAL and ElevenLabs clients with mocked queue, polling, errors, and alignment responses.
4. Implement analysis/script schemas, SSRF-safe product extraction, validation, and OpenRouter structured-output calls.
5. Extend Rendi upload support; implement ASS/hook/Ken Burns command builder and capability/fallback tests without local FFmpeg.
6. Implement the provider-agnostic UGC runner, deterministic checkpoints, cost records, and resume semantics.
7. Implement worker TablesDB/Storage/PostFast adapter, final `outputs`/`output_media` upsert, reminders, and classified failure/dead-letter behavior.
8. Wire scheduler job branching/lead time and worker dispatch; add queue retry/calendar recognition.
9. Add sync definitions, generate worker copies with `pnpm appwrite:sync-shared`, and pass `pnpm appwrite:check-shared`.
10. Add env/deploy allowlist and kill flag; verify absent keys dead-letter once with Telegram and that paused/non-live jobs make zero provider calls.
11. Update generated-video API/UI and UGC template/editor fields, preserving legacy manual browser rendering.
12. Run unit/integration tests, typecheck/lint, Appwrite shared check, a Rendi filter capability probe, then one flag-enabled non-publishing staging run before enabling PostFast auto mode.
