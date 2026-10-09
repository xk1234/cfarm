import { beforeEach, describe, expect, it } from "vitest"

import { createFileToken, createMemoryRepositories, type Repositories } from "@/lib/data"

import { serveFile } from "./serve"

// vitest.setup.ts mocks the Clerk session as workspace "vitest-user".
const WS = "vitest-user"
const OTHER = "user_other"
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

let repos: Repositories
beforeEach(async () => {
  repos = createMemoryRepositories()
  await repos.blobs.put(WS, "renders", "r1-01", PNG, "image/png")
  await repos.blobs.put(OTHER, "media", "m1", PNG, "image/png")
})

const req = (path: string, headers: Record<string, string> = {}) => new Request(`https://app.test${path}`, { headers })
const exp = () => Math.floor(Date.now() / 1000) + 60

describe("serveFile", () => {
  it("serves the session owner's file inline with private caching", async () => {
    const res = await serveFile(req("/api/files/renders/r1-01"), "renders", "r1-01", repos)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("cache-control")).toMatch(/^private/)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
  })

  it("hides other workspaces' files and unknown buckets behind 404", async () => {
    expect((await serveFile(req("/api/files/media/m1"), "media", "m1", repos)).status).toBe(404)
    expect((await serveFile(req("/api/files/slideshows/x"), "slideshows", "x", repos)).status).toBe(404)
  })

  it("accepts a valid signed token for exactly that file", async () => {
    const token = createFileToken({ workspaceId: OTHER, bucket: "media", fileId: "m1", expiresAt: exp(), download: true })
    const ok = await serveFile(req(`/api/files/media/m1?t=${token}`), "media", "m1", repos)
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-disposition")).toMatch(/^attachment/)
    expect((await serveFile(req(`/api/files/renders/r1-01?t=${token}`), "renders", "r1-01", repos)).status).toBe(404)
    const expired = createFileToken({ workspaceId: OTHER, bucket: "media", fileId: "m1", expiresAt: 1 })
    expect((await serveFile(req(`/api/files/media/m1?t=${expired}`), "media", "m1", repos)).status).toBe(404)
    expect((await serveFile(req(`/api/files/media/m1?t=${token}x`), "media", "m1", repos)).status).toBe(404)
  })

  it("accepts workspace API keys with the bucket's read scope", async () => {
    const { plaintext } = await repos.apiKeys.create(OTHER, { name: "k", scopes: ["media:read"], createdBy: OTHER })
    const res = await serveFile(req("/api/files/media/m1", { authorization: `Bearer ${plaintext}` }), "media", "m1", repos)
    expect(res.status).toBe(200)
    const { plaintext: noScope } = await repos.apiKeys.create(OTHER, { name: "k2", scopes: ["renders:read"], createdBy: OTHER })
    expect((await serveFile(req("/api/files/media/m1", { authorization: `Bearer ${noScope}` }), "media", "m1", repos)).status).toBe(404)
  })
})
