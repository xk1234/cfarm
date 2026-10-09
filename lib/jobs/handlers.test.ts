import { describe, expect, it } from "vitest"

import { createMemoryRepositories, type Job } from "@/lib/data"
import { getJobHandler, PermanentJobError, registeredJobTypes } from "@/lib/jobs/handlers"
import { NotConfiguredPublisher } from "@/lib/publishing/publisher"

function job<T extends Job["type"]>(type: T, workspaceId: string | null, payload: Job<T>["payload"]): Job<T> {
  return {
    id: "j1",
    workspaceId,
    type,
    status: "running",
    payload,
    result: null,
    error: null,
    attempt: 1,
    maxAttempts: 5,
    runAt: "2026-10-09T12:00:00.000Z",
    leaseExpiresAt: null,
    workerId: "w1",
    completedAt: null,
    createdAt: "2026-10-09T12:00:00.000Z",
    updatedAt: "2026-10-09T12:00:00.000Z",
  }
}

describe("job handlers", () => {
  it("registers render-slideshow, publish-post and notify", () => {
    expect(registeredJobTypes().sort()).toEqual(["notify", "publish-post", "render-slideshow"])
    for (const type of registeredJobTypes()) expect(getJobHandler(type)).toBeTypeOf("function")
  })

  it("treats a missing post as done and a system notify job as permanent failure", async () => {
    const repos = createMemoryRepositories()
    const context = { workerId: "w1", repos, publisher: new NotConfiguredPublisher() }
    await expect(
      getJobHandler("publish-post")!(job("publish-post", "u1", { postId: "nope" }), context)
    ).resolves.toEqual({ postId: "nope", status: "missing" })
    await expect(
      getJobHandler("notify")!(job("notify", null, { notificationId: "n1" }), context)
    ).rejects.toBeInstanceOf(PermanentJobError)
    await expect(
      getJobHandler("notify")!(job("notify", "u1", { notificationId: "n1" }), context)
    ).resolves.toEqual({ status: "missing" })
  })

  it("retries a pending submission while SocialBu is not connected", async () => {
    const repos = createMemoryRepositories()
    const { value: post } = await repos.posts.upsertIntent("u1", {
      renderId: "r1",
      provider: "tiktok",
      accountId: "101",
      status: "publishing",
      caption: "c",
      intentKey: "k",
      createdBy: "u1",
    })
    await expect(
      getJobHandler("publish-post")!(job("publish-post", "u1", { postId: post.id }), {
        workerId: "w1",
        repos,
        publisher: new NotConfiguredPublisher(),
      })
    ).rejects.toThrow("SocialBu not connected")
    expect((await repos.posts.get("u1", post.id))!.error).toBe("SocialBu not connected")
  })
})
