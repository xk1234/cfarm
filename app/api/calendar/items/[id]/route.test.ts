import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deletePostFastPostRecordById: vi.fn(),
  getPostFastPostRecord: vi.fn(),
  postfastRequest: vi.fn(),
  reschedulePost: vi.fn(),
}))

vi.mock("@/lib/postfast-client", () => ({
  postfastRequest: mocks.postfastRequest,
}))
vi.mock("@/lib/postfast-posts", () => ({
  deletePostFastPostRecordById: mocks.deletePostFastPostRecordById,
  getPostFastPostRecord: mocks.getPostFastPostRecord,
}))
vi.mock("@/lib/postfast-route", () => ({
  postfastRouteError: (error: unknown) =>
    Response.json({ error: String(error) }, { status: 500 }),
}))
vi.mock("@/lib/publishing", () => ({
  reschedulePost: mocks.reschedulePost,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.postfastRequest.mockResolvedValue({})
  mocks.reschedulePost.mockResolvedValue({
    id: "local-1",
    status: "scheduled",
    scheduledAt: "2099-07-16T03:00:00.000Z",
  })
})

describe("PATCH /api/calendar/items/[id]", () => {
  it("reschedules a locally tracked scheduled post", async () => {
    const record = {
      id: "local-1",
      status: "scheduled",
      postfastPostId: "remote-1",
    }
    mocks.getPostFastPostRecord.mockResolvedValue(record)
    const { PATCH } = await import("./route")
    const response = await PATCH(
      new Request("http://localhost/api/calendar/items/local-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: "2099-07-16T03:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: "local-1" }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.reschedulePost).toHaveBeenCalledWith({
      record,
      scheduledFor: "2099-07-16T03:00:00.000Z",
    })
  })

  it("rejects past dates before calling the provider", async () => {
    const { PATCH } = await import("./route")
    const response = await PATCH(
      new Request("http://localhost/api/calendar/items/local-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: "2020-01-01T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: "local-1" }) }
    )

    expect(response.status).toBe(400)
    expect(mocks.getPostFastPostRecord).not.toHaveBeenCalled()
    expect(mocks.reschedulePost).not.toHaveBeenCalled()
  })

  it("does not reschedule unmatched remote posts without a local snapshot", async () => {
    const { PATCH } = await import("./route")
    const response = await PATCH(
      new Request("http://localhost/api/calendar/items/postfast%3Aremote-2", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: "2099-07-16T03:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: "postfast:remote-2" }) }
    )

    expect(response.status).toBe(409)
    expect(mocks.getPostFastPostRecord).not.toHaveBeenCalled()
    expect(mocks.reschedulePost).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/calendar/items/[id]", () => {
  it("deletes a scheduled PostFast post and its matching local record", async () => {
    mocks.getPostFastPostRecord.mockResolvedValue({
      id: "local-1",
      postfastPostId: "remote-1",
    })
    const { DELETE } = await import("./route")
    const response = await DELETE(
      new Request("http://localhost/api/calendar/items/local-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "local-1" }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.postfastRequest).toHaveBeenCalledWith(
      "/social-posts/remote-1",
      { method: "DELETE" }
    )
    expect(mocks.deletePostFastPostRecordById).toHaveBeenCalledWith("local-1")
  })

  it("can cancel an unmatched remote PostFast calendar item", async () => {
    const { DELETE } = await import("./route")
    const response = await DELETE(
      new Request("http://localhost/api/calendar/items/postfast%3Aremote-2", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "postfast:remote-2" }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.getPostFastPostRecord).not.toHaveBeenCalled()
    expect(mocks.postfastRequest).toHaveBeenCalledWith(
      "/social-posts/remote-2",
      { method: "DELETE" }
    )
  })
})
