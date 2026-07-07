import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-character-image-route-")
  )
  await mkdir(path.join(tempRoot, "data", "characters", "headshots"), {
    recursive: true,
  })
  await writeFile(
    path.join(tempRoot, "data", "characters", "headshots", "maya.png"),
    new Uint8Array([137, 80, 78, 71])
  )
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  vi.stubEnv("KIE_KEY", "test-kie-key")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

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

    const stored = JSON.parse(
      await readFile(
        path.join(tempRoot, "data", "characters", "images.json"),
        "utf8"
      )
    )
    expect(stored.generations).toHaveLength(1)
    expect(stored.generations[0]).toMatchObject({
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
