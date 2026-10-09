import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetMemoryRepositories, type Repositories } from "@/lib/data"
import { SOCIALBU_BASE_URL } from "@/lib/publishing/publisher"
import { createSocialBuMock, type SocialBuMock } from "@/lib/publishing/testing"
import type { ResolvedSpec } from "@/lib/render/spec"

import { DELETE as cancelPost, PATCH as reschedulePost } from "./[id]/route"
import { GET, POST } from "./route"

const WS = "vitest-user"
let repos: Repositories
let mock: SocialBuMock

beforeEach(() => {
  repos = resetMemoryRepositories()
  mock = createSocialBuMock({ baseUrl: SOCIALBU_BASE_URL })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function connectSocialBu() {
  vi.stubEnv("SOCIALBU_API_TOKEN", "test-token")
  vi.stubGlobal("fetch", mock.fetch)
}

async function seedRender() {
  const { value } = await repos.renders.create(WS, {
    spec: { canvas: { width: 1080, height: 1920 }, slides: [{}, {}] } as unknown as ResolvedSpec,
    source: "ui",
    createdBy: WS,
  })
  const slides = [0, 1].map((index) => ({
    index,
    slideId: `s${index}`,
    fileId: `${value.id}-0${index}`,
    mime: "image/png",
    sizeBytes: 3,
    width: 1080,
    height: 1920,
  }))
  for (const slide of slides) {
    await repos.blobs.put(WS, "renders", slide.fileId, new Uint8Array([1, 2, 3]), "image/png")
  }
  return repos.renders.markSucceeded(WS, value.id, { slides, coverFileId: slides[0]!.fileId })
}

function inDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/publishing/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    undefined
  )
}

describe("/api/publishing/posts", () => {
  it("returns 503 'SocialBu not connected' without a token", async () => {
    vi.stubEnv("SOCIALBU_API_TOKEN", "")
    const render = await seedRender()
    const response = await post({ renderId: render.id, accountIds: ["101"], caption: "x" })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "SocialBu not connected" })
  })

  it("validates the body", async () => {
    connectSocialBu()
    const response = await post({ renderId: "", accountIds: [] })
    expect(response.status).toBe(400)
  })

  it("publishes a render and lists its posts", async () => {
    connectSocialBu()
    const render = await seedRender()
    const response = await post({
      renderId: render.id,
      accountIds: ["101", "202"],
      caption: "Two slides",
      publishAt: inDays(2),
    })
    expect(response.status).toBe(201)
    const { posts } = (await response.json()) as { posts: Array<{ id: string; status: string; providerPostId: string }> }
    expect(posts.map((p) => [p.status, p.providerPostId])).toEqual([
      ["scheduled", "9001"],
      ["scheduled", "9002"],
    ])
    expect(mock.callsTo("POST", "/upload_media")).toHaveLength(4)

    const list = await GET(new Request(`http://localhost/api/publishing/posts?renderId=${render.id}`), undefined)
    expect(((await list.json()) as { posts: unknown[] }).posts).toHaveLength(2)

    const context = { params: Promise.resolve({ id: posts[0]!.id }) }
    const moved = await reschedulePost(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scheduledAt: inDays(3) }),
      }),
      context
    )
    expect(moved.status).toBe(200)
    const canceled = await cancelPost(new Request("http://localhost", { method: "DELETE" }), context)
    expect(((await canceled.json()) as { post: { status: string } }).post.status).toBe("canceled")
  })

  it("rejects unknown accounts and unfinished renders", async () => {
    connectSocialBu()
    const render = await seedRender()
    await expect(
      post({ renderId: render.id, accountIds: ["999"], caption: "x" }).then((r) => r.status)
    ).resolves.toBe(400)
    await repos.renders.markFailed(WS, render.id, "boom")
    const response = await post({ renderId: render.id, accountIds: ["101"], caption: "x" })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "Only finished renders can be published." })
  })
})
