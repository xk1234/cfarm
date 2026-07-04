import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-slideshows-route-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("/api/slideshows", () => {
  it("creates and lists persisted slideshow render records", async () => {
    const { POST, GET } = await import("./route")
    const createResponse = await POST(new Request("http://localhost/api/slideshows", {
      method: "POST",
      body: JSON.stringify({
        title: "Prompt draft",
        prompt: "make a slideshow about focus",
        image_collection: "collection-focus",
        slideshow_type: "educational",
        settings: { duration: 4, transition_style: "hard" },
        images: [
          {
            image_url: "/api/local-assets/image-collections/files/focus.jpg",
            aspect_ratio: "9:16",
            time_length_ms: 4000,
            textItems: [{ text: "focus wins", textPosition: { x: 50, y: 20 } }],
          },
        ],
      }),
    }))
    const createPayload = await createResponse.json()

    const listResponse = await GET(new Request("http://localhost/api/slideshows"))
    const listPayload = await listResponse.json()

    expect(createResponse.status).toBe(201)
    expect(createPayload.slideshow).toMatchObject({
      title: "Prompt draft",
      prompt: "make a slideshow about focus",
      image_collection: "collection-focus",
      settings: { duration: 4, transition_style: "hard" },
    })
    expect(listResponse.status).toBe(200)
    expect(listPayload.slideshowsCount).toBe(1)
    expect(listPayload.videosCount).toBe(0)
    expect(listPayload.slideshows).toHaveLength(1)
    expect(listPayload.slideshows[0].images[0]).toMatchObject({
      image_url: "/api/local-assets/image-collections/files/focus.jpg",
      textItems: [{ text: "focus wins", textPosition: { x: 50, y: 20 } }],
    })
  })

  it("counts exported slideshow videos from video render settings", async () => {
    const { POST, GET } = await import("./route")
    await POST(new Request("http://localhost/api/slideshows", {
      method: "POST",
      body: JSON.stringify({
        title: "Video render",
        settings: {
          duration: 3,
          transition_style: "fade",
          export_as_video: true,
          sound_id: "sound-1",
          sound_name: "Selected sound",
          sound_url: "/api/local-assets/music/files/selected.mp3",
        },
        images: [{ image_url: "/api/local-assets/image-collections/files/a.jpg" }],
      }),
    }))

    const listResponse = await GET(new Request("http://localhost/api/slideshows"))
    const listPayload = await listResponse.json()

    expect(listPayload.videosCount).toBe(1)
    expect(listPayload.slideshows[0].settings).toMatchObject({
      export_as_video: true,
      transition_style: "fade",
      sound_id: "sound-1",
    })
  })
})
