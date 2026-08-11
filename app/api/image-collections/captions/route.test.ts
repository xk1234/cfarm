import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  getGenerationModelSettings,
  readAssetBytes,
  updateImageCollectionCaptions,
} = vi.hoisted(() => ({
  getGenerationModelSettings: vi.fn(),
  readAssetBytes: vi.fn(),
  updateImageCollectionCaptions: vi.fn(),
}))

vi.mock("@/lib/asset-storage", () => ({ readAssetBytes }))
vi.mock("@/lib/generation-model-settings", () => ({
  getGenerationModelSettings,
}))
vi.mock("@/lib/image-collections", () => ({ updateImageCollectionCaptions }))

beforeEach(async () => {
  getGenerationModelSettings.mockResolvedValue({
    imageCaptioningModel: "openai/gpt-5.6-luna",
  })
  readAssetBytes.mockResolvedValue(new Uint8Array([137, 80, 78, 71]))
  updateImageCollectionCaptions.mockImplementation(async (collection) =>
    structuredClone(collection)
  )
  vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("POST /api/image-collections/captions", () => {
  it("uses the Luna default to caption every image, including images with existing captions", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input
        void init
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    fetchMock.mock.calls.length === 1
                      ? "Fresh remote caption"
                      : "Fresh local caption",
                },
              },
            ],
          }),
          { status: 200 }
        )
      }
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/image-collections/captions", {
        method: "POST",
        body: JSON.stringify({
          name: "Test collection",
          created_at: "2026-07-02T00:00:00.000Z",
          images: [
            {
              image_link: "https://images.example.com/remote.jpg",
              caption: "Existing placeholder caption",
            },
            {
              image_link: "/api/local-assets/assets/local.png",
              caption: "Existing local caption",
            },
          ],
        }),
      })
    )

    const payload = await response.json()
    const firstRequest = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string
    ) as {
      model: string
      messages: Array<{
        content: Array<{ image_url?: { url?: string } }> | string
      }>
    }
    const secondRequest = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string
    ) as {
      model: string
      messages: Array<{
        content: Array<{ image_url?: { url?: string } }> | string
      }>
    }

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(firstRequest.model).toBe("openai/gpt-5.6-luna")
    expect(secondRequest.model).toBe("openai/gpt-5.6-luna")
    expect(firstRequest.messages[0]).toEqual({
      role: "system",
      content:
        "Caption images for a slideshow image collection. Return one concise factual caption only. No markdown, no quotes, no hashtags.",
    })
    expect(firstRequest.messages[1]).toMatchObject({
      role: "user",
      content: expect.arrayContaining([
        {
          type: "text",
          text: "Write a natural one-sentence caption describing this image. Mention the main subject, setting, mood, and useful visual details in under 24 words.",
        },
      ]),
    })
    expect(extractImageUrl(firstRequest)).toBe(
      "https://images.example.com/remote.jpg"
    )
    expect(extractImageUrl(secondRequest)).toMatch(/^data:image\/png;base64,/)
    expect(
      payload.collection.images.map(
        (image: { caption: string }) => image.caption
      )
    ).toEqual(["Fresh remote caption", "Fresh local caption"])
  })

  it("starts whole-collection caption requests in parallel", async () => {
    const responses = [deferred<Response>(), deferred<Response>()]
    const fetchMock = vi.fn(
      async () => responses[fetchMock.mock.calls.length - 1].promise
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const responsePromise = POST(
      new Request("http://localhost/api/image-collections/captions", {
        method: "POST",
        body: JSON.stringify({
          name: "Parallel collection",
          created_at: "2026-07-02T00:00:00.000Z",
          images: [
            { image_link: "https://images.example.com/first.jpg", caption: "" },
            {
              image_link: "https://images.example.com/second.jpg",
              caption: "",
            },
          ],
        }),
      })
    )

    await waitFor(() => fetchMock.mock.calls.length === 2)

    responses[0].resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "First caption" } }],
        }),
        { status: 200 }
      )
    )
    responses[1].resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Second caption" } }],
        }),
        { status: 200 }
      )
    )

    const response = await responsePromise
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(
      payload.collection.images.map(
        (image: { caption: string }) => image.caption
      )
    ).toEqual(["First caption", "Second caption"])
  })

  it("can caption one requested image while preserving the rest of the collection", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input
        void init
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Fresh second caption" } }],
          }),
          { status: 200 }
        )
      }
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/image-collections/captions", {
        method: "POST",
        body: JSON.stringify({
          name: "Indexed collection",
          created_at: "2026-07-02T00:00:00.000Z",
          image_index: 1,
          images: [
            {
              image_link: "https://images.example.com/first.jpg",
              caption: "Existing first caption",
            },
            {
              image_link: "https://images.example.com/second.jpg",
              caption: "Existing second caption",
            },
            {
              image_link: "https://images.example.com/third.jpg",
              caption: "Existing third caption",
            },
          ],
        }),
      })
    )

    const payload = await response.json()
    const requestBody = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string
    ) as {
      model: string
      messages: Array<{
        content: Array<{ image_url?: { url?: string } }> | string
      }>
    }

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody.model).toBe("openai/gpt-5.6-luna")
    expect(extractImageUrl(requestBody)).toBe(
      "https://images.example.com/second.jpg"
    )
    expect(
      payload.collection.images.map(
        (image: { caption: string }) => image.caption
      )
    ).toEqual([
      "Existing first caption",
      "Fresh second caption",
      "Existing third caption",
    ])
  })
})

function extractImageUrl(request: {
  messages: Array<{ content: Array<{ image_url?: { url?: string } }> | string }>
}) {
  const userMessage = request.messages.find((message) =>
    Array.isArray(message.content)
  )
  const imagePart = Array.isArray(userMessage?.content)
    ? userMessage.content.find((part) => part.image_url)
    : undefined
  return imagePart?.image_url?.url
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (assertion()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("Condition was not met")
}
