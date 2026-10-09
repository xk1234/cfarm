import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetMemoryRepositories, type Repositories } from "@/lib/data"
import { postbackUrl } from "@/lib/publishing/postback"

import { POST } from "./route"

let repos: Repositories

beforeEach(() => {
  repos = resetMemoryRepositories()
  vi.stubEnv("SOCIALBU_POSTBACK_SECRET", "postback-secret")
  vi.stubEnv("BASE_URL", "https://app.lumenclip.test")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function call(url: string) {
  return POST(
    new Request(url, {
      method: "POST",
      body: JSON.stringify({ post_id: 1, account_id: 2, status: "published" }),
    })
  )
}

describe("/api/publishing/postback", () => {
  it("rejects unsigned or tampered postbacks", async () => {
    expect((await call("https://app.lumenclip.test/api/publishing/postback?w=u1&p=p1")).status).toBe(403)
    const signed = postbackUrl("u1", "p1")!
    expect((await call(signed.replace("p=p1", "p=p2"))).status).toBe(403)
    expect((await repos.jobs.listForWorkspace("u1")).items).toEqual([])
  })

  it("queues a status sync for a signed postback", async () => {
    const signed = postbackUrl("u1", "p1")!
    const response = await call(signed)
    expect(response.status).toBe(200)
    expect((await repos.jobs.listForWorkspace("u1")).items).toEqual([
      expect.objectContaining({ type: "publish-post", payload: { postId: "p1" } }),
    ])
  })

  it("only builds postback URLs for a public https origin with a secret", () => {
    expect(postbackUrl("u1", "p1", { BASE_URL: "http://localhost:3000", SOCIALBU_POSTBACK_SECRET: "s" })).toBeUndefined()
    expect(postbackUrl("u1", "p1", { BASE_URL: "https://x.test" })).toBeUndefined()
  })
})
