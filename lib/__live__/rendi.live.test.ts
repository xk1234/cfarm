import { readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  uploadLocalFileToRendi,
  runRendiFfmpegAndDownload,
} from "@/lib/rendi-ffmpeg"

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

const apiKey = loadEnvKey("RENDI_API_KEY")
const INPUT = "/tmp/rendi_in.mp4"
const OUTPUT = "/tmp/rendi_out.mp4"

describe.skipIf(!process.env.RUN_LIVE)("LIVE Rendi — upload + ffmpeg + download (A5 video templates)", () => {
  it("uploads a real file, runs a real ffmpeg command, downloads the output", async () => {
    expect(apiKey, "RENDI_API_KEY must be present").toBeTruthy()

    // 1) Upload the local test clip (init-upload -> PUT part -> complete-upload -> poll STORED).
    const stored = await uploadLocalFileToRendi({
      filePath: INPUT,
      apiKey: apiKey!,
    })
    expect(stored.file_id.length).toBeGreaterThan(0)
    expect(stored.status).toBe("STORED")
    expect(stored.storage_url).toMatch(/^https?:\/\//)
    console.log("\nLIVE Rendi uploaded file_id:", stored.file_id)

    // 2) Run a real ffmpeg command server-side: scale 128->64 and re-encode.
    const status = await runRendiFfmpegAndDownload({
      apiKey: apiKey!,
      ffmpegCommand:
        "-i {{in_1}} -vf scale=64:64 -pix_fmt yuv420p -movflags +faststart {{out_1}}",
      inputFiles: { in_1: stored.storage_url! },
      outputFiles: { out_1: "rendi_out.mp4" },
      outputAlias: "out_1",
      outputPath: OUTPUT,
      pollDelayMs: 4000,
      pollLimit: 30,
    })
    expect(status.status).toBe("SUCCESS")

    // 3) Confirm the downloaded output is a real, non-empty file.
    const outStat = statSync(OUTPUT)
    expect(outStat.size).toBeGreaterThan(0)
    console.log("LIVE Rendi output bytes:", outStat.size)
  }, 180_000)
})
