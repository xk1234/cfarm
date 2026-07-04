import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("POST /api/characters/attributes", () => {
  it("extracts normalized character attributes from an uploaded image before headshot generation", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key")
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            name: "Jade",
            age: 27,
            gender: "female",
            ethnicity: "East Asian",
            hair: {
              length: "long",
              texture: "straight",
              color: "black",
              style: "loose with face-framing layers",
            },
            eyes: {
              color: "brown",
              shape: "almond",
              details: "bright and alert",
            },
            skin: {
              tone: "light medium",
              undertone: "warm",
              texture: "smooth",
              visible_details: "natural skin texture",
            },
            clothing: {
              outfit_description: "casual creator outfit",
            },
          }),
        },
      }],
    }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/characters/attributes", {
      method: "POST",
      body: JSON.stringify({
        name: "Jade",
        sourceImageDataUrl: "data:image/png;base64,aW1hZ2U=",
      }),
    }))
    const payload = await response.json()
    const [, firstInit] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
    const requestBody = JSON.parse(firstInit.body as string) as {
      model: string
      messages: Array<{ content: string | Array<{ type: string; text?: string; image_url?: { url?: string } }> }>
    }

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody.model).toBe("google/gemini-2.5-flash")
    expect(extractImageUrl(requestBody)).toBe("data:image/png;base64,aW1hZ2U=")
    expect(payload.name).toBe("Jade")
    expect(payload.attributes.gender).toBe("female")
    expect(payload.attributes.hair.color).toBe("black")
    expect(payload.attributes.eyes.shape).toBe("almond")
  })
})

function extractImageUrl(request: { messages: Array<{ content: string | Array<{ type: string; image_url?: { url?: string } }> }> }) {
  const userMessage = request.messages.find((message) => Array.isArray(message.content))
  const imagePart = Array.isArray(userMessage?.content)
    ? userMessage.content.find((part) => part.type === "image_url")
    : undefined
  return imagePart?.image_url?.url
}
