import { clean, isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  openRouterChatCompletion,
  parseOpenRouterContent,
} from "@/lib/openrouter"
import {
  automationRecordToSummary,
  getAutomationRecord,
  patchAutomationRecord,
} from "@/lib/automations"
import {
  automationHooks,
  schemaWithAutomationHooks,
} from "@/lib/realfarm-automation"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import { recentUsageKeys, usageKeyForHook } from "@/lib/usage-ledger"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const automationId = clean(payload?.automationId)

  if (!automationId) {
    return NextResponse.json(
      { error: "An automation id is required" },
      { status: 400 }
    )
  }

  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 }
    )
  }

  const record = await getAutomationRecord(automationId)
  if (!record) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 })
  }

  const currentHooks = uniqueHooks(automationHooks(record.schema))
  if (currentHooks.length === 0) {
    return NextResponse.json(
      { error: "Add at least one hook before generating more" },
      { status: 400 }
    )
  }

  const sampleHooks = randomSample(
    currentHooks,
    Math.min(10, currentHooks.length)
  )
  const recentHookKeys = await recentUsageKeys("hook", record.id, {
    withinDays: record.schema.reuse_policy?.hook_exclusion_days ?? 45,
  })
  const {
    ok,
    status,
    payload: openRouterPayload,
  } = await openRouterChatCompletion({
    apiKey,
    model: openRouterModelForUseCase("automationHooks"),
    messages: [
      {
        role: "system",
        content:
          "You write TikTok slideshow hooks. Return only JSON that matches the schema. Do not number the hooks. Do not repeat the provided examples.",
      },
      {
        role: "user",
        content: [
          `Automation: ${record.name}`,
          `Generate 10 new hooks in the same niche and style as these existing hooks.`,
          `Existing hooks:`,
          ...sampleHooks.map((hook) => `- ${hook}`),
          "Keep each hook short, specific, and usable as the first slide of a TikTok slideshow.",
        ].join("\n"),
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "automation_hook_generation",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["hooks"],
          properties: {
            hooks: {
              type: "array",
              minItems: 10,
              maxItems: 10,
              items: {
                type: "string",
                minLength: 3,
              },
            },
          },
        },
      },
    },
  })

  if (!ok) {
    return NextResponse.json(
      { error: openRouterPayload.error?.message || "Failed to generate hooks" },
      { status }
    )
  }

  const generatedHooks = uniqueHooks(
    parseGeneratedHooks(openRouterPayload.choices?.[0]?.message?.content)
  )
    .filter(
      (hook) =>
        !currentHooks.some((currentHook) => sameHook(currentHook, hook)) &&
        !recentHookKeys.has(usageKeyForHook(hook))
    )
    .slice(0, 10)

  if (generatedHooks.length === 0) {
    return NextResponse.json(
      { error: "No unique hooks were generated" },
      { status: 422 }
    )
  }

  const hooks = uniqueHooks([...currentHooks, ...generatedHooks])
  const schema = schemaWithAutomationHooks(record.schema, hooks)
  const updated = await patchAutomationRecord({ id: record.id, schema })

  if (!updated) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 })
  }

  return NextResponse.json({
    automation: automationRecordToSummary(updated),
    record: updated,
    hooks,
    generatedHooks,
    schema,
  })
})

function parseGeneratedHooks(content: unknown) {
  const parsed = JSON.parse(parseOpenRouterContent(content))
  if (!isRecord(parsed) || !Array.isArray(parsed.hooks)) {
    return []
  }

  return parsed.hooks.map(clean).filter(Boolean)
}

function randomSample<T>(items: T[], count: number) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .slice(0, count)
    .map(({ item }) => item)
}

function uniqueHooks(hooks: string[]) {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const hook of hooks.map(clean).filter(Boolean)) {
    const key = normalizeHookKey(hook)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(hook)
  }
  return unique
}

function sameHook(left: string, right: string) {
  return normalizeHookKey(left) === normalizeHookKey(right)
}

function normalizeHookKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}
