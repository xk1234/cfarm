import { describe, expect, it } from "vitest"

import { filterOpenRouterTextStructuredModels } from "@/lib/openrouter-models"

describe("OpenRouter model filtering", () => {
  it("keeps text-output models that support structured JSON output", () => {
    const models = filterOpenRouterTextStructuredModels([
      model({
        id: "qwen/qwen3.7-plus",
        name: "Qwen: Qwen3.7 Plus",
        input: ["text", "image"],
        output: ["text"],
        params: ["response_format", "structured_outputs"],
      }),
      model({
        id: "google/image-model",
        name: "Image model",
        input: ["text"],
        output: ["text", "image"],
        params: ["response_format"],
      }),
      model({
        id: "plain/text",
        name: "Plain text",
        input: ["text"],
        output: ["text"],
        params: ["temperature"],
      }),
    ])

    expect(models).toEqual([
      expect.objectContaining({
        id: "qwen/qwen3.7-plus",
        name: "Qwen: Qwen3.7 Plus",
        supportsResponseFormat: true,
        supportsStructuredOutputs: true,
      }),
    ])
  })

  it("sorts featured model ids first", () => {
    const models = filterOpenRouterTextStructuredModels([
      model({
        id: "z-later/model",
        name: "Later",
        input: ["text"],
        output: ["text"],
        params: ["response_format"],
      }),
      model({
        id: "anthropic/claude-sonnet-4.5",
        name: "Anthropic: Claude Sonnet 4.5",
        input: ["text"],
        output: ["text"],
        params: ["response_format"],
      }),
    ])

    expect(models.map((item) => item.id)).toEqual([
      "anthropic/claude-sonnet-4.5",
      "z-later/model",
    ])
  })

  it("features Kimi 2.7 and DeepSeek V4 instead of latest alias placeholders", () => {
    const source = [
      "moonshotai/kimi-k2.7",
      "deepseek/deepseek-v4",
      "~google/gemini-flash-latest",
      "~openai/gpt-mini-latest",
    ].map((id) =>
      model({
        id,
        name: id,
        input: ["text"],
        output: ["text"],
        params: ["response_format"],
      })
    )

    const models = filterOpenRouterTextStructuredModels(source)

    expect(models.map((item) => item.id)).toEqual([
      "deepseek/deepseek-v4",
      "moonshotai/kimi-k2.7",
      "~google/gemini-flash-latest",
      "~openai/gpt-mini-latest",
    ])
  })

  it("limits the shortlist to 10 models and max 2 per provider", () => {
    const models = filterOpenRouterTextStructuredModels([
      ...Array.from({ length: 5 }, (_, index) =>
        model({
          id: `anthropic/model-${index}`,
          name: `Anthropic ${index}`,
          input: ["text"],
          output: ["text"],
          params: ["response_format"],
        })
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        model({
          id: `provider-${index}/model`,
          name: `Provider ${index}`,
          input: ["text"],
          output: ["text"],
          params: ["response_format"],
        })
      ),
    ])

    expect(models).toHaveLength(10)
    expect(
      models.filter((item) => item.id.startsWith("anthropic/"))
    ).toHaveLength(2)
  })
})

function model(input: {
  id: string
  name: string
  input: string[]
  output: string[]
  params: string[]
}) {
  return {
    id: input.id,
    name: input.name,
    context_length: 100000,
    architecture: {
      input_modalities: input.input,
      output_modalities: input.output,
    },
    pricing: {
      prompt: "0.1",
      completion: "0.2",
    },
    supported_parameters: input.params,
  }
}
