import { beforeEach, describe, expect, it } from "vitest"

import { resetMemoryRepositories, type Repositories } from "@/lib/data"
import type { ResolvedSpec } from "@/lib/render/spec"

import { DELETE, PATCH } from "./items/[id]/route"
import { GET } from "./route"

// vitest.setup.ts signs everyone in as workspace "vitest-user".
const WS = "vitest-user"
const spec: ResolvedSpec = {
  version: 1,
  canvas: { width: 1080, height: 1350, background: "#000000" },
  fonts: [],
  slides: [{ id: "s1", background: "#000000", layers: [] }],
}

let repos: Repositories
beforeEach(() => {
  repos = resetMemoryRepositories()
})

const future = () => new Date(Date.now() + 3 * 24 * 3600 * 1000)

async function seed() {
  const { value: render } = await repos.renders.create(WS, { spec, source: "ui", createdBy: WS, title: "Kitchen tips" })
  await repos.renders.markSucceeded(WS, render.id, {
    slides: [{ index: 0, slideId: "s1", fileId: `${render.id}-01`, mime: "image/png", sizeBytes: 1, width: 1080, height: 1350 }],
    coverFileId: `${render.id}-01`,
  })
  const at = future()
  const { value: post } = await repos.posts.upsertIntent(WS, {
    renderId: render.id,
    provider: "tiktok",
    accountId: "42",
    caption: "Three kitchen tips",
    publishAt: at.toISOString(),
    intentKey: `${render.id}:42`,
    createdBy: WS,
  })
  await repos.jobs.enqueue({ workspaceId: WS, type: "render-slideshow", payload: { renderId: "r-queued" } })
  return { render, post, at }
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe("GET /api/calendar", () => {
  it("lists the workspace's scheduled posts and queued renders", async () => {
    const { render, post, at } = await seed()
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const to = new Date(at.getTime() + 24 * 3600 * 1000).toISOString()
    const res = await GET(new Request(`http://localhost/api/calendar?from=${from}&to=${to}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    const postItem = body.items.find((item: { id: string }) => item.id === `post:${post.id}`)
    expect(postItem).toMatchObject({
      status: "scheduled",
      sourceId: render.id,
      excerpt: "Three kitchen tips",
      previewUrl: `/api/files/renders/${render.id}-01`,
      targets: [{ integrationId: "42", provider: "tiktok", status: "scheduled" }],
    })
    expect(body.items.some((item: { status: string }) => item.status === "generating")).toBe(true)
  })

  it("rejects invalid ranges", async () => {
    expect((await GET(new Request("http://localhost/api/calendar?from=nope"))).status).toBe(400)
  })
})

describe("/api/calendar/items/[id]", () => {
  it("reschedules and cancels a locally scheduled post", async () => {
    const { post } = await seed()
    const later = new Date(future().getTime() + 3600_000).toISOString()
    const patched = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scheduledAt: later }) }),
      ctx(`post:${post.id}`)
    )
    expect(patched.status).toBe(200)
    expect((await repos.posts.get(WS, post.id))?.publishAt).toBe(later)

    const removed = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx(post.id))
    expect(removed.status).toBe(200)
    expect((await repos.posts.get(WS, post.id))?.status).toBe("canceled")
  })

  it("refuses posts already handed to SocialBu", async () => {
    const { post } = await seed()
    await repos.posts.update(WS, post.id, { providerPostId: "sb-1" })
    expect((await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx(post.id))).status).toBe(409)
  })

  it("returns 404 for other workspaces' posts", async () => {
    const { value: foreign } = await repos.posts.upsertIntent("user_other", {
      renderId: "r",
      provider: "tiktok",
      accountId: "1",
      caption: "",
      publishAt: future().toISOString(),
      intentKey: "x",
      createdBy: "user_other",
    })
    expect((await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx(foreign.id))).status).toBe(404)
  })
})
