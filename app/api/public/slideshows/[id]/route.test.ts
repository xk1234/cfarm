import JSZip from "jszip"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetMemoryRepositories, type Repositories } from "@/lib/data"
import type { ResolvedSpec } from "@/lib/render/spec"
import { createSlideshowShareToken, loadSharedSlideshow } from "@/lib/slideshow-share"

import { GET as download } from "./download/route"
import { GET as slide } from "./slides/[index]/route"

const WS = "user_owner"
const spec: ResolvedSpec = {
  version: 1,
  canvas: { width: 1080, height: 1350, background: "#000000" },
  fonts: [],
  slides: [
    { id: "s1", background: "#000000", layers: [] },
    { id: "s2", background: "#000000", layers: [] },
  ],
}

let repos: Repositories
let renderId: string

beforeEach(async () => {
  vi.stubEnv("SLIDESHOW_SHARE_SECRET", "share-secret")
  repos = resetMemoryRepositories()
  const { value } = await repos.renders.create(WS, { spec, source: "ui", createdBy: WS, title: "Kitchen tips" })
  renderId = value.id
  const slides = [0, 1].map((index) => ({
    index,
    slideId: `s${index + 1}`,
    fileId: `${renderId}-0${index + 1}`,
    mime: "image/png",
    sizeBytes: 2,
    width: 1080,
    height: 1350,
  }))
  for (const s of slides) await repos.blobs.put(WS, "renders", s.fileId, new Uint8Array([s.index, 9]), "image/png")
  await repos.renders.markSucceeded(WS, renderId, { slides, coverFileId: slides[0].fileId })
})

afterEach(() => vi.unstubAllEnvs())

const token = (outputId = renderId) =>
  createSlideshowShareToken({ ownerId: WS, outputId, expiresAt: new Date(Date.now() + 60_000) })

describe("public slideshow share", () => {
  it("resolves a share token to the render's slides", async () => {
    const shared = await loadSharedSlideshow(renderId, token(), repos)
    expect(shared).toMatchObject({ id: renderId, title: "Kitchen tips" })
    expect(shared?.slides.map((s) => s.fileId)).toEqual([`${renderId}-01`, `${renderId}-02`])
    expect(await loadSharedSlideshow(renderId, token("other"), repos)).toBeNull()
  })

  it("serves one slide and refuses bad tokens or indexes", async () => {
    const params = (index: string) => ({ params: Promise.resolve({ id: renderId, index }) })
    const ok = await slide(new Request(`https://app.test/x?token=${encodeURIComponent(token())}`), params("2"))
    expect(ok.status).toBe(200)
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([1, 9]))
    expect((await slide(new Request(`https://app.test/x?token=${encodeURIComponent(token())}`), params("3"))).status).toBe(404)
    expect((await slide(new Request("https://app.test/x?token=forged"), params("1"))).status).toBe(404)
  })

  it("zips every slide for download", async () => {
    const res = await download(new Request(`https://app.test/x?token=${encodeURIComponent(token())}`), {
      params: Promise.resolve({ id: renderId }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    const zip = await JSZip.loadAsync(await res.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(["slide-01.png", "slide-02.png"])
  })
})
