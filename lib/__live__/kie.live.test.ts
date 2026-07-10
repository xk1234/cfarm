import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createFluxKontextTask,
  pollFluxKontextTask,
  getKieApiKey,
} from "@/lib/kie-image"

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

describe.skipIf(!process.env.RUN_LIVE)("LIVE KIE — flux kontext image (B4 clone-ads backbone)", () => {
  it("getKieApiKey reads the key from env", () => {
    expect(getKieApiKey({ KIE_KEY: apiKey })).toBe(apiKey)
  })

  it("creates a real task and parses a real taskId", async () => {
    expect(apiKey, "KIE_KEY must be present").toBeTruthy()
    const taskId = await createFluxKontextTask({
      apiKey: apiKey!,
      prompt:
        "a plain flat pastel-green background, minimal, no text, product-ad style",
      aspectRatio: "1:1",
    })
    expect(typeof taskId).toBe("string")
    expect(taskId.length).toBeGreaterThan(0)
    console.log("\nLIVE KIE taskId:", taskId)

    // Poll the real record-info endpoint and parse the real success shape.
    const resultUrl = await pollFluxKontextTask({
      apiKey: apiKey!,
      taskId,
      pollLimit: 40,
      pollDelayMs: 3000,
    })
    console.log("LIVE KIE resultUrl:", resultUrl)
    expect(resultUrl).toMatch(/^https?:\/\//)
  }, 150_000)
})
