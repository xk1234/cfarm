import { mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `cfarm-image-import-route-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(tempRoot, { recursive: true })
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
    headers: { "Content-Type": "image/webp" },
  })))
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("POST /api/image-collections/import", () => {
  it("imports remote image URLs into a persisted collection", async () => {
    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/image-collections/import", {
      method: "POST",
      body: JSON.stringify({
        collectionName: "Tumblr import",
        images: [{ url: "https://64.media.tumblr.com/sample.webp" }],
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.imported).toBe(1)
    expect(payload.collection.name).toBe("Tumblr import")
    expect(payload.collection.images[0].image_link).toMatch(/^\/api\/local-assets\/image-collections\/files\/.+\.webp$/)
  })
})
