import { LangfuseClient } from "@langfuse/client"

import {
  lumenclipChatPromptsEqual,
  LUMENCLIP_PROMPT_DEFINITIONS,
  normalizeLumenclipChatPrompt,
  RETIRED_LUMENCLIP_PROMPT_NAMES,
} from "@/lib/langfuse-prompt-catalog"

const requiredEnvironment = [
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_BASE_URL",
] as const
const missing = requiredEnvironment.filter((name) => !process.env[name])
if (missing.length > 0) {
  throw new Error(`Missing required environment: ${missing.join(", ")}`)
}

const langfuse = new LangfuseClient()

for (const definition of Object.values(LUMENCLIP_PROMPT_DEFINITIONS)) {
  const prompt = definition.prompt.map((message) => ({ ...message }))
  let unchanged = false
  let obsoleteHollowVersion: number | undefined
  try {
    const current = await langfuse.prompt.get(definition.name, {
      type: "chat",
      label: "production",
      cacheTtlSeconds: 0,
      maxRetries: 0,
      fetchTimeoutMs: 5_000,
    })
    unchanged = lumenclipChatPromptsEqual(current.prompt, prompt)
    const normalized = normalizeLumenclipChatPrompt(current.prompt)
    if (
      normalized?.some((message) =>
        /^\{\{(?:system_prompt|user_prompt|content_prompt)\}\}$/.test(
          message.content
        )
      )
    ) {
      obsoleteHollowVersion = current.version
    }
  } catch {
    // A missing production prompt is created below. Network/auth failures still
    // fail safely when create is attempted and never mutate local application state.
  }

  if (unchanged) {
    console.log(`unchanged ${definition.name}`)
    continue
  }

  await langfuse.prompt.create({
    name: definition.name,
    type: "chat",
    prompt,
    labels: ["production"],
    commitMessage: "Replace pass-through wrapper with actual production prompt",
  })
  console.log(`migrated ${definition.name}`)
  if (obsoleteHollowVersion !== undefined) {
    await langfuse.prompt.delete(definition.name, {
      version: obsoleteHollowVersion,
    })
    console.log(
      `deleted hollow ${definition.name} version ${obsoleteHollowVersion}`
    )
  }
}

for (const name of RETIRED_LUMENCLIP_PROMPT_NAMES) {
  try {
    await langfuse.prompt.get(name, {
      type: "chat",
      label: "production",
      cacheTtlSeconds: 0,
      maxRetries: 0,
      fetchTimeoutMs: 5_000,
    })
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 404
    ) {
      console.log(`absent ${name}`)
      continue
    }
    throw error
  }
  await langfuse.prompt.delete(name)
  console.log(`retired ${name}`)
}
