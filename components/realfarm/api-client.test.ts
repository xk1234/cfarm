import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ApiClientError,
  apiRoutes,
  createApiKey,
  createRender,
  getPublisherStatus,
  getReminderSettings,
  listApiKeys,
  saveReminderSettings,
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
      json(202, {
        render: { id: "rnd_1", status: "queued", slides: [], warnings: [], createdAt: "2026-10-09T00:00:00Z" },
        jobId: "job_1",
      })
    )
    setApiFetchForTesting(fetchMock)
    const result = await createRender({ templateId: "tpl", wait: true })
    expect(result.id).toBe("rnd_1")
    expect(result.status).toBe("queued")
    expect(result.jobId).toBe("job_1")
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
        : json(200, {
            renders: [
              {
                id: "rnd_1",
                status: "succeeded",
                createdAt: "x",
                slides: [
                  { index: 1, id: "b", url: "/b", width: 1, height: 1 },
                  { index: 0, id: "a", url: "/a", width: 1, height: 1 },
                ],
              },
            ],
          })
    )
    const render = await getRender("rnd_1")
    expect(render.slides.map((slide) => slide.id)).toEqual(["a", "b"])
    expect(render.warnings).toEqual([])
    const page = await listRenders()
    expect(page).toEqual({
      items: [{ id: "rnd_1", status: "succeeded", createdAt: "x", coverUrl: "/a" }],
      nextCursor: null,
    })
  })

  it("unwraps a completed render from the 201 { render } body", async () => {
    setApiFetchForTesting(async () =>
      json(201, {
        render: {
          id: "rnd_2",
          status: "succeeded",
          createdAt: "2026-10-09T00:00:00Z",
          slides: [
            { index: 1, id: "b", url: "/b", width: 1, height: 1 },
            { index: 0, id: "a", url: "/a", width: 1, height: 1 },
          ],
        },
      })
    )
    const result = await createRender({ templateId: "tpl" })
    expect(result.id).toBe("rnd_2")
    expect(result.jobId).toBeNull()
    expect(result.slides.map((slide) => slide.id)).toEqual(["a", "b"])
  })

  it("reads API keys in the settings route's { apiKeys } and { apiKey, secret } shapes", async () => {
    const view = { id: "key_1", name: "CI", prefix: "lc_abcd", scopes: ["renders:read"] }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json(201, { apiKey: view, secret: "lc_secret" })
        : json(200, { apiKeys: [view], scopes: ["renders:read"] })
    )
    setApiFetchForTesting(fetchMock)
    await expect(listApiKeys()).resolves.toEqual([view])
    const created = await createApiKey({ name: "CI", scopes: ["renders:read"] })
    expect(created.key.name).toBe("CI")
    expect(created.secret).toBe("lc_secret")
  })

  it("maps reminder settings to and from the route's { settings } shape", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? json(200, { settings: { channel: "none", leadMinutes: [30] } })
        : json(200, { settings: { channel: "none", leadMinutes: [120] }, eventMetadata: {} })
    )
    setApiFetchForTesting(fetchMock)
    await expect(getReminderSettings()).resolves.toEqual({ enabled: false, leadMinutes: [120] })
    await expect(saveReminderSettings({ enabled: false, leadMinutes: [30] })).resolves.toEqual({
      enabled: false,
      leadMinutes: [30],
    })
    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse(String(init?.body))).toEqual({ channel: "none", leadMinutes: [30] })
  })
})
