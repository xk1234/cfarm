import { ChatPromptClient, type PromptManager } from "@langfuse/client"
import { describe, expect, it, vi } from "vitest"

import {
  lumenclipChatPromptsEqual,
  LUMENCLIP_PROMPT_DEFINITIONS,
  normalizeLumenclipChatPrompt,
} from "@/lib/langfuse-prompt-catalog"
import {
  compileLumenclipPromptFallback,
  getLumenclipChatPrompt,
  LANGFUSE_PROMPT_CACHE_TTL_SECONDS,
  LANGFUSE_PROMPT_LABEL,
} from "@/lib/langfuse-prompts"

describe("LumenClip Langfuse prompts", () => {
  it("inventories every prompt as a namespaced chat prompt", () => {
    const definitions = Object.values(LUMENCLIP_PROMPT_DEFINITIONS)

    expect(definitions).toHaveLength(21)
    expect(definitions.every((definition) => definition.type === "chat")).toBe(
      true
    )
    expect(
      definitions.every((definition) =>
        definition.name.startsWith("lumenclip/")
      )
    ).toBe(true)
    for (const definition of definitions) {
      const placeholders = [
        ...new Set(
          definition.prompt.flatMap((message) =>
            [...message.content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(
              (match) => match[1]
            )
          )
        ),
      ].sort()
      expect(placeholders).toEqual([...definition.variables].sort())
    }
  })

  it("compiles every remote production prompt exactly like its fallback", async () => {
    const get = vi.fn(async (name: string, options: unknown) => {
      const definition = Object.values(LUMENCLIP_PROMPT_DEFINITIONS).find(
        (candidate) => candidate.name === name
      )
      if (!definition) throw new Error("unknown prompt")
      expect(options).toMatchObject({
        type: "chat",
        label: LANGFUSE_PROMPT_LABEL,
        cacheTtlSeconds: LANGFUSE_PROMPT_CACHE_TTL_SECONDS,
        fallback: definition.prompt,
      })
      return chatPromptClient(definition, false)
    })
    const promptManager = { get } as unknown as Pick<PromptManager, "get">

    for (const [key, definition] of Object.entries(
      LUMENCLIP_PROMPT_DEFINITIONS
    )) {
      const variables = Object.fromEntries(
        definition.variables.map((variable) => [
          variable,
          `<${variable}> & \"quoted\"`,
        ])
      )
      const remote = await getLumenclipChatPrompt(
        key as keyof typeof LUMENCLIP_PROMPT_DEFINITIONS,
        variables,
        { promptManager, credentialsAvailable: true }
      )
      const fallback = compileLumenclipPromptFallback(
        key as keyof typeof LUMENCLIP_PROMPT_DEFINITIONS,
        variables
      )

      expect(remote.messages).toEqual(fallback.messages)
      expect(remote.prompt).toMatchObject({
        name: definition.name,
        version: 42,
        isFallback: false,
      })
    }
  })

  it("returns the exact local fallback when prompt retrieval is unavailable", async () => {
    const promptManager = {
      get: vi.fn(async () => {
        throw new Error("Langfuse unavailable")
      }),
    } as unknown as Pick<PromptManager, "get">
    const variables = {
      limits: "x: 280 characters",
      source_material: "SOURCE 1: exact fallback",
    }

    const result = await getLumenclipChatPrompt(
      "composeRepurpose",
      variables,
      { promptManager, credentialsAvailable: true }
    )

    expect(result.messages).toEqual(
      compileLumenclipPromptFallback("composeRepurpose", variables).messages
    )
    expect(result.prompt).toMatchObject({
      name: "lumenclip/compose-repurpose",
      version: 0,
      isFallback: true,
    })
  })

  it("normalizes Langfuse chatmessage metadata for idempotent migration checks", () => {
    const definition = LUMENCLIP_PROMPT_DEFINITIONS.composeRepurpose
    const remote = definition.prompt.map((message) => ({
      type: "chatmessage",
      ...message,
    }))

    expect(normalizeLumenclipChatPrompt(remote)).toEqual(definition.prompt)
    expect(lumenclipChatPromptsEqual(remote, definition.prompt)).toBe(true)
    expect(
      lumenclipChatPromptsEqual(
        remote.map((message, index) =>
          index === 1 ? { ...message, content: "changed" } : message
        ),
        definition.prompt
      )
    ).toBe(false)
    expect(
      normalizeLumenclipChatPrompt([
        { type: "placeholder", name: "unsupported-placeholder" },
      ])
    ).toBeNull()
  })
})

function chatPromptClient(
  definition: (typeof LUMENCLIP_PROMPT_DEFINITIONS)[keyof typeof LUMENCLIP_PROMPT_DEFINITIONS],
  isFallback: boolean
) {
  return new ChatPromptClient(
    {
      name: definition.name,
      type: "chat",
      version: 42,
      prompt: definition.prompt.map((message) => ({ ...message })),
      labels: ["production"],
      tags: [],
      config: {},
    },
    isFallback
  )
}
