import { LangfuseClient } from "@langfuse/client"

import {
  lumenclipChatPromptsEqual,
  LUMENCLIP_PROMPT_DEFINITIONS,
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
  try {
    const current = await langfuse.prompt.get(definition.name, {
      type: "chat",
      label: "production",
      cacheTtlSeconds: 0,
      maxRetries: 0,
      fetchTimeoutMs: 5_000,
    })
    unchanged = lumenclipChatPromptsEqual(current.prompt, prompt)
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
    commitMessage: "Migrate exact LumenClip production fallback",
  })
  console.log(`migrated ${definition.name}`)
}
