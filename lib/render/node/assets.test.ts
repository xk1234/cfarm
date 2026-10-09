import { describe, expect, it } from "vitest"

import { createMemoryRepositories } from "@/lib/data"

import { AssetLoadError } from "../engine"
import { createServerAssetLoader } from "./assets"

const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQFBT8D8IMMAYAJYYEyZlPB2MAAAAASUVORK5CYII=",
    "base64"
  )
)

async function setup() {
  const repos = createMemoryRepositories()
  await repos.blobs.put("ws-a", "media", "file-1", PNG, "image/png")
  const { value: media } = await repos.media.create("ws-a", {
    kind: "image",
    fileId: "file-1",
    mimeType: "image/png",
    sizeBytes: PNG.byteLength,
    sha256: "x",
    source: "upload",
    createdBy: "ws-a",
  })
  return { repos, media }
}

const code = async (p: Promise<unknown>) => {
  try {
    await p
    return "ok"
  } catch (err) {
    return err instanceof AssetLoadError ? err.code : String(err)
  }
}

describe("createServerAssetLoader", () => {
  it("loads owned media from blobs and refuses other workspaces", async () => {
    const { repos, media } = await setup()
    const own = createServerAssetLoader({ repositories: repos, workspaceId: "ws-a" })
    const asset = await own.load({ media: media.id })
    expect(asset.mime).toBe("image/png")
    const other = createServerAssetLoader({ repositories: repos, workspaceId: "ws-b" })
    expect(await code(other.load({ media: media.id }))).toBe("asset.fetch_failed")
    expect(await code(own.load({ media: "nope" }))).toBe("asset.fetch_failed")
  })

  it("routes URLs through the remote fetcher once per URL", async () => {
    const { repos } = await setup()
    let calls = 0
    const loader = createServerAssetLoader({
      repositories: repos,
      workspaceId: "ws-a",
      fetchUrl: async () => {
        calls++
        return { bytes: PNG, mime: "image/png" }
      },
    })
    await loader.load({ url: "https://example.com/a.png" })
    await loader.load({ url: "https://example.com/a.png" })
    expect(calls).toBe(1)
  })
})
