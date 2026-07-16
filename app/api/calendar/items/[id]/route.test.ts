import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deletePostFastPostRecordById: vi.fn(),
  getPostFastPostRecord: vi.fn(),
  postfastRequest: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.postfastRequest.mockResolvedValue({})
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
