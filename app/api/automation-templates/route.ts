import { NextResponse } from "next/server"

import {
  automationSchemaToTemplateRecord,
  automationTemplateRecordToSchema,
  automationTemplateRecordToSummary,
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateExampleRuns,
  listAutomationTemplateRecords,
  upsertAutomationTemplateRecords,
} from "@/lib/automation-templates"
import { normalizeReelfarmAutomation } from "@/lib/automations"

export const dynamic = "force-dynamic"

export async function GET() {
  const records = await listAutomationTemplateRecords()
  const exampleRuns = await listAutomationTemplateExampleRuns()
  const templates = records.map(automationTemplateRecordToSummary)

  return NextResponse.json({
    records,
    templates,
    exampleRuns,
    exampleRunsByTemplateId:
      groupAutomationTemplateExampleRunsByTemplateId(exampleRuns),
    schemas: Object.fromEntries(
      records.map((record) => [
        record.id,
        automationTemplateRecordToSchema(record),
      ])
    ),
  })
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const rawTemplates: unknown[] = Array.isArray(payload?.templates)
    ? payload.templates
    : Array.isArray(payload?.automations)
      ? payload.automations
      : Array.isArray(payload)
        ? payload
        : []

  if (rawTemplates.length === 0) {
    return NextResponse.json(
      { error: "A templates array is required" },
      { status: 400 }
    )
  }

  const records = rawTemplates.filter(Boolean).map((raw) => {
    const automation = normalizeReelfarmAutomation(raw)
    const sourceAutomationId = automation.sourceAutomationId ?? automation.id
    const name = sourceTemplateName(automation.name, automation.raw)

    return automationSchemaToTemplateRecord({
      id: `template-reelfarm-${slugify(sourceAutomationId)}`,
      sourceAutomationId,
      sourceUrl: automation.sourceUrl,
      name,
      theme: automation.theme,
      createdAt: automation.importedAt ?? automation.updatedAt,
      updatedAt: automation.updatedAt,
      schema: automation.schema,
      hooks: sourceTemplateHooks(automation.raw),
    })
  })
  const next = await upsertAutomationTemplateRecords({ records })

  return NextResponse.json(
    {
      records: next,
      imported: records.length,
      templates: next.map(automationTemplateRecordToSummary),
      schemas: Object.fromEntries(
        next.map((record) => [
          record.id,
          automationTemplateRecordToSchema(record),
        ])
      ),
    },
    { status: 201 }
  )
}

function sourceTemplateName(
  name: string,
  raw: Record<string, unknown> | undefined
) {
  const reelfarmTitle =
    typeof raw?.reelfarmTitle === "string" ? raw.reelfarmTitle.trim() : ""
  const title = typeof raw?.title === "string" ? raw.title.trim() : ""
  return (
    reelfarmTitle ||
    title ||
    name.replace(/\s*\(template\s+\d+\)\s*$/i, "").trim()
  )
}

function sourceTemplateHooks(raw: Record<string, unknown> | undefined) {
  const hooks =
    raw?.reelfarmSlideshowHooks ?? raw?.slideshow_hooks ?? raw?.hooks
  const values = Array.isArray(hooks)
    ? hooks
    : typeof hooks === "string"
      ? [hooks]
      : []
  const seen = new Set<string>()

  return values.flatMap(splitHookText).filter((hook) => {
    const normalized = hook.toLowerCase()
    if (seen.has(normalized)) {
      return false
    }
    seen.add(normalized)
    return true
  })
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function splitHookText(value: unknown) {
  return typeof value === "string"
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
        .filter(Boolean)
    : []
}
