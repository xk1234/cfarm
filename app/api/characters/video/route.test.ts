import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  deleteAssetFromAppwrite,
  mirrorAssetToAppwrite,
} from "@/lib/asset-storage"

// Appwrite-only: the source image lives in Storage (media is Storage-only).
// Run against cfarm via vitest.setup.ts.
let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-character-video-route-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  vi.stubEnv("KIE_KEY", "test-kie-key")
  await mirrorAssetToAppwrite(
    path.join(tempRoot, "data", "characters", "images", "maya.png"),
    new Uint8Array([137, 80, 78, 71])
  )
})

afterEach(async () => {
  await deleteAssetFromAppwrite(
    path.join(tempRoot, "data", "characters", "images", "maya.png")
  )
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("POST /api/characters/video", () => {
  it("generates a character video from a selected generated image", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { downloadUrl: "https://kie.example.com/maya-input.png" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { taskId: "character-video-task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          state: "success",
          resultJson: JSON.stringify({ resultUrls: ["https://example.com/generated-character-video.mp4"] }),
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }))
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/characters/video", {
      method: "POST",
      body: JSON.stringify({
        imageUrl: "/api/local-assets/characters/images/maya.png",
        prompt: "Maya waves at the camera in a bright apartment.",
        model: "Kling 2.6 Image to Video",
        duration: "5",
        sound: false,
      }),
    }))
    const payload = await response.json()
    const createRequest = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      model?: string
      input?: {
        image_urls?: string[]
        prompt?: string
        duration?: string
      }
    }

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(createRequest.model).toBe("kling-2.6/image-to-video")
    expect(createRequest.input?.image_urls).toEqual(["https://kie.example.com/maya-input.png"])
    expect(createRequest.input?.prompt).toContain("Maya waves")
    expect(payload.videoUrl).toMatch(/\/api\/local-assets\/characters\/videos\/\d+-character-video-task-1\.mp4/)
    expect(payload.taskId).toBe("character-video-task-1")
  })
})
