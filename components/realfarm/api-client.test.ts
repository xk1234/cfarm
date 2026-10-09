import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ApiClientError,
  apiRoutes,
  createRender,
  getPublisherStatus,
  getRender,
  listRenders,
  setApiFetchForTesting,
} from "./api-client"

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

afterEach(() => setApiFetchForTesting(null))

describe("api-client", () => {
  it("treats a missing publishing route as SocialBu not connected", async () => {
    setApiFetchForTesting(async () => json(404, { error: "Not found" }))
    await expect(getPublisherStatus()).resolves.toEqual({
      configured: false,
      message: "SocialBu not connected",
    })
  })

  it("passes through the publisher status", async () => {
    const fetchMock = vi.fn(async () => json(200, { configured: true, provider: "socialbu" }))
    setApiFetchForTesting(fetchMock)
    await expect(getPublisherStatus()).resolves.toEqual({ configured: true, provider: "socialbu" })
    expect(fetchMock).toHaveBeenCalledWith(apiRoutes.publishingStatus, expect.anything())
  })

  it("surfaces 422 spec issues on ApiClientError", async () => {
    const errors = [{ code: "slot.required", path: "/slotValues/hook", message: "Slot \"hook\" (text) is required." }]
    setApiFetchForTesting(async () => json(422, { ok: false, errors, warnings: [] }))
    const error = await createRender({ templateId: "tpl" }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error.status).toBe(422)
    expect(error.issues).toEqual(errors)
    expect(error.message).toBe(errors[0].message)
  })

  it("posts render requests as JSON", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(202, { id: "rnd_1", status: "queued", slides: [], warnings: [], createdAt: "2026-10-09T00:00:00Z" })
    )
    setApiFetchForTesting(fetchMock)
    const result = await createRender({ templateId: "tpl", wait: true })
    expect(result.status).toBe("queued")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(apiRoutes.renders)
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({ templateId: "tpl", wait: true })
  })

  it("normalizes renders and render pages", async () => {
    setApiFetchForTesting(async (url) =>
      url.startsWith(apiRoutes.render("rnd_1"))
        ? json(200, {
            id: "rnd_1",
            status: "succeeded",
            createdAt: "2026-10-09T00:00:00Z",
            slides: [
              { index: 1, id: "b", url: "/b", width: 1, height: 1 },
              { index: 0, id: "a", url: "/a", width: 1, height: 1 },
            ],
          })
        : json(200, { renders: [{ id: "rnd_1", status: "succeeded", createdAt: "x" }] })
    )
    const render = await getRender("rnd_1")
    expect(render.slides.map((slide) => slide.id)).toEqual(["a", "b"])
    expect(render.warnings).toEqual([])
    const page = await listRenders()
    expect(page).toEqual({ items: [{ id: "rnd_1", status: "succeeded", createdAt: "x" }], nextCursor: null })
  })
})
