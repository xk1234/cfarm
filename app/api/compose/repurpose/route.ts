import { NextResponse } from "next/server"

import type { SocialPlatformKey } from "@/lib/social/provider-contract"
import { getCurrentUser } from "@/lib/auth"
import { resolveComposerSources } from "@/lib/compose-sources.server"
import { clean, isRecord } from "@/lib/guards"
import { getLumenclipChatPrompt } from "@/lib/langfuse-prompts"
import { getOpenRouterApiKey, openRouterJson } from "@/lib/openrouter"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import { getSocialProvider } from "@/lib/social/registry"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  }

  const payload = await request.json().catch(() => null)
  const sourceOutputIds = uniqueStrings(payload?.sourceOutputIds)
  const platforms = uniqueStrings(payload?.platforms).filter(
    (platform): platform is SocialPlatformKey =>
      Boolean(getSocialProvider(platform))
  )
  if (sourceOutputIds.length === 0 || platforms.length === 0) {
    return NextResponse.json(
      { error: "Choose at least one template output and platform" },
      { status: 400 }
    )
  }

  const sources = await resolveComposerSources(sourceOutputIds)
  if (sources.length !== sourceOutputIds.length) {
    return NextResponse.json(
      { error: "One or more template outputs no longer exist" },
      { status: 404 }
    )
  }
  const apiKey = getOpenRouterApiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: "Content repurposing is not configured" },
      { status: 503 }
    )
  }

  const properties = Object.fromEntries(
    platforms.map((platform) => [
      platform,
      {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          title: { type: "string" },
        },
        required: ["text", "title"],
      },
    ])
  )
  const sourceMaterial = sources
    .map(
      (source, index) =>
        `SOURCE ${index + 1}: ${source.title}\nTemplate: ${source.templateName}\nContent:\n${source.text}`
    )
    .join("\n\n---\n\n")
  const limits = platforms
    .map((platform) => {
      const provider = getSocialProvider(platform)!
      return `${platform}: maximum ${provider.limits.maxTextLength} characters`
    })
    .join("\n")

  try {
    const managedPrompt = await getLumenclipChatPrompt("composeRepurpose", {
      limits,
      source_material: sourceMaterial,
    })
    const result = await openRouterJson({
      apiKey,
      model: openRouterModelForUseCase("slideshowText"),
      messages: managedPrompt.messages,
      schema: {
        name: "compose_platform_variants",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties,
          required: platforms,
        },
      },
      temperature: 0.6,
      maxTokens: 4_000,
      timeoutMs: 60_000,
      trace: {
        feature: "compose-repurpose",
        userId: user.$id,
        prompt: managedPrompt.prompt,
        metadata: { route: "api/compose/repurpose" },
      },
    })
    const variants = Object.fromEntries(
      platforms.flatMap((platform) => {
        const item = result[platform]
        if (!isRecord(item)) return []
        return [
          [platform, { text: clean(item.text), title: clean(item.title) }],
        ]
      })
    )
    return NextResponse.json({ variants })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Content repurposing failed",
      },
      { status: 502 }
    )
  }
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(clean).filter(Boolean))]
}
