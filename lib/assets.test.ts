import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  assetCategories,
  assetKinds,
  assetScopes,
  createGeneratedAssetRecord,
  createUploadedAssetRecord,
  listAssetRecords,
  parseAssetCategory,
  parseAssetKind,
  parseAssetScope,
  type AssetRecord,
} from "@/lib/assets"

let assetRoot: string

beforeEach(async () => {
  assetRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-assets-"))
})

afterEach(async () => {
  await rm(assetRoot, { recursive: true, force: true })
})

describe("asset records", () => {
  it("exports canonical asset option lists and parsers", () => {
    expect(assetKinds).toEqual(["image", "video", "audio", "text"])
    expect(assetScopes).toEqual(["ugc_avatar", "ugc_ad", "ugc_demo", "greenscreen", "global"])
    expect(assetCategories).toEqual(["outfit", "accessory", "background", "product", "reference", "sound", "other"])
    expect(parseAssetKind(" video ")).toBe("video")
    expect(parseAssetScope("ugc_demo")).toBe("ugc_demo")
    expect(parseAssetCategory("sound")).toBe("sound")
    expect(parseAssetKind("movie")).toBeUndefined()
    expect(parseAssetScope("bad")).toBeUndefined()
    expect(parseAssetCategory("bad")).toBeUndefined()
  })

  it("stores uploaded file bytes and metadata under the asset root", async () => {
    const asset = await createUploadedAssetRecord({
      rootDir: assetRoot,
      fileName: "Product Shot.PNG",
      mimeType: "image/png",
      bytes: Buffer.from("image-bytes"),
      scope: "ugc_avatar",
      category: "product",
      name: "Product Shot",
    })

    expect(asset).toMatchObject<Partial<AssetRecord>>({
      kind: "image",
      source: "upload",
      status: "ready",
      scope: "ugc_avatar",
      category: "product",
      name: "Product Shot",
      caption: "Uploaded image asset: Product Shot.",
      mimeType: "image/png",
    })
    expect(asset.fileUrl).toMatch(/^\/api\/local-assets\/assets\/files\//)

    const storedBytes = await readFile(path.join(assetRoot, "files", asset.fileName!))
    expect(storedBytes.toString()).toBe("image-bytes")

    const listed = await listAssetRecords({ rootDir: assetRoot, scope: "ugc_avatar", category: "product" })
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(asset.id)
  })

  it("stores uploaded demo videos in their own folder and scope", async () => {
    const asset = await createUploadedAssetRecord({
      rootDir: assetRoot,
      fileName: "Founder Demo.mp4",
      mimeType: "video/mp4",
      bytes: Buffer.from("video-bytes"),
      scope: "ugc_demo",
      category: "other",
    })

    expect(asset).toMatchObject<Partial<AssetRecord>>({
      kind: "video",
      scope: "ugc_demo",
      name: "Founder Demo",
      caption: "Uploaded video asset: Founder Demo.",
      mimeType: "video/mp4",
    })
    expect(asset.fileUrl).toMatch(/^\/api\/local-assets\/assets\/demos\//)

    const storedBytes = await readFile(path.join(assetRoot, "demos", asset.fileName!))
    expect(storedBytes.toString()).toBe("video-bytes")
    expect(await listAssetRecords({ rootDir: assetRoot, scope: "ugc_demo", kind: "video" })).toHaveLength(1)
    expect(await listAssetRecords({ rootDir: assetRoot, scope: "ugc_ad", kind: "video" })).toHaveLength(0)
  })

  it("creates a generated placeholder asset with prompt and model metadata", async () => {
    const asset = await createGeneratedAssetRecord({
      rootDir: assetRoot,
      kind: "image",
      scope: "ugc_avatar",
      category: "background",
      name: "Studio background",
      prompt: "warm studio wall",
      model: "GPT Image 2",
    })

    expect(asset).toMatchObject<Partial<AssetRecord>>({
      kind: "image",
      source: "ai_generated",
      status: "ready",
      scope: "ugc_avatar",
      category: "background",
      name: "Studio background",
      prompt: "warm studio wall",
      model: "GPT Image 2",
      caption: "AI-generated image asset from prompt: warm studio wall.",
      mimeType: "image/svg+xml",
    })
    expect(asset.fileName).toMatch(/\.svg$/)

    const listed = await listAssetRecords({ rootDir: assetRoot, scope: "ugc_avatar" })
    expect(listed.map((item) => item.id)).toEqual([asset.id])
  })

  it("normalizes remote asset metadata media URLs to local file references", async () => {
    await mkdir(assetRoot, { recursive: true })
    await writeFile(path.join(assetRoot, "assets.json"), `${JSON.stringify({
      assets: [
        {
          id: "background-1",
          kind: "image",
          source: "upload",
          status: "ready",
          scope: "ugc_avatar",
          category: "background",
          name: "Background",
          caption: "A background.",
          fileUrl: "/api/local-assets/backgrounds/reddit-travel/background.jpg",
          thumbnailUrl: "/api/local-assets/backgrounds/reddit-travel/background.jpg",
          createdAt: "2026-07-03T00:00:00.000Z",
          updatedAt: "2026-07-03T00:00:00.000Z",
          metadata: {
            originalImageUrl: "https://preview.redd.it/background.jpg",
            sourceImageUrl: "https://i.pinimg.com/background.jpg",
            sourceUrl: "https://reddit.com/r/travel/comments/abc/place/",
            redditPermalink: "https://reddit.com/r/travel/comments/abc/place/",
          },
        },
      ],
    }, null, 2)}\n`)

    const [asset] = await listAssetRecords({ rootDir: assetRoot })

    expect(asset.metadata).toEqual({
      originalImageUrl: "/api/local-assets/backgrounds/reddit-travel/background.jpg",
      sourceImageUrl: "/api/local-assets/backgrounds/reddit-travel/background.jpg",
    })
  })
})
