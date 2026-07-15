import { describe, expect, it, vi } from "vitest"

import {
  generateSlideshowText,
  outputDevelopsHookSubject,
  slideshowTextGenerationPayload,
} from "@/lib/slideshow-text-generation"
import type { TempSlideTestingAutomation } from "@/lib/temp-slide-testing"

const automation: TempSlideTestingAutomation = {
  id: "astrology-informational",
  name: "Astrology Informational",
  theme: "astrology",
  hooks: ["why geminis need room to change"],
  tone: "Educational & Informative",
  style: "all lowercase",
  imageCollectionIds: { hook: "", content: "", cta: "" },
  slides: [
    {
      id: "hook-1",
      index: 0,
      section: "hook",
      title: "Hook",
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: true,
      displayText: true,
      collectionId: "",
      textItems: [],
    },
    {
      id: "content-2",
      index: 1,
      section: "content",
      title: "Content",
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: true,
      displayText: true,
      collectionId: "",
      textItems: [
        {
          id: "content-2__heading",
          itemId: "heading",
          section: "content",
          slideId: "content-2",
          label: "Heading",
          contentDirection: "a heading about the hook",
          wordLengthMin: 3,
          wordLengthMax: 8,
          textMode: "prompt",
          staticText: "",
          font: "TikTok Display Medium",
          fontSize: "12px",
          textStyle: "whiteText",
          textPosition: "center",
          textItemWidth: "80%",
          textAlign: "left",
          textAnchor: "flush",
          textVerticalAnchor: "padded",
        },
      ],
    },
  ],
}

const validContent = JSON.stringify({
  title: "gemini growth guide",
  caption: "change helps geminis keep learning.",
  hashtags: ["#gemini", "#astrology", "#growth"],
  text: { "content-2__heading": "change keeps geminis curious" },
})

function response(
  content: string,
  finishReason = "stop",
  annotations?: unknown[],
  webSearchRequests = 0
) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: finishReason,
          native_finish_reason: finishReason,
          message: { content, annotations },
        },
      ],
      usage: {
        server_tool_use: { web_search_requests: webSearchRequests },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

describe("slideshow text structured output", () => {
  it("requires schema-capable routing and response healing", () => {
    const payload = slideshowTextGenerationPayload({ automation })

    expect(payload.response_format.json_schema.strict).toBe(true)
    expect(payload.provider).toEqual({ require_parameters: true })
    expect(payload.plugins).toEqual([{ id: "response-healing" }])
    expect(payload.stream).toBe(false)
    expect(payload.max_tokens).toBeGreaterThanOrEqual(2_048)
    const hashtagsSchema =
      payload.response_format.json_schema.schema.properties.hashtags
    expect(hashtagsSchema).toMatchObject({ type: "array" })
    expect(hashtagsSchema).not.toHaveProperty("minItems")
    expect(hashtagsSchema).not.toHaveProperty("maxItems")
  })

  it("only grants model-controlled web search when the automation enables it", () => {
    const disabled = slideshowTextGenerationPayload({ automation })
    const enabled = slideshowTextGenerationPayload({
      automation,
      webSearchEnabled: true,
    })

    expect("tools" in disabled).toBe(false)
    expect(enabled.tools).toEqual([
      {
        type: "openrouter:web_search",
        parameters: {
          engine: "auto",
          max_results: 3,
          max_total_results: 6,
          search_context_size: "medium",
        },
      },
    ])
    expect(enabled.tool_choice).toBe("required")
  })

  it("rejects grounded body text that ignores the distinctive hook subject", () => {
    expect(
      outputDevelopsHookSubject(
        {
          text: {
            heading: "1. prices dipped",
            body: "hdb resale prices fell 0.1 percent in q1 2026",
          },
        },
        "what will actually happen to prime and plus hdbs"
      )
    ).toBe(false)
    expect(
      outputDevelopsHookSubject(
        {
          text: {
            heading: "1. longer occupation period",
            body: "prime and plus flats have a ten-year minimum occupation period",
          },
        },
        "what will actually happen to prime and plus hdbs"
      )
    ).toBe(true)
  })

  it("keeps web search citations with the generation result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      response(
        "Current fact [Current data](https://example.com/current-data)",
        "stop",
        [
          {
            type: "url_citation",
            url_citation: {
              url: "https://example.com/current-data",
              title: "Current data",
              content: "Latest published figure",
            },
          },
        ],
        1
      )
    )
    fetchImpl.mockResolvedValueOnce(response(validContent))

    const result = await generateSlideshowText({
      automation,
      apiKey: "test-key",
      fetchImpl,
      webSearchEnabled: true,
    })

    expect(result.webSearchSources).toEqual([
      {
        url: "https://example.com/current-data",
        title: "Current data",
        content: "Latest published figure",
      },
    ])
  })

  it("retries when enabled web search returns no sources", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response("No sourced research"))
      .mockResolvedValueOnce(
        response(
          "Sourced fact [Current data](https://example.com/current-data)",
          "stop",
          [
            {
              type: "url_citation",
              url_citation: {
                url: "https://example.com/current-data",
                title: "Current data",
              },
            },
          ],
          1
        )
      )
      .mockResolvedValueOnce(response(validContent))

    await expect(
      generateSlideshowText({
        automation,
        apiKey: "test-key",
        fetchImpl,
        webSearchEnabled: true,
      })
    ).resolves.toMatchObject({
      webSearchSources: [{ url: "https://example.com/current-data" }],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("retries a malformed structured completion instead of returning a 500", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('{"title":"unterminated'))
      .mockResolvedValueOnce(response(validContent))

    const result = await generateSlideshowText({
      automation,
      apiKey: "test-key",
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.result.text["content-2__heading"]).toBe(
      "change keeps geminis curious"
    )
  })

  it("accepts the generated hashtag count without enforcing 3-5", async () => {
    const oneHashtag = JSON.stringify({
      ...JSON.parse(validContent),
      hashtags: ["#astrology"],
    })
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(oneHashtag))

    await expect(
      generateSlideshowText({ automation, apiKey: "test-key", fetchImpl })
    ).resolves.toMatchObject({
      result: { hashtags: "#astrology" },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("retries a transient provider failure before failing the slideshow run", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Provider returned error" } }),
          {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(response(validContent))

    await expect(
      generateSlideshowText({ automation, apiKey: "test-key", fetchImpl })
    ).resolves.toMatchObject({
      skippedOpenRouter: false,
      model: "z-ai/glm-5.2",
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)).model).toBe(
      "z-ai/glm-5.2"
    )
  })

  it("keeps the provider status and message when both attempts fail", async () => {
    const providerFailure = () =>
      new Response(
        JSON.stringify({ error: { message: "Provider returned error" } }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      )
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerFailure())
      .mockResolvedValueOnce(providerFailure())

    await expect(
      generateSlideshowText({ automation, apiKey: "test-key", fetchImpl })
    ).rejects.toThrow(
      "OpenRouter generation failed (502): Provider returned error"
    )
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("retries a completion that ended because of its output limit", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('{"title":"partial"}', "length"))
      .mockResolvedValueOnce(response(validContent))

    await expect(
      generateSlideshowText({ automation, apiKey: "test-key", fetchImpl })
    ).resolves.toMatchObject({ skippedOpenRouter: false })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("retries with field-specific feedback when content violates constraints", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            title: "",
            caption: "change helps geminis keep learning.",
            hashtags: ["#gemini", "#astrology", "#growth"],
            text: { "content-2__heading": "too short" },
          })
        )
      )
      .mockResolvedValueOnce(response(validContent))

    await generateSlideshowText({ automation, apiKey: "test-key", fetchImpl })

    const retryBody = JSON.parse(
      String(fetchImpl.mock.calls[1]?.[1]?.body)
    ) as { messages: { content: string }[] }
    expect(retryBody.messages.at(-1)?.content).toContain(
      "title must not be empty"
    )
    expect(retryBody.messages.at(-1)?.content).toContain(
      "content-2__heading must contain 3-8 words"
    )
  })
})
