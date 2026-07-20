import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
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
import { writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only: the store maps `data/assets/assets.json` -> the `assets` table.
// Tests use the real data root and run against cfarm (forced by
// vitest.setup.ts). Media bytes live in project-level Storage buckets (shared,
// not per-database), so these tests assert record persistence, not raw bytes.
const rootDir = path.join(process.cwd(), "data", "assets")
const TABLE = "assets"

const clearAssets = () => clearTestTables(TABLE)

beforeEach(clearAssets)
afterAll(clearAssets)

describe("asset records", () => {
  it("exports canonical asset option lists and parsers", () => {
    expect(assetKinds).toEqual(["image", "video", "audio", "text"])
    expect(assetScopes).toEqual(["ugc_ad", "ugc_demo", "greenscreen", "global"])
    expect(assetCategories).toEqual([
      "outfit",
      "accessory",
      "background",
      "product",
      "reference",
      "sound",
      "other",
    ])
    expect(parseAssetKind(" video ")).toBe("video")
    expect(parseAssetScope("ugc_demo")).toBe("ugc_demo")
    expect(parseAssetCategory("sound")).toBe("sound")
    expect(parseAssetKind("movie")).toBeUndefined()
    expect(parseAssetScope("bad")).toBeUndefined()
    expect(parseAssetCategory("bad")).toBeUndefined()
  })

  it("persists an uploaded image asset record", async () => {
    const asset = await createUploadedAssetRecord({
      rootDir,
      fileName: "Product Shot.PNG",
      mimeType: "image/png",
      bytes: Buffer.from("image-bytes"),
      scope: "ugc_ad",
      category: "product",
      name: "Product Shot",
    })

    expect(asset).toMatchObject<Partial<AssetRecord>>({
      kind: "image",
      source: "upload",
      status: "ready",
      scope: "ugc_ad",
      category: "product",
      name: "Product Shot",
      caption: "Uploaded image asset: Product Shot.",
      mimeType: "image/png",
    })
    expect(asset.fileUrl).toMatch(/^\/api\/local-assets\/assets\/files\//)

    const listed = await listAssetRecords({
      rootDir,
      scope: "ugc_ad",
      category: "product",
    })
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(asset.id)
  })

  it("persists uploaded demo videos in their own scope", async () => {
    const asset = await createUploadedAssetRecord({
      rootDir,
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
    expect(
      await listAssetRecords({ rootDir, scope: "ugc_demo", kind: "video" })
    ).toHaveLength(1)
    expect(
      await listAssetRecords({ rootDir, scope: "ugc_ad", kind: "video" })
    ).toHaveLength(0)
  })

  it("creates a generated placeholder asset with prompt and model metadata", async () => {
    const asset = await createGeneratedAssetRecord({
      rootDir,
      kind: "image",
      scope: "ugc_ad",
      category: "background",
      name: "Studio background",
      prompt: "warm studio wall",
      model: "GPT Image 2",
    })

    expect(asset).toMatchObject<Partial<AssetRecord>>({
      kind: "image",
      source: "ai_generated",
      status: "ready",
      scope: "ugc_ad",
      category: "background",
      name: "Studio background",
      prompt: "warm studio wall",
      model: "GPT Image 2",
      caption: "AI-generated image asset from prompt: warm studio wall.",
      mimeType: "image/svg+xml",
    })
    expect(asset.fileName).toMatch(/\.svg$/)

    const listed = await listAssetRecords({ rootDir, scope: "ugc_ad" })
    expect(listed.map((item) => item.id)).toEqual([asset.id])
  })

  it("normalizes remote asset metadata media URLs to local file references", async () => {
    await writeJsonArrayStore({
      rootDir,
      fileName: "assets.json",
      key: "assets",
      records: [
        {
          id: "background-1",
          kind: "image",
          source: "upload",
          status: "ready",
          scope: "ugc_ad",
          category: "background",
          name: "Background",
          caption: "A background.",
          fileUrl: "/api/local-assets/backgrounds/reddit-travel/background.jpg",
          thumbnailUrl:
            "/api/local-assets/backgrounds/reddit-travel/background.jpg",
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
    })

    const [asset] = await listAssetRecords({ rootDir })

    expect(asset.metadata).toEqual({
      originalImageUrl:
        "/api/local-assets/backgrounds/reddit-travel/background.jpg",
      sourceImageUrl:
        "/api/local-assets/backgrounds/reddit-travel/background.jpg",
    })
  })
})
