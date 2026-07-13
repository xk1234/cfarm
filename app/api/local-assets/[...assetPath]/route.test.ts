import { mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  deleteAssetFromAppwrite,
  mirrorAssetToAppwrite,
} from "@/lib/asset-storage"

// Appwrite-only: media is served from Storage (range-sliced in-memory), so the
// fixture is seeded into Storage. Run against cfarm via vitest.setup.ts.
let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtempRoot()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  await deleteAssetFromAppwrite(
    path.join(tempRoot, "data", "ugc_avatar_videos", "avatar.mp4")
  )
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("GET /api/local-assets/[...assetPath]", () => {
  it("serves video byte ranges for browser media decoding", async () => {
    await mirrorAssetToAppwrite(
      path.join(tempRoot, "data", "ugc_avatar_videos", "avatar.mp4"),
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    )

    const { GET } = await import("./route")
    const response = await GET(
      new Request("http://localhost/api/local-assets/ugc_avatar_videos/avatar.mp4", {
        headers: { Range: "bytes=2-5" },
      }),
      { params: Promise.resolve({ assetPath: ["ugc_avatar_videos", "avatar.mp4"] }) },
    )
    const body = new Uint8Array(await response.arrayBuffer())

    expect(response.status).toBe(206)
    expect(response.headers.get("Accept-Ranges")).toBe("bytes")
    expect(response.headers.get("Content-Range")).toBe("bytes 2-5/8")
    expect(response.headers.get("Content-Length")).toBe("4")
    expect(response.headers.get("Content-Type")).toBe("video/mp4")
    expect([...body]).toEqual([2, 3, 4, 5])
  })
})

async function mkdtempRoot() {
  const root = path.join(os.tmpdir(), `cfarm-local-assets-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(root, { recursive: true })
  return root
}
