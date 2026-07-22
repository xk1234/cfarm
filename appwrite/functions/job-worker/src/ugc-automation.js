import crypto from "node:crypto"
import { InputFile } from "node-appwrite/file"

import { UgcConfigurationError, runUgcAutomation, ugcRunId } from "./ugc-automation-runner.js"
import { analyzeUgcProduct, generateUgcScript } from "./ugc-video-generation.js"
import { generateFalImage, generateFalVideo, lipSyncFalVideo } from "./fal-client.js"
import { synthesizeElevenLabsSpeech } from "./elevenlabs-tts.js"
import { buildUgcFfmpegCommand, compositeUgcVideo } from "./ugc-rendi-compositor.js"
import { generationModelRegistry } from "./realfarm-generation-model-registry.js"

const UGC_BUCKET = "ugc_videos"
const OUTPUTS = "outputs"
const OUTPUT_MEDIA = "output_media"
const USAGE = "usage_ledger"
const JOBS = "jobs"
const ASSETS = "permanent_assets"

const nowIso = () => new Date().toISOString()
const safeJson = (value) => { try { return JSON.parse(value || "null") } catch { return null } }

export async function runUgcAutomationJob({ payload, tables, storage, job, databaseId, sendTelegram, clients = {} }) {
  const automationId = String(payload?.automationId || "").trim()
  const scheduledFor = String(payload?.scheduledFor || "").trim()
  const ownerId = String(job?.owner_id || "").trim()
  if (!automationId || !scheduledFor || !ownerId) throw new UgcConfigurationError("run-ugc-automation: invalid job identity")
  const runId = ugcRunId(automationId, scheduledFor)
  const draftOnly = payload?.draftOnly === true

  // Kill switch is deliberately checked before any database or provider call.
  if (process.env.ENABLE_UGC_AUTOMATION !== "true") return { skipped: true, reason: "feature_disabled", runId }
  const response = await tables.listRows(databaseId, "automations", [
    `equal(\"rid\",[\"${automationId.replaceAll('"', '')}\"])`,
    `equal(\"owner_id\",[\"${ownerId.replaceAll('"', '')}\"])`,
    "limit(1)",
  ])
  const row = response.rows?.[0]
  const automation = safeJson(row?.data)
  if (!row || !automation) throw new UgcConfigurationError("run-ugc-automation: automation not found")
  if (row.status !== "live" || automation.status !== "live" || automation.schema?.status !== "live") return { skipped: true, reason: "not_live", runId }
  if (automation.schema?.automationKind !== "ugc" || automation.schema?.ugc?.enabled !== true) return { skipped: true, reason: "ugc_disabled", runId }

  const missing = ["FAL_KEY", "ELEVENLABS_API_KEY", "OPENROUTER_API_KEY", "RENDI_API_KEY", ...(!draftOnly && automation.schema.posting_mode === "auto" && (automation.schema.social_integrations || []).length ? ["POSTFAST_API_KEY"] : [])].filter((key) => !String(process.env[key] || "").trim())
  if (missing.length) {
    await sendTelegram?.(`AI UGC configuration error\nAutomation: ${automationId}\nRun: ${runId}\nMissing: ${missing.join(", ")}`).catch(() => undefined)
    throw new UgcConfigurationError(`run-ugc-automation: missing ${missing.join(", ")}`, { telegramNotified: true })
  }

  const existingRun = await findRun(tables, databaseId, ownerId, runId)
  const checkpoints = existingRun?.checkpoints || {}
  const schema = automation.schema
  const ugc = schema.ugc || {}
  const prefix = `ugc_avatar_videos/${ownerId}/${runId}`
  const api = {
    analyze: clients.analyzeUgcProduct || analyzeUgcProduct,
    script: clients.generateUgcScript || generateUgcScript,
    image: clients.generateFalImage || generateFalImage,
    video: clients.generateFalVideo || generateFalVideo,
    lipsync: clients.lipSyncFalVideo || lipSyncFalVideo,
    speech: clients.synthesizeElevenLabsSpeech || synthesizeElevenLabsSpeech,
    composite: clients.compositeUgcVideo || compositeUgcVideo,
    fetch: clients.fetch || fetch,
  }
  const persist = (name, bytes, contentType) => persistAsset(storage, `${prefix}/${name}`, bytes, contentType)
  const load = (path) => loadAsset(storage, path)
  const durableInput = async (path, contentType) => dataUrl(await load(path), contentType)
  const usage = async (stage, detail = {}) => recordUsage(tables, databaseId, ownerId, automationId, runId, stage, detail)
  try { return await runUgcAutomation({
    automationId, ownerId, scheduledFor, automation, checkpoints,
    assetExists: async (storagePath) => {
      const fileId = crypto.createHash("sha256").update(storagePath.replace(/^data\//, "")).digest("hex").slice(0, 36)
      try { await storage.getFile("ugc_videos", fileId); return true } catch { return false }
    },
    saveCheckpoint: async (stage, _checkpoint, all) => upsertRun(tables, databaseId, ownerId, { ...(existingRun || {}), kind: "ugc", jobId: job?.$id || job?.id, id: runId, automationId, scheduledFor, status: stage, checkpoints: all, updatedAt: nowIso(), createdAt: existingRun?.createdAt || nowIso() }),
    stages: {
      analysis: async () => {
        try {
          const analysis = await api.analyze({ apiKey: process.env.OPENROUTER_API_KEY, productUrl: ugc.productUrl, productBrief: ugc.productBrief })
          await usage("analysis", { provider: "openrouter", model: generationModelRegistry.openRouter.ugcAnalysis.model })
          return { analysis }
        } catch (error) { throw classifyConfiguration(error, "analysis") }
      },
      script: async ({ checkpoints }) => {
        const plan = await api.script({ apiKey: process.env.OPENROUTER_API_KEY, analysis: checkpoints.analysis.analysis, targetDurationSeconds: bounded(ugc.targetDurationSeconds, 15, 180, 60) })
        await usage("script", { provider: "openrouter", model: generationModelRegistry.openRouter.ugcScript.model })
        return { plan }
      },
      actor: async ({ checkpoints }) => {
        let sourceUrl = String(ugc.actorAssetUrl || "").trim(), provenance = { provider: "configured_asset" }
        if (!sourceUrl || ugc.actorSource === "generate") {
          const asset = await api.image({ endpoint: generationModelRegistry.ugc.falFlux2ProEndpoint, apiKey: process.env.FAL_KEY, input: { prompt: actorPrompt(ugc, checkpoints.analysis.analysis), image_size: "portrait_16_9", num_images: 1 } })
          sourceUrl = asset.url; provenance = { provider: "fal", model: generationModelRegistry.ugc.falFlux2ProEndpoint, requestId: asset.requestId }
        }
        const remote = await downloadRemote(api.fetch, sourceUrl, ["image/"])
        const stored = await persist("actor.png", remote.bytes, remote.contentType)
        await usage("actor", provenance)
        return { ...stored, ...provenance }
      },
      voice: async ({ checkpoints }) => {
        const text = checkpoints.script.plan.segments.map((item) => item.spokenText).join(" ")
        const result = await api.speech({ text, voiceId: ugc.voiceId, apiKey: process.env.ELEVENLABS_API_KEY, modelId: ugc.voiceModel || generationModelRegistry.ugc.elevenLabsModelId, endpoint: generationModelRegistry.ugc.elevenLabsTimestampEndpoint })
        const audio = await persist("voice.mp3", result.audio, result.contentType)
        const timings = await persist("word-timings.json", new TextEncoder().encode(JSON.stringify(result.words)), "application/json")
        await usage("voice", { provider: "elevenlabs", model: ugc.voiceModel || generationModelRegistry.ugc.elevenLabsModelId, units: text.length })
        return { storagePaths: [audio.storagePath, timings.storagePath], audioPath: audio.storagePath, timingsPath: timings.storagePath, durationMs: result.durationMs, words: result.words }
      },
      motion: async ({ checkpoints }) => {
        const asset = await api.video({ endpoint: generationModelRegistry.ugc.falHailuo23FastEndpoint, apiKey: process.env.FAL_KEY, input: { image_url: await durableInput(checkpoints.actor.storagePath, "image/png"), prompt: ugc.motionPrompt || "Natural handheld UGC delivery, subtle head and hand movement, direct eye contact" } })
        const remote = await downloadRemote(api.fetch, asset.url, ["video/"])
        const stored = await persist("actor-motion.mp4", remote.bytes, remote.contentType)
        await usage("motion", { provider: "fal", model: generationModelRegistry.ugc.falHailuo23FastEndpoint, requestId: asset.requestId })
        return { ...stored, requestId: asset.requestId, model: generationModelRegistry.ugc.falHailuo23FastEndpoint }
      },
      lipsync: async ({ checkpoints }) => {
        const endpoint = ugc.lipSyncTier === "premium" ? generationModelRegistry.ugc.falKlingAvatarV2Endpoint : generationModelRegistry.ugc.falVeedLipSyncEndpoint
        const asset = await api.lipsync({ endpoint, apiKey: process.env.FAL_KEY, input: { video_url: await durableInput(checkpoints.motion.storagePath, "video/mp4"), audio_url: await durableInput(checkpoints.voice.audioPath, "audio/mpeg") } })
        const remote = await downloadRemote(api.fetch, asset.url, ["video/"])
        const stored = await persist("actor-lipsynced.mp4", remote.bytes, remote.contentType)
        await usage("lipsync", { provider: "fal", model: endpoint, requestId: asset.requestId })
        return { ...stored, requestId: asset.requestId, model: endpoint }
      },
      broll: async ({ checkpoints }) => {
        const candidates = checkpoints.script.plan.segments.filter((item) => item.brollPrompt).slice(0, bounded(ugc.brollCount, 0, 6, 3))
        const assets = []
        for (const [index, item] of candidates.entries()) {
          const generated = await api.image({ endpoint: generationModelRegistry.ugc.falFlux2ProEndpoint, apiKey: process.env.FAL_KEY, input: { prompt: item.brollPrompt, image_size: "portrait_16_9", num_images: 1 } })
          const remote = await downloadRemote(api.fetch, generated.url, ["image/"])
          const stored = await persist(`broll-${String(index).padStart(2, "0")}.png`, remote.bytes, remote.contentType)
          assets.push({ ...stored, prompt: item.brollPrompt, requestId: generated.requestId, startSeconds: item.startSeconds || 0, endSeconds: item.endSeconds || item.startSeconds + item.durationSeconds })
          await usage(`broll-${index}`, { provider: "fal", model: generationModelRegistry.ugc.falFlux2ProEndpoint, requestId: generated.requestId })
        }
        return { storagePaths: assets.map((item) => item.storagePath), assets }
      },
      composite: async ({ checkpoints }) => {
        const plan = checkpoints.script.plan
        const spec = buildUgcFfmpegCommand({ durationSeconds: plan.durationSeconds || ugc.targetDurationSeconds, hook: plan.hookOverlay || plan.hook, captions: checkpoints.voice.words || JSON.parse(new TextDecoder().decode(await load(checkpoints.voice.timingsPath))), broll: checkpoints.broll.assets.map((item, index) => ({ alias: `broll-${String(index).padStart(2, "0")}.png`, startSeconds: item.startSeconds, endSeconds: item.endSeconds })), captionsEnabled: ugc.captions?.enabled !== false, hookDurationMs: ugc.hookOverlay?.durationMs })
        const rendered = await api.composite({ apiKey: process.env.RENDI_API_KEY, spec, actor: await load(checkpoints.lipsync.storagePath), broll: await Promise.all(checkpoints.broll.assets.map((item) => load(item.storagePath))), fetchImpl: api.fetch })
        const video = await persist("video.mp4", rendered.video, "video/mp4")
        const thumbnail = await persist("thumbnail.jpg", rendered.thumbnail, "image/jpeg")
        await usage("composite", { provider: "rendi", model: "ffmpeg", requestId: rendered.requestId })
        return { storagePaths: [video.storagePath, thumbnail.storagePath], videoPath: video.storagePath, thumbnailPath: thumbnail.storagePath, captionMode: rendered.captionMode || "ass", command: spec.command, requestId: rendered.requestId }
      },
      store: async ({ exportId, checkpoints }) => {
        const output = await upsertGeneratedOutput(tables, databaseId, ownerId, { exportId, automationId, runId, scheduledFor, plan: checkpoints.script.plan, checkpoints })
        await enqueueNotification(tables, databaseId, ownerId, { event: "generated", sourceId: exportId, runId, text: `UGC video generated\n${checkpoints.script.plan.hook}` })
        return { outputId: exportId, outputRowId: output.rowId, storagePaths: [checkpoints.composite.videoPath, checkpoints.composite.thumbnailPath] }
      },
      publish: async ({ exportId, checkpoints }) => draftOnly ? { skipped: true, reason: "draft_only" } : publishOutput({ tables, databaseId, ownerId, automationId, runId, exportId, scheduledFor, schema, checkpoints, load, fetchImpl: api.fetch }),
    },
  }) } catch (error) {
    if (error instanceof UgcConfigurationError || error?.retryable === true) throw error
    throw classifyConfiguration(error, "pipeline")
  }
}

async function findRun(tables, databaseId, ownerId, runId) {
  const response = await tables.listRows(databaseId, "automation_runs", [`equal(\"rid\",[\"${runId}\"])`, `equal(\"owner_id\",[\"${ownerId}\"])`, "limit(1)"])
  return safeJson(response.rows?.[0]?.data)
}

async function upsertRun(tables, databaseId, ownerId, record) {
  const rowId = "u" + crypto.createHash("sha256").update(`automation_runs:${ownerId}:${record.id}`).digest("hex").slice(0, 35)
  await tables.upsertRow(databaseId, "automation_runs", rowId, { rid: record.id, owner_id: ownerId, automation_id: record.automationId, scheduled_for: record.scheduledFor, status: record.status, updated_at: record.updatedAt, data: JSON.stringify(record) })
}

async function persistAsset(storage, storagePath, bytes, contentType) {
  const relative = storagePath.replace(/^data\//, "")
  const id = fileId(relative)
  const body = Buffer.from(bytes)
  if (!body.length) throw new UgcConfigurationError(`UGC generated an empty ${storagePath}`)
  const input = InputFile.fromBuffer(body, relative.split("/").at(-1))
  try { await storage.createFile(UGC_BUCKET, id, input, []) }
  catch (error) {
    if (error?.code !== 409) throw error
    await storage.deleteFile(UGC_BUCKET, id).catch((failure) => { if (failure?.code !== 404) throw failure })
    await storage.createFile(UGC_BUCKET, id, input, [])
  }
  return { storagePath: `data/${relative}`, url: `/api/assets/${relative}`, contentType, bytes: body.byteLength }
}

async function loadAsset(storage, storagePath) {
  const relative = String(storagePath || "").replace(/^data\//, "")
  if (!relative.startsWith("ugc_avatar_videos/")) throw new UgcConfigurationError("Unsupported UGC storage path")
  return Buffer.from(await storage.getFileView(UGC_BUCKET, fileId(relative)))
}

async function downloadRemote(fetchImpl, url, allowedPrefixes) {
  if (!/^https:\/\//i.test(String(url || ""))) throw new UgcConfigurationError("Provider returned an invalid asset URL")
  let response
  try { response = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) }) }
  catch (error) { throw retryableError(error, "Asset download failed") }
  if (!response.ok) {
    const error = new Error(`Asset download failed (${response.status})`)
    error.retryable = retryableStatus(response.status)
    throw error
  }
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase()
  if (!allowedPrefixes.some((prefix) => contentType.startsWith(prefix))) throw new UgcConfigurationError(`Unsupported provider media type: ${contentType || "unknown"}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length || bytes.length > 250_000_000) throw new UgcConfigurationError("Provider media is empty or too large")
  return { bytes, contentType }
}

function dataUrl(bytes, contentType) { return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}` }
function fileId(path) { return crypto.createHash("sha256").update(path).digest("hex").slice(0, 36) }
function bounded(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback }
function actorPrompt(ugc, analysis) { return [ugc.actorPrompt || "Authentic vertical UGC creator portrait", analysis?.product && `Advertising ${analysis.product}`, "natural window light, phone camera realism, no text, no logos"].filter(Boolean).join(". ") }
function retryableStatus(status) { return [408, 409, 425, 429].includes(status) || status >= 500 }
function retryableError(cause, message) { const error = new Error(cause instanceof Error ? `${message}: ${cause.message}` : message); error.retryable = true; return error }
function classifyConfiguration(error, stage) {
  if (error?.retryable === true) return error
  const message = String(error?.message || error)
  if (/network|timed? out|timeout|408|409|425|429|\b5\d\d\b/i.test(message)) { const failure = new Error(message); failure.retryable = true; return failure }
  return new UgcConfigurationError(`UGC ${stage} configuration failed: ${message}`)
}

async function recordUsage(tables, databaseId, ownerId, automationId, runId, stage, detail) {
  const now = nowIso(), id = `usage-${crypto.createHash("sha256").update(`${runId}:${stage}`).digest("hex").slice(0, 24)}`
  const record = { id, automation_id: automationId, run_id: runId, kind: "ugc_provider", stage, provider: detail.provider, model: detail.model, request_id: detail.requestId, units: detail.units, used_at: now, ownerId }
  await tables.upsertRow(databaseId, USAGE, ownedRowId(USAGE, ownerId, id), { rid: id, name: stage, status: "recorded", created_raw: now, ord: -Date.now(), owner_id: ownerId, data: JSON.stringify(record) })
}

async function upsertGeneratedOutput(tables, databaseId, ownerId, input) {
  const rowId = consolidatedRowId(OUTPUTS, "generated_video", ownerId, input.exportId), now = nowIso()
  let existing
  try { existing = await tables.getRow(databaseId, OUTPUTS, rowId) } catch (error) { if (error?.code !== 404) throw error }
  const plan = input.plan, record = { id: input.exportId, type: "ugc_ad", status: "ready", createdAt: safeJson(existing?.data)?.createdAt || now, updatedAt: now, title: plan.hook || "AI UGC ad", description: plan.caption || "", caption: plan.caption || "", hashtags: normalizeHashtags(plan.hashtags), sourceAutomationId: input.automationId, sourceRunId: input.runId, videoUrl: `/api/assets/${input.checkpoints.composite.videoPath.replace(/^data\//, "")}`, previewUrl: `/api/assets/${input.checkpoints.composite.thumbnailPath.replace(/^data\//, "")}`, sourceConfig: { automationId: input.automationId, runId: input.runId, scheduledFor: input.scheduledFor, script: plan, providers: providerProvenance(input.checkpoints) }, publication: safeJson(existing?.data)?.publication }
  await tables.upsertRow(databaseId, OUTPUTS, rowId, { rid: input.exportId, owner_id: ownerId, source_key: "generated_video", name: record.title.slice(0, 2048), kind: "ugc_ad", subtype: "ugc_ad", status: "ready", storage_class: "permanent", origin: "deployed_app", title: record.title.slice(0, 2048), hook: String(plan.hook || "").slice(0, 10000), caption: record.caption.slice(0, 100000), hashtags: JSON.stringify(record.hashtags), text: plan.segments.map((item) => item.spokenText).join("\n").slice(0, 100000), text_data: JSON.stringify(plan.segments), source_automation_id: input.automationId, source_run_id: input.runId, source_entity_id: input.exportId, publication_status: existing?.publication_status || null, scheduled_at: existing?.scheduled_at || null, published_at: existing?.published_at || null, primary_post_id: existing?.primary_post_id || null, primary_release_url: existing?.primary_release_url || null, publications: existing?.publications || "[]", evaluation: "null", error: null, created_raw: record.createdAt, updated_at: now, migration_source: null, ord: Number.isFinite(existing?.ord) ? existing.ord : -Date.now(), data: JSON.stringify(record) })
  await syncOutputMedia(tables, databaseId, ownerId, rowId, [{ role: "rendered_video", kind: "video", path: input.checkpoints.composite.videoPath, mime: "video/mp4" }, { role: "thumbnail", kind: "image", path: input.checkpoints.composite.thumbnailPath, mime: "image/jpeg" }])
  return { rowId, record }
}

async function syncOutputMedia(tables, databaseId, ownerId, outputRowId, media) {
  const response = await tables.listRows(databaseId, OUTPUT_MEDIA, [`equal(\"output_id\",[\"${outputRowId}\"])`, "limit(100)"])
  for (const row of response.rows || []) await tables.deleteRow(databaseId, OUTPUT_MEDIA, row.$id)
  for (const [position, item] of media.entries()) {
    const relative = item.path.replace(/^data\//, ""), id = `m${crypto.createHash("sha256").update(`${outputRowId}:${item.role}`).digest("hex").slice(0, 35)}`
    await tables.createRow(databaseId, OUTPUT_MEDIA, id, { output_id: outputRowId, owner_id: ownerId, permanent_asset_id: null, kind: item.kind, role: item.role, position, storage_bucket: UGC_BUCKET, storage_file_id: fileId(relative), storage_path: item.path, url: `/api/assets/${relative}`, mime_type: item.mime, bytes: null, width: null, height: null, duration_ms: null, checksum: null, data: "null", created_at: nowIso() })
  }
}

async function publishOutput({ tables, databaseId, ownerId, runId, exportId, scheduledFor, schema, checkpoints, load, fetchImpl }) {
  const integrations = (schema.social_integrations || []).filter((item) => item.integration_id && !item.disabled)
  const mode = ["auto", "review", "manual"].includes(schema.posting_mode) ? schema.posting_mode : "auto"
  const content = [checkpoints.script.plan.caption, ...normalizeHashtags(checkpoints.script.plan.hashtags)].filter(Boolean).join("\n\n")
  let media = []
  if (integrations.length) media = await uploadPostFastMedia(await load(checkpoints.composite.videoPath), fetchImpl)
  const records = []
  if (mode === "auto") {
    for (const integration of integrations) {
      const payload = { status: "SCHEDULED", posts: [{ content, mediaItems: media, scheduledAt: new Date(scheduledFor).getTime() > Date.now() ? scheduledFor : nowIso(), socialMediaId: integration.integration_id, status: "SCHEDULED" }] }
      const response = await postFastRequest("/social-posts", payload, fetchImpl)
      records.push({ integrationId: integration.integration_id, provider: integration.provider, status: "scheduled", scheduledAt: payload.posts[0].scheduledAt, postfastPostId: response?.id || response?.posts?.[0]?.id, updatedAt: nowIso() })
    }
  } else {
    for (const integration of integrations) records.push({ integrationId: integration.integration_id, provider: integration.provider, status: mode === "review" ? "ready_for_review" : "awaiting_manual_post", scheduledAt: scheduledFor, content, media, updatedAt: nowIso() })
    await enqueueNotification(tables, databaseId, ownerId, { event: "ready_to_post", sourceId: exportId, runId, scheduledFor, availableAt: scheduledFor, requiresPostConfirmation: true, text: mode === "review" ? `UGC video ready for review\n${content}` : `UGC video ready to post\n${content}` })
  }
  await updateOutputPublications(tables, databaseId, ownerId, exportId, records, mode)
  return { outputId: exportId, status: mode === "auto" && records.length ? "posted" : mode === "review" ? "ready-for-review" : mode === "manual" ? "awaiting-manual-post" : "generated", publications: records, storagePath: checkpoints.composite.videoPath }
}

async function uploadPostFastMedia(bytes, fetchImpl) {
  const signed = await postFastRequest("/file/get-signed-upload-urls", { contentType: "video/mp4", count: 1 }, fetchImpl)
  if (!Array.isArray(signed) || !signed[0]?.signedUrl || !signed[0]?.key) throw new Error("PostFast returned an invalid signed upload")
  const response = await fetchImpl(signed[0].signedUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: bytes, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw retryableError(null, `PostFast media upload failed (${response.status})`)
  return [{ key: signed[0].key, type: "VIDEO", sortOrder: 0 }]
}

async function postFastRequest(path, body, fetchImpl) {
  let response
  try { response = await fetchImpl(`https://api.postfa.st${path}`, { method: "POST", headers: { "pf-api-key": process.env.POSTFAST_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }) }
  catch (error) { throw retryableError(error, "PostFast request failed") }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) { const error = new Error(payload?.message || `PostFast failed (${response.status})`); error.retryable = retryableStatus(response.status); throw error }
  return payload
}

async function updateOutputPublications(tables, databaseId, ownerId, exportId, records, mode) {
  const rowId = consolidatedRowId(OUTPUTS, "generated_video", ownerId, exportId), row = await tables.getRow(databaseId, OUTPUTS, rowId), stored = safeJson(row.data) || {}
  stored.publication = { mode, records, updatedAt: nowIso() }; stored.updatedAt = nowIso()
  await tables.upsertRow(databaseId, OUTPUTS, rowId, { ...row, publication_status: records[0]?.status || null, scheduled_at: records[0]?.scheduledAt || null, primary_post_id: records[0]?.postfastPostId || null, publications: JSON.stringify(records), updated_at: stored.updatedAt, data: JSON.stringify(stored), $id: undefined, $createdAt: undefined, $updatedAt: undefined, $permissions: undefined, $databaseId: undefined, $tableId: undefined })
}

async function enqueueNotification(tables, databaseId, ownerId, input) {
  const settings = safeJson((await tables.listRows(databaseId, ASSETS, [`equal(\"owner_id\",[\"${ownerId}\"])`, `equal(\"source_key\",[\"reminder_settings\"])`, "limit(1)"])).rows?.[0]?.data)
  if (settings?.channel !== "telegram" || settings.events?.[input.event] !== true) return
  const dedupe = ["reminder", input.event, "generated_video", input.sourceId, input.event === "ready_to_post" ? input.scheduledFor : ""].filter(Boolean).join(":"), id = `j${crypto.createHash("sha256").update(`${ownerId}:${dedupe}`).digest("hex").slice(0, 35)}`, now = nowIso()
  try { await tables.createRow(databaseId, JOBS, id, { type: "send-notification", status: "queued", payload: JSON.stringify({ event: input.event, sourceType: "generated_video", sourceId: input.sourceId, scheduledFor: input.scheduledFor, requiresPostConfirmation: input.requiresPostConfirmation === true, text: input.text }), priority: 0, attempts: 0, max_attempts: 5, available_at: Date.parse(input.availableAt) > Date.now() ? input.availableAt : now, dedupe_key: dedupe, created_at: now, updated_at: now, owner_id: ownerId }) } catch (error) { if (error?.code !== 409) throw error }
}

function normalizeHashtags(values) { return (Array.isArray(values) ? values : []).map((value) => `#${String(value).trim().replace(/^#+/, "").replace(/\s+/g, "")}`).filter((value) => value.length > 1).slice(0, 12) }
function providerProvenance(checkpoints) { return Object.fromEntries(["actor", "voice", "motion", "lipsync", "broll", "composite"].map((stage) => [stage, { provider: checkpoints[stage]?.provider, model: checkpoints[stage]?.model, requestId: checkpoints[stage]?.requestId }])) }
function ownedRowId(table, ownerId, rid) { return `u${crypto.createHash("sha256").update(`${table}:${ownerId}:${rid}`).digest("hex").slice(0, 35)}` }
function consolidatedRowId(table, sourceKey, ownerId, rid) { return `u${crypto.createHash("sha256").update(`${table}:${sourceKey}:${ownerId}:${rid}`).digest("hex").slice(0, 35)}` }
