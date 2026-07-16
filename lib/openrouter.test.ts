import { describe, expect, it, vi } from "vitest"

import {
  openRouterJson,
  parseOpenRouterContent,
} from "@/lib/openrouter"

describe("parseOpenRouterContent", () => {
  it("trims string content", () => {
    expect(parseOpenRouterContent("  response text  ")).toBe(
      "response text"
    )
  })

  it("flattens text content parts and bare string parts", () => {
    expect(
      parseOpenRouterContent([
        { type: "text", text: "{\"hooks\":[" },
        "\"one\"",
        { type: "image_url", image_url: "ignored" },
        { type: "text", text: "]}" },
      ])
    ).toBe('{"hooks":["one"]}')
  })

  it("preserves object content as JSON text", () => {
    expect(parseOpenRouterContent({ hooks: ["one"] })).toBe(
      '{"hooks":["one"]}'
    )
  })
})

describe("openRouterJson", () => {
  it("builds a schema request and parses the outermost fenced object", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          choices: [
            {
              message: {
                content: '```json\nResult: {"value":1}\n```',
              },
            },
          ],
        })
    )

    await expect(
      openRouterJson({
        apiKey: "test-key",
        model: "test-model",
        system: "system prompt",
        user: "user prompt",
        fetchImpl: fetchMock as typeof fetch,
        schema: {
          name: "test_schema",
          strict: true,
          schema: { type: "object" },
        },
        timeoutMs: 90_000,
        maxTokens: 2_800,
        temperature: 0.8,
        plugins: [{ id: "response-healing" }],
      })
    ).resolves.toEqual({ value: 1 })

    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>
    expect(request).toMatchObject({
      model: "test-model",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "test_schema",
          strict: true,
          schema: { type: "object" },
        },
      },
      max_tokens: 2_800,
      temperature: 0.8,
      plugins: [{ id: "response-healing" }],
    })
  })

  it("uses json_object with caller-supplied messages", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          choices: [{ message: { content: '{"ok":true}' } }],
        })
    )

    await openRouterJson({
      apiKey: "test-key",
      model: "test-model",
      messages: [{ role: "user", content: "prompt" }],
      fetchImpl: fetchMock as typeof fetch,
    })

    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>
    expect(request).toMatchObject({
      messages: [{ role: "user", content: "prompt" }],
      response_format: { type: "json_object" },
    })
  })

  it("keeps HTTP errors separate from invalid JSON errors", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { message: "provider unavailable" } },
        { status: 503 }
      )
    ) as typeof fetch

    await expect(
      openRouterJson({
        apiKey: "test-key",
        model: "test-model",
        messages: [],
        fetchImpl,
      })
    ).rejects.toThrow("provider unavailable")
  })

  it("throws the shared invalid JSON error for malformed content", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "not json" } }] })
    ) as typeof fetch

    await expect(
      openRouterJson({
        apiKey: "test-key",
        model: "test-model",
        messages: [],
        fetchImpl,
      })
    ).rejects.toThrow("The model returned invalid JSON")
  })
})
