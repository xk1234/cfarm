import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import {
  deleteAssetFromAppwrite,
  mirrorAssetToAppwrite,
} from "@/lib/asset-storage"
import { readJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/characters/images.json -> character_generations; media -> Storage.
let tempRoot: string

const sourceFile = () =>
  path.join(tempRoot, "data", "characters", "images", "source.png")
const referenceFile = () =>
  path.join(tempRoot, "data", "assets", "files", "reference.png")

async function clearGenerations() {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured for tests.")
  for (;;) {
    const res = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      "character_generations",
      [Query.limit(100)]
    )
    for (const row of res.rows) {
      await aw.tables.deleteRow(
        APPWRITE_DATABASE_ID,
        "character_generations",
        String(row.$id)
      )
    }
    if (res.rows.length < 100) break
  }
}

beforeEach(async () => {
  await clearGenerations()
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-character-workflow-"))
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  await mirrorAssetToAppwrite(sourceFile(), new Uint8Array([137, 80, 78, 71]))
  await mirrorAssetToAppwrite(referenceFile(), new Uint8Array([137, 80, 78, 71]))
  vi.stubEnv("KIE_KEY", "test-kie-key")
  vi.stubEnv("OPENROUTER_API_KEY", "")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await deleteAssetFromAppwrite(sourceFile()).catch(() => {})
  await deleteAssetFromAppwrite(referenceFile()).catch(() => {})
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearGenerations)

describe("POST /api/characters/workflows", () => {
  it("recreates a reference image with saved analysis without calling OpenRouter", async () => {
    let uploadCount = 0
    const fetchMock = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url)
        if (href.includes("openrouter.ai")) {
          return new Response(
            JSON.stringify({ error: { message: "unexpected" } }),
            {
              status: 500,
            }
          )
        }
        if (href.includes("/api/file-base64-upload")) {
          uploadCount += 1
          return new Response(
            JSON.stringify({
              data: {
                downloadUrl: "https://kie.example.com/source.png",
              },
            }),
            { status: 200 }
          )
        }
        if (href.includes("/api/v1/jobs/createTask")) {
          const body = JSON.parse(String(init?.body)) as {
            model?: string
            input?: { image_input?: string[]; prompt?: string }
          }
          expect(body.model).toBe("nano-banana-pro")
          expect(body.input?.image_input).toEqual([
            "https://kie.example.com/source.png",
          ])
          expect(body.input?.prompt).toContain("reference recipe:")
          expect(body.input?.prompt).toContain('"orientation": "vertical"')
          return new Response(
            JSON.stringify({ data: { taskId: "recreate-task-1" } }),
            { status: 200 }
          )
        }
        if (href.includes("/api/v1/jobs/recordInfo")) {
          return new Response(
            JSON.stringify({
              data: {
                state: "success",
                resultJson: JSON.stringify({
                  resultUrls: ["https://example.com/recreated.png"],
                }),
              },
            }),
            { status: 200 }
          )
        }
        if (href === "https://example.com/recreated.png") {
          return new Response(new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: { "content-type": "image/png" },
          })
        }
        return new Response("unexpected fetch", { status: 500 })
      }
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/characters/workflows", {
        method: "POST",
        body: JSON.stringify({
          workflow: "recreate_reference",
          characterId: 42,
          characterName: "Maya",
          characterAttributes: { gender: "female" },
          characterImageUrl: "/api/local-assets/characters/images/source.png",
          referenceImageUrl: "/api/local-assets/assets/files/reference.png",
          referenceAnalysis: referenceAnalysisFixture,
          aspectRatio: "9:16",
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("openrouter.ai")
      )
    ).toBe(false)
    expect(uploadCount).toBe(1)
    expect(payload.imageUrl).toMatch(
      /\/api\/local-assets\/characters\/images\/\d+-recreate-task-1\.png/
    )
    expect(payload.generation).toMatchObject({
      characterId: "42",
      model: "Nano Banana Pro",
      workflow: "recreate_reference",
      status: "ready",
      imageUrl: payload.imageUrl,
    })

    const stored = await readJsonArrayStore<{ id: string; imageUrl: string }>({
      rootDir: path.join(tempRoot, "data", "characters"),
      fileName: "images.json",
      key: "generations",
    })
    expect(stored[0]).toMatchObject({
      id: "recreate-task-1",
      imageUrl: payload.imageUrl,
    })

    await deleteAssetFromAppwrite(
      path.join(
        tempRoot,
        "data",
        "characters",
        "images",
        decodeURIComponent(path.basename(payload.imageUrl))
      )
    )
  })
})

const referenceAnalysisFixture = {
  composition: { orientation: "vertical" },
  camera: { shot_type: "selfie" },
  pose: { body_orientation: "front-facing" },
  facial_expression: { eyes: "relaxed" },
  hair: { length: "long" },
  clothing: { top: { type: "tee" } },
  accessories: { jewelry: [] },
  environment: { location_type: "bedroom" },
  lighting: { main_light_source: "window" },
  recreation_notes: { must_preserve: ["pose"] },
}
