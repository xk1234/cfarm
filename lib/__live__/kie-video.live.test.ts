import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createFluxKontextTask,
  createKieMarketTask,
  pollKieMarketTask,
} from "@/lib/kie-image"
import {
  buildKieImageToVideoPayload,
  readKieVideoResultUrl,
} from "@/lib/kie-video"

function loadEnvKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8")
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "")
    }
  } catch {
    /* ignore */
  }
  return undefined
}

const apiKey = loadEnvKey("KIE_KEY")

describe.skipIf(!process.env.RUN_LIVE)("LIVE KIE video — image-to-video create contract (A5/B4 video)", () => {
  it("parses a realistic recordInfo success payload (pure)", () => {
    // Shape observed from the live market recordInfo endpoint.
    const payload = {
      code: 200,
      data: {
        state: "success",
        resultJson: JSON.stringify({
          resultUrls: ["https://tempfile.aiquickdraw.com/v/demo.mp4"],
        }),
      },
    }
    expect(readKieVideoResultUrl(payload)).toBe(
      "https://tempfile.aiquickdraw.com/v/demo.mp4"
    )
    // In-progress payload yields empty (keep polling), never throws.
    expect(readKieVideoResultUrl({ code: 200, data: { state: "waiting" } })).toBe(
      ""
    )
  })

  it("accepts our image-to-video payload live and returns a real taskId", async () => {
    expect(apiKey, "KIE_KEY must be present").toBeTruthy()

    // Generate a fresh public input frame so we don't depend on an expiring URL.
    const imgTaskId = await createFluxKontextTask({
      apiKey: apiKey!,
      prompt: "a single red apple on a plain white table, product photo",
      aspectRatio: "1:1",
    })
    const inputFrame = await pollKieMarketTaskUrlFromFlux(apiKey!, imgTaskId)
    expect(inputFrame).toMatch(/^https?:\/\//)
    console.log("\nLIVE KIE video input frame:", inputFrame)

    const body = buildKieImageToVideoPayload({
      imageUrl: inputFrame,
      prompt: "the apple gently rotates",
      model: "kling-2.6/image-to-video",
      duration: "5",
      aspectRatio: "1:1",
    })
    const taskId = await createKieMarketTask({ apiKey: apiKey!, body })
    expect(typeof taskId).toBe("string")
    expect(taskId.length).toBeGreaterThan(0)
    console.log("LIVE KIE video taskId:", taskId)

    // Poll only briefly to confirm the endpoint accepts the job and the poll
    // loop parses in-progress state without error. We intentionally do NOT wait
    // for the full multi-minute render to limit spend/time.
    let processed = false
    try {
      await pollKieMarketTask({
        apiKey: apiKey!,
        taskId,
        pollLimit: 3,
        pollDelayMs: 4000,
      })
      processed = true // completed unexpectedly fast — also fine
    } catch (e) {
      // Timeout after 3 polls is the expected outcome for a queued video job.
      processed = /timed out/i.test(String(e))
    }
    expect(processed).toBe(true)
  }, 160_000)
})

// helper: flux uses the flux record-info endpoint, reachable via pollKieMarketTask?
// No — flux result lives on a different endpoint, so import the flux poller.
import { pollFluxKontextTask } from "@/lib/kie-image"
async function pollKieMarketTaskUrlFromFlux(apiKey: string, taskId: string) {
  return pollFluxKontextTask({ apiKey, taskId, pollLimit: 40, pollDelayMs: 3000 })
}
