/**
 * Pure helpers behind the slot filler: the form model generated from a
 * template's `slots`, immutable slot-value updates, and the placeholder values
 * the live preview uses while required slots are still empty.
 */
import {
  validateSlotValues,
  type CollectionImageSource,
  type ImageSource,
  type ListSlotDef,
  type ScalarSlotDef,
  type SlideshowSpec,
  type SlotDef,
  type SlotValues,
  type SpecIssue,
} from "@/lib/render/spec"

/** Host of the synthetic image URLs the browser preview paints locally. */
export const PLACEHOLDER_IMAGE_HOST = "placeholder.lumenclip.invalid"

export function placeholderImageUrl(label: string): string {
  return `https://${PLACEHOLDER_IMAGE_HOST}/slot/${encodeURIComponent(label)}`
}

export function placeholderLabelFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== PLACEHOLDER_IMAGE_HOST) return null
    return decodeURIComponent(parsed.pathname.replace(/^\/slot\//, ""))
  } catch {
    return null
  }
}

export type SlotPath = readonly (string | number)[]

export type SlotField =
  | { kind: "scalar"; name: string; def: ScalarSlotDef; label: string }
  | { kind: "list"; name: string; def: ListSlotDef; label: string }

export function slotLabel(name: string, def: SlotDef): string {
  if (def.label?.trim()) return def.label.trim()
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
}

/** Slots in declaration order, image slots first within the same kind order. */
export function slotFields(spec: Pick<SlideshowSpec, "slots">): SlotField[] {
  return Object.entries(spec.slots ?? {}).map(([name, def]) =>
    def.type === "list"
      ? { kind: "list" as const, name, def, label: slotLabel(name, def) }
      : { kind: "scalar" as const, name, def, label: slotLabel(name, def) }
  )
}

export type ImageSlotSummary = {
  path: SlotPath
  label: string
  required: boolean
}

/** Every image slot, including image fields of each list item, for the drop-target grid. */
export function imageSlots(
  spec: Pick<SlideshowSpec, "slots">,
  values: SlotValues
): ImageSlotSummary[] {
  const out: ImageSlotSummary[] = []
  for (const field of slotFields(spec)) {
    if (field.kind === "scalar" && field.def.type === "image") {
      out.push({ path: [field.name], label: field.label, required: !!field.def.required })
    } else if (field.kind === "list") {
      const items = Array.isArray(values[field.name]) ? (values[field.name] as unknown[]) : []
      items.forEach((_, index) => {
        for (const [key, def] of Object.entries(field.def.item)) {
          if (def.type !== "image") continue
          out.push({
            path: [field.name, index, key],
            label: `${field.label} ${index + 1} · ${slotLabel(key, def)}`,
            required: !!def.required,
          })
        }
      })
    }
  }
  return out
}

export function getSlotValue(values: SlotValues, path: SlotPath): unknown {
  let current: unknown = values
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

/** Immutable set; `undefined` removes the key. Creates list items as needed. */
export function setSlotValue(values: SlotValues, path: SlotPath, value: unknown): SlotValues {
  if (path.length === 0) return values
  const [head, ...rest] = path
  if (rest.length === 0) {
    const next = { ...values }
    if (value === undefined) delete next[head as string]
    else next[head as string] = value
    return next
  }
  const container = values[head as string]
  if (typeof rest[0] === "number") {
    const list = Array.isArray(container) ? [...container] : []
    const [index, ...itemPath] = rest as [number, ...(string | number)[]]
    const item = (list[index] && typeof list[index] === "object" ? list[index] : {}) as SlotValues
    list[index] = itemPath.length ? setSlotValue(item, itemPath, value) : value
    return { ...values, [head as string]: list }
  }
  const child = (container && typeof container === "object" ? container : {}) as SlotValues
  return { ...values, [head as string]: setSlotValue(child, rest, value) }
}

export function addListItem(values: SlotValues, name: string): SlotValues {
  const list = Array.isArray(values[name]) ? [...(values[name] as unknown[])] : []
  list.push({})
  return { ...values, [name]: list }
}

export function removeListItem(values: SlotValues, name: string, index: number): SlotValues {
  const list = Array.isArray(values[name]) ? [...(values[name] as unknown[])] : []
  list.splice(index, 1)
  return { ...values, [name]: list }
}

export function moveListItem(
  values: SlotValues,
  name: string,
  index: number,
  delta: -1 | 1
): SlotValues {
  const list = Array.isArray(values[name]) ? [...(values[name] as unknown[])] : []
  const target = index + delta
  if (target < 0 || target >= list.length) return values
  ;[list[index], list[target]] = [list[target], list[index]]
  return { ...values, [name]: list }
}

/** Starting values for a template: list slots padded to `minItems`. */
export function initialSlotValues(
  spec: Pick<SlideshowSpec, "slots">,
  seed: SlotValues = {}
): SlotValues {
  let values: SlotValues = { ...seed }
  for (const field of slotFields(spec)) {
    if (field.kind !== "list") continue
    const current = Array.isArray(values[field.name]) ? (values[field.name] as unknown[]) : []
    const min = Math.max(field.def.minItems ?? 0, current.length === 0 ? 1 : 0)
    const max = field.def.maxItems ?? Infinity
    const padded = [...current]
    while (padded.length < Math.min(min, max)) padded.push({})
    values = { ...values, [field.name]: padded }
  }
  return values
}

export type ImageValueKind = "empty" | "media" | "url" | "collection"

export function imageValueKind(value: unknown): ImageValueKind {
  if (typeof value === "string") return value.trim() ? "url" : "empty"
  if (!value || typeof value !== "object") return "empty"
  if ("media" in value) return "media"
  if ("url" in value) return "url"
  if ("collection" in value) return "collection"
  return "empty"
}

export function randomCollectionSource(collectionId: string, seed = newSeed()): CollectionImageSource {
  return { collection: collectionId, pick: "random", seed }
}

export function newSeed(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto?.getRandomValues?.(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return hex === "000000000000" ? Math.random().toString(36).slice(2, 14) : hex
}

function previewScalar(def: ScalarSlotDef, value: unknown, label: string): unknown {
  const missing = value === undefined || value === null || value === ""
  switch (def.type) {
    case "image":
      return missing && def.default === undefined ? { url: placeholderImageUrl(label) } : value
    case "text": {
      if (missing && def.default === undefined) {
        const text = def.required ? label : undefined
        return text && def.maxLength ? text.slice(0, def.maxLength) : text
      }
      if (typeof value === "string" && def.maxLength && value.length > def.maxLength) {
        return value.slice(0, def.maxLength)
      }
      return value
    }
    case "color":
      return missing && def.required && def.default === undefined ? "#cccccc" : value
    case "number": {
      if (missing && def.required && def.default === undefined) return def.min ?? 0
      if (typeof value === "number") {
        return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, value))
      }
      return value
    }
    case "boolean":
      return value
  }
}

/**
 * Values that always resolve: missing required slots get placeholders (a
 * labelled grey image, the slot label as text, a neutral colour), lists are
 * padded/trimmed to their bounds and over-long text is truncated, so the live
 * preview renders while the form is incomplete.
 */
export function previewSlotValues(
  spec: Pick<SlideshowSpec, "slots">,
  values: SlotValues
): SlotValues {
  const out: SlotValues = {}
  for (const field of slotFields(spec)) {
    if (field.kind === "scalar") {
      const next = previewScalar(field.def, values[field.name], field.label)
      if (next !== undefined) out[field.name] = next
      continue
    }
    const items = Array.isArray(values[field.name]) ? (values[field.name] as unknown[]) : []
    const min = field.def.minItems ?? 0
    const max = field.def.maxItems ?? Infinity
    const sized = items.slice(0, max)
    while (sized.length < min) sized.push({})
    out[field.name] = sized.map((item, index) => {
      const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
      const filled: Record<string, unknown> = {}
      for (const [key, def] of Object.entries(field.def.item)) {
        const next = previewScalar(def, record[key], `${field.label} ${index + 1} ${slotLabel(key, def)}`)
        if (next !== undefined) filled[key] = next
      }
      return filled
    })
  }
  return out
}

/** Replaces collection picks with placeholders (preview fallback when a collection can't be listed). */
export function withoutCollectionSources(
  spec: Pick<SlideshowSpec, "slots">,
  values: SlotValues
): SlotValues {
  const replace = (value: unknown, label: string) =>
    imageValueKind(value) === "collection" ? { url: placeholderImageUrl(label) } : value
  const out: SlotValues = { ...values }
  for (const field of slotFields(spec)) {
    if (field.kind === "scalar" && field.def.type === "image") {
      out[field.name] = replace(out[field.name], field.label)
    } else if (field.kind === "list" && Array.isArray(out[field.name])) {
      out[field.name] = (out[field.name] as Record<string, unknown>[]).map((item, index) => {
        const copy = { ...item }
        for (const [key, def] of Object.entries(field.def.item)) {
          if (def.type === "image") copy[key] = replace(copy[key], `${field.label} ${index + 1}`)
        }
        return copy
      })
    }
  }
  return out
}

/** Drops empty strings/empty objects so validation sees "missing", not "wrong type". */
export function cleanSlotValues(values: SlotValues): SlotValues {
  const clean = (value: unknown): unknown => {
    if (value === "" || value === null || value === undefined) return undefined
    if (Array.isArray(value)) return value.map((item) => clean(item) ?? {})
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => [k, clean(v)] as const)
        .filter(([, v]) => v !== undefined)
      return Object.fromEntries(entries)
    }
    return value
  }
  return (clean(values) ?? {}) as SlotValues
}

export function slotValueIssues(
  spec: Pick<SlideshowSpec, "slots">,
  values: SlotValues
): { errors: SpecIssue[]; warnings: SpecIssue[] } {
  return validateSlotValues(spec.slots, cleanSlotValues(values))
}

/** Issues keyed by their slot path (`hook`, `items/0/title`), for inline field errors. */
export function issuesBySlotPath(issues: readonly SpecIssue[]): Map<string, SpecIssue[]> {
  const map = new Map<string, SpecIssue[]>()
  for (const issue of issues) {
    if (!issue.path.startsWith("/slotValues")) continue
    const key = issue.path.replace(/^\/slotValues\/?/, "")
    map.set(key, [...(map.get(key) ?? []), issue])
  }
  return map
}

export function slotPathKey(path: SlotPath): string {
  return path.map(String).join("/")
}

export function describeImageSource(value: unknown): string {
  const kind = imageValueKind(value)
  if (kind === "empty") return "Empty"
  if (kind === "media") return "Upload"
  if (kind === "url") return "Image link"
  const source = value as CollectionImageSource
  if (source.pick === "random") return "Random from collection"
  if (typeof source.pick === "number") return `Collection image ${source.pick + 1}`
  return "First in collection"
}

export function isImageSource(value: unknown): value is ImageSource {
  const kind = imageValueKind(value)
  return kind !== "empty" && typeof value === "object"
}
