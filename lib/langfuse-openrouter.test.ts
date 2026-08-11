import { beforeEach, describe, expect, it, vi } from "vitest"

const tracing = vi.hoisted(() => ({
  propagated: [] as Array<Record<string, unknown>>,
  observations: [] as Array<{ name: string; options: unknown }>,
  updates: [] as Array<Record<string, unknown>>,
}))

vi.mock("@langfuse/tracing", () => ({
  propagateAttributes: vi.fn(
    (attributes: Record<string, unknown>, callback: () => unknown) => {
      tracing.propagated.push(attributes)
      return callback()
    }
  ),
  startActiveObservation: vi.fn(
    (
      name: string,
      callback: (observation: {
        update: (attributes: Record<string, unknown>) => void
      }) => unknown,
      options: unknown
    ) => {
      tracing.observations.push({ name, options })
      return callback({
        update: (attributes) => tracing.updates.push(attributes),
      })
    }
  ),
}))

import {
  openRouterOperationName,
  tracedOpenRouterFetch,
} from "@/lib/langfuse-openrouter"

describe("Langfuse OpenRouter tracing", () => {
  beforeEach(() => {
    tracing.propagated.length = 0
    tracing.observations.length = 0
    tracing.updates.length = 0
  })

  it("records a named generation with identity, tokens, and cost", async () => {
    const rawBase64 = "QUJD".repeat(200)
    const body = JSON.stringify({
      model: "openai/test-model",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Write a concise caption" },
            { type: "image", data: rawBase64 },
          ],
        },
      ],
      temperature: 0.4,
      max_tokens: 120,
      response_format: {
        type: "json_schema",
        json_schema: { name: "compose_platform_variants" },
      },
    })
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const sent = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(sent).toMatchObject({
          usage: { include: true },
          messages: [
            {
              content: [
                { type: "text", text: "Write a concise caption" },
                { type: "image", data: rawBase64 },
              ],
            },
          ],
        })
        return Response.json({
          id: "response-1",
          choices: [{ message: { role: "assistant", content: "Done" } }],
          usage: {
            prompt_tokens: 21,
            completion_tokens: 5,
            total_tokens: 26,
            prompt_tokens_details: { cached_tokens: 3 },
            cost: 0.0012,
          },
        })
      }
    ) as typeof fetch

    await tracedOpenRouterFetch(
      openRouterOperationName(body),
      "https://openrouter.ai/api/v1/chat/completions",
      { method: "POST", body },
      {
        feature: "compose-repurpose",
        userId: "user-1",
        sessionId: "run-1",
        prompt: {
          name: "lumenclip/compose-repurpose",
          version: 7,
          isFallback: false,
        },
        metadata: { route: "compose", attempt: 2 },
        fetchImpl,
      }
    )

    expect(tracing.observations).toEqual([
      {
        name: "generate-compose-platform-variants",
        options: { asType: "generation" },
      },
    ])
    expect(tracing.propagated[0]).toMatchObject({
      traceName: "generate-compose-platform-variants",
      userId: "user-1",
      sessionId: "run-1",
      tags: ["app:lumenclip", "feature:compose-repurpose"],
      metadata: {
        app: "lumenclip",
        provider: "openrouter",
        route: "compose",
        attempt: "2",
      },
    })
    expect(tracing.updates[0]).toMatchObject({
      model: "openai/test-model",
      modelParameters: { temperature: 0.4, maxTokens: 120 },
      prompt: {
        name: "lumenclip/compose-repurpose",
        version: 7,
        isFallback: false,
      },
    })
    expect(JSON.stringify(tracing.updates[0])).not.toContain(rawBase64)
    expect(JSON.stringify(tracing.updates[0])).toContain("[MEDIA OMITTED]")
    expect(tracing.updates[1]).toMatchObject({
      usageDetails: {
        prompt_tokens: 21,
        completion_tokens: 5,
        total_tokens: 26,
        prompt_tokens_details: { cached_tokens: 3 },
      },
      costDetails: { totalCost: 0.0012 },
      metadata: { httpStatus: 200, responseId: "response-1" },
    })
  })

  it("uses a stable fallback name when no schema name is available", () => {
    expect(openRouterOperationName(JSON.stringify({ model: "test" }))).toBe(
      "generate-content"
    )
    expect(openRouterOperationName("not-json", "generate-slides")).toBe(
      "generate-slides"
    )
  })
})
