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
//   data/characters/images.json -> character_generations (record store)
//   the headshot fixture lives in Storage (media is Storage-only).
let tempRoot: string

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
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-character-image-route-")
  )
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  vi.stubEnv("KIE_KEY", "test-kie-key")
  await mirrorAssetToAppwrite(
    path.join(tempRoot, "data", "characters", "headshots", "maya.png"),
    new Uint8Array([137, 80, 78, 71])
  )
})

afterEach(async () => {
  await deleteAssetFromAppwrite(
    path.join(tempRoot, "data", "characters", "headshots", "maya.png")
  )
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearGenerations)

describe("POST /api/characters/image", () => {
  it("generates a character image with the selected aspect ratio and profile attachment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { downloadUrl: "https://kie.example.com/maya-reference.png" },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { taskId: "character-image-task-1" } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              successFlag: 1,
              response: {
                resultImageUrl:
                  "https://example.com/generated-character-image.png",
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/characters/image", {
        method: "POST",
        body: JSON.stringify({
          prompt: "character:\n{}\n\nfilm this in a kitchen",
          model: "Flux 2",
          aspectRatio: "4:5",
          attachments: [
            {
              kind: "character_headshot",
              label: "Maya profile picture",
              url: "/api/local-assets/characters/headshots/maya.png",
            },
          ],
        }),
      })
    )
    const payload = await response.json()
    const createRequest = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string
    ) as {
      inputImage?: string
      aspectRatio?: string
      prompt?: string
    }

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(createRequest.inputImage).toBe(
      "https://kie.example.com/maya-reference.png"
    )
    expect(createRequest.aspectRatio).toBe("4:5")
    expect(createRequest.prompt).toContain("film this in a kitchen")
    expect(payload.imageUrl).toMatch(
      /\/api\/local-assets\/characters\/images\/\d+-character-image-task-1\.png/
    )
    expect(payload.aspectRatio).toBe("4:5")
    expect(payload.generation).toMatchObject({
      prompt: "character:\n{}\n\nfilm this in a kitchen",
      model: "Flux 2",
      aspectRatio: "4:5",
      status: "ready",
      imageUrl: payload.imageUrl,
    })

    const stored = await readJsonArrayStore<{ id: string; imageUrl: string }>({
      rootDir: path.join(tempRoot, "data", "characters"),
      fileName: "images.json",
      key: "generations",
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      id: payload.generation.id,
      imageUrl: payload.imageUrl,
      status: "ready",
    })
  })

  it("uses the KIE market Nano Banana Pro endpoint for the default image model", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { downloadUrl: "https://kie.example.com/maya-reference.png" },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { taskId: "nano-character-task-1" } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              state: "success",
              resultJson: JSON.stringify({
                resultUrls: ["https://example.com/nano-character-image.png"],
              }),
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/characters/image", {
        method: "POST",
        body: JSON.stringify({
          prompt: "character:\n{}\n\nmake a candid mirror selfie",
          aspectRatio: "9:16",
          attachments: [
            {
              kind: "character_headshot",
              label: "Maya profile picture",
              url: "/api/local-assets/characters/headshots/maya.png",
            },
          ],
        }),
      })
    )
    const payload = await response.json()
    const createUrl = String(fetchMock.mock.calls[1]?.[0])
    const createRequest = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string
    ) as {
      model?: string
      input?: {
        image_input?: string[]
        aspect_ratio?: string
        prompt?: string
      }
    }

    expect(response.status).toBe(200)
    expect(createUrl).toContain("/api/v1/jobs/createTask")
    expect(createRequest.model).toBe("nano-banana-pro")
    expect(createRequest.input?.image_input).toEqual([
      "https://kie.example.com/maya-reference.png",
    ])
    expect(createRequest.input?.aspect_ratio).toBe("9:16")
    expect(createRequest.input?.prompt).toContain("mirror selfie")
    expect(payload.generation).toMatchObject({
      model: "Nano Banana Pro",
      aspectRatio: "9:16",
      status: "ready",
      imageUrl: payload.imageUrl,
    })
  })
})
