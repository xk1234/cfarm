import { NextResponse } from "next/server"

import {
  automationRecordToSummary,
  listAutomationRecords,
  patchAutomationRecord,
} from "@/lib/automations"
import {
  automationHooks,
  schemaWithAutomationHooks,
} from "@/lib/realfarm-automation"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"

export const dynamic = "force-dynamic"

type OpenRouterHooksResponse = {
  choices?: {
    message?: {
      content?: unknown
    }
  }[]
  error?: {
    message?: string
  }
}

export async function POST(request: Request) {
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

  const records = await listAutomationRecords()
  const record = records.find((item) => item.id === automationId)
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
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
        response_format: {
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
      }),
    }
  )

  const openRouterPayload = (await response
    .json()
    .catch(() => ({}))) as OpenRouterHooksResponse
  if (!response.ok) {
    return NextResponse.json(
      { error: openRouterPayload.error?.message || "Failed to generate hooks" },
      { status: response.status }
    )
  }

  const generatedHooks = uniqueHooks(
    parseGeneratedHooks(openRouterPayload.choices?.[0]?.message?.content)
  )
    .filter(
      (hook) => !currentHooks.some((currentHook) => sameHook(currentHook, hook))
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
}

function parseGeneratedHooks(content: unknown) {
  const parsed = parseOpenRouterContent(content)
  if (!isRecord(parsed) || !Array.isArray(parsed.hooks)) {
    return []
  }

  return parsed.hooks.map(clean).filter(Boolean)
}

function parseOpenRouterContent(content: unknown): unknown {
  if (typeof content === "string") {
    return JSON.parse(content)
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part
        }
        if (isRecord(part) && typeof part.text === "string") {
          return part.text
        }
        return ""
      })
      .join("")
      .trim()
    return JSON.parse(text)
  }

  return content
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
