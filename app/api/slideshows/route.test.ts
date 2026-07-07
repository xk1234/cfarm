import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-slideshows-route-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  await writeLocalAsset("focus.jpg", "focus image")
  await writeLocalAsset("a.jpg", "video image")
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("/api/slideshows", () => {
  it("creates and lists persisted slideshow output records", async () => {
    const { POST, GET } = await import("./route")
    const createResponse = await POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          automationId: "automation-1",
          runId: "automation-run-1",
          title: "Prompt output",
          caption: "Generated caption",
          hashtags: "#focus #study",
          prompt: "make a slideshow about focus",
          image_collection: "collection-focus",
          slideshow_type: "educational",
          settings: { duration: 4, transition_style: "hard" },
          images: [
            {
              image_url: "/api/local-assets/image-collections/files/focus.jpg",
              aspect_ratio: "9:16",
              time_length_ms: 4000,
              textItems: [
                { text: "focus wins", textPosition: { x: 50, y: 20 } },
              ],
            },
          ],
        }),
      })
    )
    const createPayload = await createResponse.json()
    const resultsDb = JSON.parse(
      await readFile(
        path.join(tempRoot, "data", "results", "results.json"),
        "utf8"
      )
    )

    const listResponse = await GET(
      new Request("http://localhost/api/slideshows")
    )
    const listPayload = await listResponse.json()

    expect(createResponse.status).toBe(201)
    expect(createPayload.slideshow).toMatchObject({
      automationId: "automation-1",
      title: "Prompt output",
      caption: "Generated caption",
      hashtags: "#focus #study",
      prompt: "make a slideshow about focus",
      image_collection: "collection-focus",
      settings: { duration: 4, transition_style: "hard" },
    })
    expect(createPayload.result).toMatchObject({
      id: "result-automation-run-1",
      automationId: "automation-1",
      runId: "automation-run-1",
      workflowType: "slideshow",
      artifacts: {
        slideshowId: createPayload.slideshow.id,
      },
    })
    expect(resultsDb.results).toHaveLength(1)
    expect(listResponse.status).toBe(200)
    expect(listPayload.slideshowsCount).toBe(1)
    expect(listPayload.videosCount).toBe(0)
    expect(listPayload.slideshows).toHaveLength(1)
    expect(listPayload.slideshows[0].images[0]).toMatchObject({
      image_url: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/slide-001\.png$/
      ),
      source_image_url: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/source-001\.jpg$/
      ),
      textItems: [{ text: "focus wins", textPosition: { x: 50, y: 20 } }],
    })
    expect(listPayload.slideshows[0].output_images).toEqual([
      listPayload.slideshows[0].images[0].image_url,
    ])
  })

  it("counts exported slideshow videos from video render settings", async () => {
    const { POST, GET } = await import("./route")
    await POST(
      new Request("http://localhost/api/slideshows", {
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
          video_url: "/api/local-assets/assets/files/video-render.webm",
          thumbnail_url:
            "/api/local-assets/assets/files/video-render-thumbnail.jpg",
          images: [
            { image_url: "/api/local-assets/image-collections/files/a.jpg" },
          ],
        }),
      })
    )

    const listResponse = await GET(
      new Request("http://localhost/api/slideshows")
    )
    const listPayload = await listResponse.json()

    expect(listPayload.videosCount).toBe(1)
    expect(listPayload.slideshows[0].settings).toMatchObject({
      export_as_video: true,
      transition_style: "fade",
      sound_id: "sound-1",
    })
    expect(listPayload.slideshows[0].video_url).toBe(
      "/api/local-assets/assets/files/video-render.webm"
    )
    expect(listPayload.slideshows[0].thumbnail_url).toBe(
      "/api/local-assets/assets/files/video-render-thumbnail.jpg"
    )
  })

  it("normalizes legacy draft payloads to exported slideshow results", async () => {
    const { POST, GET } = await import("./route")
    await POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          title: "Automation run result",
          status: "draft",
          slideshow_type: "automation",
          images: [
            { image_url: "/api/local-assets/image-collections/files/a.jpg" },
          ],
        }),
      })
    )
    await POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          title: "Prompt output",
          status: "draft",
          slideshow_type: "educational",
          images: [
            { image_url: "/api/local-assets/image-collections/files/a.jpg" },
          ],
        }),
      })
    )
    await POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          title: "Failed slideshow",
          status: "failed",
          slideshow_type: "educational",
          images: [
            { image_url: "/api/local-assets/image-collections/files/a.jpg" },
          ],
        }),
      })
    )

    const listResponse = await GET(
      new Request("http://localhost/api/slideshows")
    )
    const listPayload = await listResponse.json()

    expect(listPayload.slideshowsCount).toBe(3)
    expect(
      listPayload.slideshows.map(
        (slideshow: { title: string }) => slideshow.title
      )
    ).toEqual(["Failed slideshow", "Prompt output", "Automation run result"])
    expect(
      listPayload.slideshows.map(
        (slideshow: { status: string }) => slideshow.status
      )
    ).toEqual(["failed", "exported", "exported"])
  })
})

async function writeLocalAsset(fileName: string, value: string) {
  const dir = path.join(tempRoot, "data", "image-collections", "files")
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, fileName), value)
}
