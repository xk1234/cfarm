import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-reference-import-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("POST /api/assets/reference-import", () => {
  it("uploads, analyzes, stores, and marks reference image files ready", async () => {
    const fetchMock = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url)
        if (href.includes("openrouter.ai")) {
          const body = JSON.parse(String(init?.body)) as {
            messages?: Array<{ content?: unknown }>
          }
          const userContent = body.messages?.[1]?.content as
            Array<{ type?: string; image_url?: { url?: string } }> | undefined
          expect(
            userContent?.find((item) => item.type === "image_url")?.image_url
              ?.url
          ).toMatch(/^data:image\/png;base64,/)
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify(referenceAnalysisFixture),
                  },
                },
              ],
            }),
            { status: 200 }
          )
        }
        return new Response("unexpected fetch", { status: 500 })
      }
    )
    vi.stubGlobal("fetch", fetchMock)

    const formData = new FormData()
    formData.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "pose-reference.png", {
        type: "image/png",
      })
    )
    formData.set("name", "Pose reference")

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/assets/reference-import", {
        method: "POST",
        body: formData,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.asset).toMatchObject({
      kind: "image",
      scope: "ugc_avatar",
      category: "reference",
      name: "Pose reference",
      status: "ready",
      metadata: {
        analysisStatus: "ready",
        sourceUpload: true,
        analysis: referenceAnalysisFixture,
      },
    })
    expect(payload.asset.fileUrl).toMatch(
      /^\/api\/local-assets\/assets\/files\/\d+-.*\.png$/
    )

    const savedFile = path.join(
      tempRoot,
      "data",
      "assets",
      "files",
      decodeURIComponent(path.basename(payload.asset.fileUrl))
    )
    await expect(stat(savedFile)).resolves.toMatchObject({ size: 4 })

    const stored = JSON.parse(
      await readFile(
        path.join(tempRoot, "data", "assets", "assets.json"),
        "utf8"
      )
    )
    expect(stored.assets[0]).toMatchObject({
      id: payload.asset.id,
      fileUrl: payload.asset.fileUrl,
      metadata: { analysisStatus: "ready", sourceUpload: true },
    })
  })
})

const referenceAnalysisFixture = {
  composition: { orientation: "vertical" },
  camera: { shot_type: "selfie" },
  pose: { body_orientation: "angled" },
  facial_expression: { eyes: "relaxed" },
  hair: { length: "long" },
  clothing: { top: { type: "tee" } },
  accessories: { jewelry: [] },
  environment: { location_type: "bedroom" },
  lighting: { main_light_source: "window" },
  recreation_notes: { must_preserve: ["pose"] },
}
