import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createMemoryRepositories, type Repositories } from "@/lib/data"
import { createUploadedAssetRecord, deleteAssetRecordsForUrls, listAssetRecords } from "@/lib/assets"
import { RemoteFetchError, fetchRemoteMedia } from "@/lib/files/remote-fetch"
import {
  deleteImageCollections,
  importRemoteImagesToCollection,
  listImageCollections,
  restoreImageCollections,
  upsertImageCollection,
} from "@/lib/image-collections"

const WS = "user_alice"
const OTHER = "user_bob"
const allowAll = async () => undefined

let repos: Repositories
let red: Uint8Array
let blue: Uint8Array

async function png(color: string) {
  return new Uint8Array(
    await sharp({ create: { width: 4, height: 3, channels: 3, background: color } }).png().toBuffer()
  )
}

function fakeFetch(files: Record<string, { bytes: Uint8Array; type: string }>) {
  return vi.fn(async (url: string | URL | Request) => {
    const key = String(url)
    const file = files[key]
    if (!file) return new Response("missing", { status: 404 })
    return new Response(file.bytes.slice().buffer as ArrayBuffer, { headers: { "content-type": file.type } })
  }) as unknown as typeof fetch
}

beforeEach(async () => {
  repos = createMemoryRepositories()
  red = await png("#ff0000")
  blue = await png("#0000ff")
})

describe("image collections on repositories", () => {
  it("imports remote images once, stores them privately and scopes them to the workspace", async () => {
    const fetchImpl = fakeFetch({
      "https://i.pinimg.com/a.png": { bytes: red, type: "image/png" },
      "https://images.pexels.com/b.png": { bytes: blue, type: "image/png" },
      "https://i.pinimg.com/dup.png": { bytes: red, type: "image/png" },
    })
    const result = await importRemoteImagesToCollection(
      WS,
      {
        collectionName: "Bedrooms",
        images: [
          { url: "https://i.pinimg.com/a.png", caption: "Red" },
          { url: "https://images.pexels.com/b.png" },
          { url: "https://i.pinimg.com/dup.png" },
        ],
      },
      { repos, fetchImpl, assertUrl: allowAll }
    )
    expect(result.imported).toBe(2)
    expect(result.collection.images).toHaveLength(2)
    expect(result.collection.images[0].image_link).toMatch(/^\/api\/files\/media\//)
    const [first] = await repos.media.getMany(WS, [result.collection.images[0].media_id!])
    expect(first).toMatchObject({ source: "pinterest", width: 4, height: 3, caption: "Red", mimeType: "image/png" })
    expect((await repos.blobs.get(WS, "media", first.fileId))?.bytes).toEqual(red)

    expect(await listImageCollections(OTHER, { repos })).toEqual([])
    const listed = await listImageCollections(WS, { repos })
    expect(listed.map((c) => c.name)).toEqual(["Bedrooms"])
  })

  it("rejects non-image responses and private addresses", async () => {
    const fetchImpl = fakeFetch({ "https://evil.test/x": { bytes: new Uint8Array([1]), type: "text/html" } })
    await expect(
      importRemoteImagesToCollection(WS, { collectionName: "X", images: [{ url: "https://evil.test/x" }] }, { repos, fetchImpl, assertUrl: allowAll })
    ).rejects.toThrow(/not an image/)
    await expect(fetchRemoteMedia("http://127.0.0.1/secret.png")).rejects.toBeInstanceOf(RemoteFetchError)
    await expect(fetchRemoteMedia("file:///etc/passwd")).rejects.toBeInstanceOf(RemoteFetchError)
  })

  it("caps remote downloads while streaming", async () => {
    const big = new Uint8Array(2048)
    const fetchImpl = fakeFetch({ "https://cdn.test/big.png": { bytes: big, type: "image/png" } })
    await expect(
      fetchRemoteMedia("https://cdn.test/big.png", { maxBytes: 1024, fetchImpl, assertUrl: allowAll })
    ).rejects.toThrow(/larger than/)
  })

  it("saves a collection from stored links, reorders it and drops removed items", async () => {
    const a = await createUploadedAssetRecord(WS, { fileName: "a.png", bytes: red }, { repos })
    const b = await createUploadedAssetRecord(WS, { fileName: "b.png", bytes: blue }, { repos })
    const saved = await upsertImageCollection(
      WS,
      { name: "Picks", created_at: "", pinned: true, images: [{ image_link: a.fileUrl!, caption: "" }, { image_link: b.fileUrl!, caption: "" }] },
      { repos }
    )
    expect(saved.pinned).toBe(true)
    expect(saved.images.map((i) => i.image_link)).toEqual([a.fileUrl, b.fileUrl])

    const reordered = await upsertImageCollection(
      WS,
      { name: "Picks", created_at: "", pinned: true, images: [{ image_link: b.fileUrl!, caption: "" }] },
      { repos }
    )
    expect(reordered.images.map((i) => i.image_link)).toEqual([b.fileUrl])
    expect((await repos.collections.getByName(WS, "Picks"))?.itemCount).toBe(1)

    // Another workspace cannot pull these files into its collections.
    const foreign = await upsertImageCollection(
      OTHER,
      { name: "Stolen", created_at: "", images: [{ image_link: a.fileUrl!, caption: "" }] },
      { repos }
    )
    expect(foreign.images).toEqual([])
  })

  it("soft-deletes and restores collections by name", async () => {
    await upsertImageCollection(WS, { name: "Temp", created_at: "", images: [] }, { repos })
    const deleted = await deleteImageCollections(WS, [{ name: "Temp", created_at: "" }], { repos })
    expect(deleted.deleted).toBe(1)
    expect(deleted.deletedUntil).toBeTruthy()
    expect(await listImageCollections(WS, { repos })).toEqual([])
    expect((await listImageCollections(WS, { repos, includeDeleted: true }))[0].deletedAt).toBeTruthy()
    expect(await restoreImageCollections(WS, [{ name: "Temp", created_at: "" }], { repos })).toEqual({ restored: 1 })
    expect((await listImageCollections(WS, { repos })).map((c) => c.name)).toEqual(["Temp"])
  })
})

describe("uploads library", () => {
  it("ingests uploads once, sniffs the real format and lists them as assets", async () => {
    const first = await createUploadedAssetRecord(WS, { fileName: "photo.jpg", mimeType: "image/jpeg", bytes: red }, { repos })
    expect(first).toMatchObject({ kind: "image", mimeType: "image/png", name: "photo", width: 4, height: 3 })
    const again = await createUploadedAssetRecord(WS, { fileName: "copy.png", bytes: red }, { repos })
    expect(again.id).toBe(first.id)
    expect((await listAssetRecords(WS, {}, { repos })).map((a) => a.id)).toEqual([first.id])
    expect(await listAssetRecords(WS, { kind: "audio" }, { repos })).toEqual([])
    expect(await listAssetRecords(OTHER, {}, { repos })).toEqual([])

    await expect(
      createUploadedAssetRecord(WS, { fileName: "x.svg", mimeType: "image/svg+xml", bytes: new TextEncoder().encode("<svg/>") }, { repos })
    ).rejects.toThrow()

    expect(await deleteAssetRecordsForUrls(WS, { urls: [first.fileUrl!] }, { repos })).toEqual({ deleted: 1, deletedFiles: 0 })
    expect(await listAssetRecords(WS, {}, { repos })).toEqual([])
  })
})
