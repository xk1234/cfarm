import { afterEach, describe, expect, it, vi } from "vitest"

import { runUgcAutomationJob } from "./ugc-automation.js"

const originalFlag = process.env.ENABLE_UGC_AUTOMATION
afterEach(() => {
  if (originalFlag === undefined) delete process.env.ENABLE_UGC_AUTOMATION
  else process.env.ENABLE_UGC_AUTOMATION = originalFlag
  for (const key of ["FAL_KEY", "ELEVENLABS_API_KEY", "OPENROUTER_API_KEY", "RENDI_API_KEY", "POSTFAST_API_KEY"]) delete process.env[key]
})

describe("UGC worker pipeline", () => {
  it("persists a complete generated-video output and completes the manual publish branch", async () => {
    const harness = workerHarness()
    const clients = mockClients()
    const result = await runUgcAutomationJob({ ...harness.input, clients })

    expect(result.skipped).toBe(false)
    expect(result.checkpoints.publish.status).toBe("awaiting-manual-post")
    expect([...harness.rows.values()].find((row) => row.source_key === "generated_video")).toMatchObject({ kind: "ugc_ad", subtype: "ugc_ad", status: "ready" })
    expect([...harness.rows.values()].filter((row) => row.output_id)).toHaveLength(2)
    expect(harness.files.size).toBe(10)
    expect(clients.compositeUgcVideo).toHaveBeenCalledOnce()
  })

  it("resumes from durable checkpoints without repeating paid providers", async () => {
    const harness = workerHarness()
    const first = mockClients()
    await runUgcAutomationJob({ ...harness.input, clients: first })
    const second = mockClients()
    await runUgcAutomationJob({ ...harness.input, clients: second })
    for (const client of Object.values(second)) if (typeof client === "function" && "mock" in client) expect(client).not.toHaveBeenCalled()
  })

  it("leaves a transient FAL failure retryable", async () => {
    const harness = workerHarness()
    const clients = mockClients()
    clients.generateFalImage.mockRejectedValueOnce(Object.assign(new Error("FAL 503"), { retryable: true }))
    await expect(runUgcAutomationJob({ ...harness.input, clients })).rejects.toMatchObject({ retryable: true })
  })

  it("classifies invalid analysis configuration as non-retryable", async () => {
    const harness = workerHarness()
    const clients = mockClients()
    clients.analyzeUgcProduct.mockRejectedValueOnce(new Error("Invalid product URL"))
    await expect(runUgcAutomationJob({ ...harness.input, clients })).rejects.toMatchObject({ nonRetryable: true })
  })
})

function workerHarness() {
  process.env.ENABLE_UGC_AUTOMATION = "true"
  for (const key of ["FAL_KEY", "ELEVENLABS_API_KEY", "OPENROUTER_API_KEY", "RENDI_API_KEY"]) process.env[key] = "test"
  const automation = { id: "auto-1", status: "live", schema: { status: "live", automationKind: "ugc", posting_mode: "manual", social_integrations: [], ugc: { enabled: true, productBrief: "A useful product", actorSource: "generate", voiceId: "voice-1", targetDurationSeconds: 20, brollCount: 3, captions: { enabled: true }, hookOverlay: { durationMs: 2500 } } } }
  const rows = new Map(), files = new Map()
  const tables = {
    listRows: vi.fn(async (_database, table) => {
      if (table === "automations") return { rows: [{ $id: "automation-row", status: "live", data: JSON.stringify(automation) }] }
      if (table === "output_media") return { rows: [...rows.values()].filter((row) => row.output_id) }
      if (table === "automation_runs") return { rows: [...rows.values()].filter((row) => row.automation_id && row.data) }
      return { rows: [] }
    }),
    getRow: vi.fn(async (_database, _table, id) => { if (!rows.has(id)) throw Object.assign(new Error(`not found ${id}; ${[...rows.keys()].join(",")}`), { code: 404 }); return rows.get(id) }),
    upsertRow: vi.fn(async (_database, _table, id, data) => { const row = { ...(rows.get(id) || {}), ...data, $id: id }; rows.set(id, row); return row }),
    createRow: vi.fn(async (_database, _table, id, data) => { if (rows.has(id)) throw Object.assign(new Error("exists"), { code: 409 }); const row = { ...data, $id: id }; rows.set(id, row); return row }),
    deleteRow: vi.fn(async (_database, _table, id) => { rows.delete(id) }),
  }
  const storage = {
    createFile: vi.fn(async (bucket, id, input) => { if (files.has(id)) throw Object.assign(new Error("exists"), { code: 409 }); files.set(id, Buffer.from(input.source.data)); return { bucket, id } }),
    deleteFile: vi.fn(async (_bucket, id) => { files.delete(id) }),
    getFile: vi.fn(async (_bucket, id) => { if (!files.has(id)) throw Object.assign(new Error("not found"), { code: 404 }); return { id } }),
    getFileView: vi.fn(async (_bucket, id) => { if (!files.has(id)) throw Object.assign(new Error("not found"), { code: 404 }); return files.get(id) }),
  }
  return { rows, files, input: { payload: { automationId: "auto-1", scheduledFor: "2026-07-22T00:00:00Z" }, tables, storage, job: { owner_id: "owner-1" }, databaseId: "cfarm" } }
}

function mockClients() {
  const plan = { hook: "Try this", caption: "A useful product", hashtags: ["useful"], durationSeconds: 20, segments: [
    { phase: "hook", spokenText: "Try this", durationSeconds: 3, brollPrompt: "product closeup", startSeconds: 0, endSeconds: 3 },
    { phase: "problem", spokenText: "This solves a problem", durationSeconds: 5, brollPrompt: "problem scene", startSeconds: 3, endSeconds: 8 },
    { phase: "solution", spokenText: "Here is the solution", durationSeconds: 7, brollPrompt: "solution scene", startSeconds: 8, endSeconds: 15 },
    { phase: "cta", spokenText: "Try it now", durationSeconds: 5, startSeconds: 15, endSeconds: 20 },
  ] }
  let asset = 0
  const fetchMock = vi.fn(async (url) => new Response(String(url).includes("video") ? Buffer.from("video-bytes") : Buffer.from("image-bytes"), { status: 200, headers: { "content-type": String(url).includes("video") ? "video/mp4" : "image/png" } }))
  return {
    analyzeUgcProduct: vi.fn().mockResolvedValue({ product: "Useful Product" }),
    generateUgcScript: vi.fn().mockResolvedValue(plan),
    generateFalImage: vi.fn(async () => ({ url: `https://assets.test/image-${asset++}.png`, requestId: `image-${asset}` })),
    generateFalVideo: vi.fn().mockResolvedValue({ url: "https://assets.test/video-motion.mp4", requestId: "motion-1" }),
    lipSyncFalVideo: vi.fn().mockResolvedValue({ url: "https://assets.test/video-lipsync.mp4", requestId: "lipsync-1" }),
    synthesizeElevenLabsSpeech: vi.fn().mockResolvedValue({ audio: Buffer.from("voice"), contentType: "audio/mpeg", durationMs: 20000, words: [{ word: "Try", startMs: 0, endMs: 500 }] }),
    compositeUgcVideo: vi.fn().mockResolvedValue({ video: Buffer.from("final-video"), thumbnail: Buffer.from("thumbnail"), requestId: "rendi-1", captionMode: "ass" }),
    fetch: fetchMock,
  }
}

describe("UGC worker paid-call guards", () => {
  it("does no I/O while the kill switch is off", async () => {
    delete process.env.ENABLE_UGC_AUTOMATION
    const tables = { listRows: vi.fn() }
    await expect(runUgcAutomationJob({ payload: { automationId: "a", scheduledFor: "2026-07-22T00:00:00Z" }, tables, storage: {}, job: { owner_id: "o" }, databaseId: "cfarm" })).resolves.toMatchObject({ skipped: true, reason: "feature_disabled" })
    expect(tables.listRows).not.toHaveBeenCalled()
  })

  it("notifies once and throws a non-retryable error for missing paid keys", async () => {
    process.env.ENABLE_UGC_AUTOMATION = "true"
    const tables = { listRows: vi.fn().mockResolvedValue({ rows: [{ status: "live", data: JSON.stringify({ status: "live", schema: { status: "live", automationKind: "ugc", posting_mode: "manual", ugc: { enabled: true } } }) }] }) }
    const sendTelegram = vi.fn().mockResolvedValue({ sent: true })
    await expect(runUgcAutomationJob({ payload: { automationId: "a", scheduledFor: "2026-07-22T00:00:00Z" }, tables, storage: {}, job: { owner_id: "o" }, databaseId: "cfarm", sendTelegram })).rejects.toMatchObject({ nonRetryable: true, telegramNotified: true })
    expect(sendTelegram).toHaveBeenCalledOnce()
  })
})
