import type { AutomationRecord } from "@/lib/automations"
import type { AutomationSchema } from "@/lib/realfarm-automation"
import type { XAutomationRecord } from "@/lib/x-automation"

/** The three authoring surfaces exposed by the product. */
export type ContentTemplateKind = "slideshow" | "video" | "text"

export type ContentTemplate = {
  id: string
  name: string
  kind: ContentTemplateKind
  createdAt: string
  updatedAt: string
  editor:
    | { kind: "slideshow"; schema: AutomationSchema }
    | { kind: "video"; schema: AutomationSchema }
    | { kind: "text"; definition: XAutomationRecord }
}

/**
 * Compatibility adapter for definitions created before the template/output
 * migration. The old storage rows remain readable, but callers only receive
 * the template vocabulary.
 */
export function contentTemplateFromMediaRecord(
  record: AutomationRecord
): ContentTemplate {
  const kind = record.schema.automationKind === "video" ? "video" : "slideshow"
  return {
    id: record.id,
    name: record.name,
    kind,
    createdAt: dateValue(record.schema.created_at) || record.updatedAt,
    updatedAt: record.updatedAt,
    editor: { kind, schema: record.schema },
  }
}

export function contentTemplateFromPostRecord(
  record: XAutomationRecord
): ContentTemplate {
  return {
    id: record.id,
    name: record.name,
    kind: "text",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    editor: { kind: "text", definition: record },
  }
}

function dateValue(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString()
  }
  return ""
}
