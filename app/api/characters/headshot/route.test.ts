import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-headshot-route-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  vi.stubEnv("KIE_KEY", "test-kie-key")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("POST /api/characters/headshot", () => {
  it("uses uploaded character images as references instead of saving them as the headshot", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { downloadUrl: "https://kie.example.com/source-headshot.png" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { taskId: "flux-task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          successFlag: 1,
          response: { resultImageUrl: "https://example.com/generated-headshot.png" },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }))
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/characters/headshot", {
      method: "POST",
      body: JSON.stringify({
        name: "Maya",
        attributes: { name: "Maya", gender: "female", age: 28, hair: { color: "black" } },
        customPrompt: "warm UGC creator headshot",
        sourceImageDataUrl: "data:image/png;base64,aW1hZ2U=",
      }),
    }))
    const payload = await response.json()
    const uploadRequest = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      base64Data: string
      uploadPath: string
    }
    const createRequest = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      inputImage?: string
    }

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://kieai.redpandaai.co/api/file-base64-upload")
    expect(uploadRequest.base64Data).toBe("data:image/png;base64,aW1hZ2U=")
    expect(uploadRequest.uploadPath).toBe("images/realfarm/characters")
    expect(createRequest.inputImage).toBe("https://kie.example.com/source-headshot.png")
    expect(payload.preview_url).toMatch(/\/api\/local-assets\/characters\/headshots\/\d+-flux-task-1\.png/)
    expect(payload.preview_url).not.toContain("source-headshot")
    expect(payload.prompt).toContain("Use the uploaded character image only as a visual reference")
  })

  it("returns upstream failure messages from failed Flux tasks", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { taskId: "flux-task-2" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          successFlag: 3,
          errorMessage: "Server exception, please try again later or contact customer service",
        },
      }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/characters/headshot", {
      method: "POST",
      body: JSON.stringify({
        name: "Maya",
        attributes: { name: "Maya", gender: "female", age: 28 },
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe("Server exception, please try again later or contact customer service")
  })
})
