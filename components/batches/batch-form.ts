/**
 * New-batch form model: turns the form state into a `POST /api/v1/batches`
 * request. Pure so it is unit-tested without a browser.
 */
import type { BatchRequestInput } from "@/components/realfarm/api-client"
import type { SlideshowSpec, SlotDef } from "@/lib/render/spec"

export type BatchMode = "schedule" | "draft"

export type BatchFormState = {
  name: string
  templateId: string
  /** JSON array of items, `{ "items": [...] }`, or CSV text. */
  itemsText: string
  /** Picked SocialBu accounts (when SocialBu is connected). */
  accountIds: string[]
  /** Comma/space separated account ids typed by hand (SocialBu not connected). */
  manualAccountIds: string
  timezone: string
  startDate: string
  /** Comma separated `HH:MM` times. */
  timesOfDay: string
  maxPerAccountPerDay: string
  jitterMaxMinutes: string
  mode: BatchMode
  /** TikTok privacy override; "" = default (public). */
  privacyStatus: string
}

export const EMPTY_BATCH_FORM: BatchFormState = {
  name: "",
  templateId: "",
  itemsText: "",
  accountIds: [],
  manualAccountIds: "",
  timezone: "",
  startDate: "",
  timesOfDay: "09:00, 13:00, 19:00",
  maxPerAccountPerDay: "3",
  jitterMaxMinutes: "10",
  mode: "schedule",
  privacyStatus: "",
}

export type ItemsInput = { items: Record<string, unknown>[] } | { csv: string }

/** JSON (array or `{items}`) when the text looks like JSON, otherwise CSV. */
export function parseItemsText(
  text: string
): { ok: true; value: ItemsInput } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (!trimmed)
    return { ok: false, error: "Paste items as JSON or CSV, or upload a file." }
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (error) {
      return {
        ok: false,
        error: `Items are not valid JSON: ${error instanceof Error ? error.message : "parse error"}`,
      }
    }
    const items = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : null
    if (!items)
      return {
        ok: false,
        error: 'JSON items must be an array or { "items": [...] }.',
      }
    if (
      !items.every(
        (item) => item && typeof item === "object" && !Array.isArray(item)
      )
    ) {
      return { ok: false, error: "Every JSON item must be an object." }
    }
    return { ok: true, value: { items: items as Record<string, unknown>[] } }
  }
  return { ok: true, value: { csv: text } }
}

export function splitList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Builds the request; `connected` picks the account checkboxes over the typed ids. */
export function buildBatchRequest(
  form: BatchFormState,
  options: { connected: boolean }
): { ok: true; request: BatchRequestInput } | { ok: false; error: string } {
  if (!form.templateId) return { ok: false, error: "Choose a template." }
  const items = parseItemsText(form.itemsText)
  if (!items.ok) return items
  const accountIds = options.connected
    ? form.accountIds
    : splitList(form.manualAccountIds)
  if (accountIds.length === 0)
    return { ok: false, error: "Choose at least one account." }
  const times = splitList(form.timesOfDay)
  if (times.length === 0)
    return { ok: false, error: "Add at least one time of day." }
  const maxPerDay = Number(form.maxPerAccountPerDay)
  const jitter = Number(form.jitterMaxMinutes)
  const schedule: Record<string, unknown> = {
    accountIds,
    timesOfDay: times,
    mode: form.mode,
    ...(form.timezone.trim() ? { timezone: form.timezone.trim() } : {}),
    ...(form.startDate ? { startDate: form.startDate } : {}),
    ...(Number.isFinite(maxPerDay) && form.maxPerAccountPerDay.trim()
      ? { maxPerAccountPerDay: maxPerDay }
      : {}),
    ...(Number.isFinite(jitter) && form.jitterMaxMinutes.trim()
      ? { jitterMinutes: { min: 0, max: jitter } }
      : {}),
    ...(form.privacyStatus ? { privacyStatus: form.privacyStatus } : {}),
  }
  return {
    ok: true,
    request: {
      ...(form.name.trim() ? { name: form.name.trim() } : {}),
      templateId: form.templateId,
      ...items.value,
      schedule,
    },
  }
}

function exampleValue(def: SlotDef, collection: string): unknown {
  switch (def.type) {
    case "image":
      return { collection, pick: "random" }
    case "text":
      return def.label ? `${def.label} text` : "Text"
    case "number":
      return def.default ?? 1
    case "boolean":
      return def.default ?? true
    case "color":
      return def.default ?? "#ffffff"
    case "list":
      return [
        Object.fromEntries(
          Object.entries(def.item).map(([field, fieldDef]) => [
            field,
            exampleValue(fieldDef, collection),
          ])
        ),
      ]
  }
}

/** One example item for a template, shown as the items placeholder. */
export function exampleItemsJson(
  spec: SlideshowSpec | null | undefined,
  collection = "My collection"
): string {
  const slotValues = Object.fromEntries(
    Object.entries(spec?.slots ?? {})
      .filter(([, def]) => def.type !== "color")
      .map(([name, def]) => [name, exampleValue(def, collection)])
  )
  return JSON.stringify(
    [{ slotValues, caption: "Caption with #hashtags" }],
    null,
    2
  )
}
