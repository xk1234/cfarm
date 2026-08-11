import {
  ChatPromptClient,
  LangfuseClient,
  type PromptManager,
} from "@langfuse/client"

import {
  LUMENCLIP_PROMPT_DEFINITIONS,
  type LumenclipChatMessage,
  type LumenclipPromptKey,
} from "@/lib/langfuse-prompt-catalog"

export const LANGFUSE_PROMPT_LABEL = "production"
export const LANGFUSE_PROMPT_CACHE_TTL_SECONDS = 300

export type LumenclipPromptLink = {
  name: string
  version: number
  isFallback: boolean
}

type PromptGetter = Pick<PromptManager, "get">

let client: LangfuseClient | undefined

export async function getLumenclipChatPrompt(
  key: LumenclipPromptKey,
  variables: Record<string, string>,
  options: {
    promptManager?: PromptGetter
    credentialsAvailable?: boolean
  } = {}
): Promise<{
  messages: LumenclipChatMessage[]
  prompt: LumenclipPromptLink
}> {
  const definition = LUMENCLIP_PROMPT_DEFINITIONS[key]
  const fallbackMessages = definition.prompt.map((message) => ({ ...message }))
  const promptManager = options.promptManager ?? defaultPromptManager()
  const credentialsAvailable =
    options.credentialsAvailable ?? hasLangfuseCredentials()

  if (!promptManager || !credentialsAvailable) {
    return localFallback(key, variables)
  }

  try {
    const prompt = await promptManager.get(definition.name, {
      type: "chat",
      label: LANGFUSE_PROMPT_LABEL,
      cacheTtlSeconds: LANGFUSE_PROMPT_CACHE_TTL_SECONDS,
      fallback: fallbackMessages,
      maxRetries: 1,
      fetchTimeoutMs: 2_000,
    })
    return {
      messages: compiledChatMessages(prompt.compile(variables)),
      prompt,
    }
  } catch {
    return localFallback(key, variables)
  }
}

export function compileLumenclipPromptFallback(
  key: LumenclipPromptKey,
  variables: Record<string, string>
) {
  const definition = LUMENCLIP_PROMPT_DEFINITIONS[key]
  const prompt = new ChatPromptClient(
    {
      name: definition.name,
      type: "chat",
      version: 0,
      prompt: definition.prompt.map((message) => ({ ...message })),
      labels: [LANGFUSE_PROMPT_LABEL],
      tags: [],
      config: {},
    },
    true
  )
  return {
    messages: compiledChatMessages(prompt.compile(variables)),
    prompt,
  }
}

function localFallback(
  key: LumenclipPromptKey,
  variables: Record<string, string>
) {
  return compileLumenclipPromptFallback(key, variables)
}

function defaultPromptManager() {
  if (!hasLangfuseCredentials()) return undefined
  client ??= new LangfuseClient()
  return client.prompt
}

function hasLangfuseCredentials() {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
  )
}

function compiledChatMessages(value: unknown): LumenclipChatMessage[] {
  if (!Array.isArray(value)) throw new Error("Langfuse prompt is not chat")
  return value.map((message) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("role" in message) ||
      !("content" in message) ||
      typeof message.role !== "string" ||
      typeof message.content !== "string" ||
      !["system", "user", "assistant"].includes(message.role)
    ) {
      throw new Error("Langfuse chat prompt contains an invalid message")
    }
    return {
      role: message.role as LumenclipChatMessage["role"],
      content: message.content,
    }
  })
}
