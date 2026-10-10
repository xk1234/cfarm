/**
 * CSV → batch items. One row is one carousel. Columns map to template slots
 * (`mapping` renames columns; by default a column maps to the slot of the same
 * name) plus the reserved targets `caption`, `title`, `seed` and
 * `platformOptions` (JSON).
 *
 * - List slots use `slot.N.field` paths, e.g. `slides.0.caption`,
 *   `slides.0.image`, `slides.1.caption` (N is 0-based; gaps are closed up).
 * - Image cells: an `https://…` URL, `media:<mediaId>`, `collection:<name or id>`
 *   (a random pick that is not reused within the batch while the collection
 *   has unused images), or a JSON image source object.
 * - Number, boolean and colour slots are coerced from text. Empty cells are
 *   omitted, so slot defaults apply.
 */
import type { SlotDef } from "@/lib/render/spec"

import type { BatchIssue } from "./schedule"

export const MAX_CSV_BYTES = 2 * 1024 * 1024
export const RESERVED_COLUMNS = [
  "caption",
  "title",
  "seed",
  "platformOptions",
] as const
type Reserved = (typeof RESERVED_COLUMNS)[number]

export type RawBatchItem = {
  slotValues: Record<string, unknown>
  caption?: string
  title?: string
  seed?: string
  platformOptions?: Record<string, unknown>
}

/** RFC 4180 parser: quoted fields, `""` escapes, embedded commas/newlines, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  for (; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"' && field === "") {
      quoted = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

type Target =
  | { kind: "reserved"; name: Reserved }
  | { kind: "slot"; slot: string; def: SlotDef }
  | { kind: "list"; slot: string; index: number; field: string; def: SlotDef }
  | { kind: "ignore" }

function resolveTarget(
  path: string,
  slots: Record<string, SlotDef>
): Target | null {
  if (!path) return { kind: "ignore" }
  if ((RESERVED_COLUMNS as readonly string[]).includes(path))
    return { kind: "reserved", name: path as Reserved }
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".")
  const def = slots[parts[0]!]
  if (!def) return null
  if (parts.length === 1)
    return def.type === "list" ? null : { kind: "slot", slot: parts[0]!, def }
  if (def.type !== "list" || parts.length !== 3 || !/^\d+$/.test(parts[1]!))
    return null
  const fieldDef = def.item[parts[2]!]
  if (!fieldDef) return null
  return {
    kind: "list",
    slot: parts[0]!,
    index: Number(parts[1]),
    field: parts[2]!,
    def: fieldDef,
  }
}

function coerce(
  raw: string,
  def: SlotDef
): { value: unknown } | { error: string } {
  const value = raw.trim()
  switch (def.type) {
    case "number": {
      const n = Number(value)
      return Number.isFinite(n)
        ? { value: n }
        : { error: `"${value}" is not a number.` }
    }
    case "boolean": {
      const v = value.toLowerCase()
      if (["true", "yes", "1", "y"].includes(v)) return { value: true }
      if (["false", "no", "0", "n"].includes(v)) return { value: false }
      return { error: `"${value}" is not true/false.` }
    }
    case "image": {
      if (value.startsWith("{")) {
        try {
          return { value: JSON.parse(value) }
        } catch {
          return { error: "Invalid JSON image source." }
        }
      }
      const collection = /^collection:(.+)$/i.exec(value)
      if (collection)
        return { value: { collection: collection[1]!.trim(), pick: "random" } }
      const media = /^media:(.+)$/i.exec(value)
      if (media) return { value: { media: media[1]!.trim() } }
      return { value }
    }
    case "text":
      // Text keeps its whitespace (multi-line captions on slides).
      return { value: raw }
    default:
      return { value }
  }
}

/** Converts CSV text to raw batch items (validated against the template later). */
export function csvToItems(
  text: string,
  options: {
    slots: Record<string, SlotDef> | undefined
    mapping?: Record<string, string | null> | null
  }
): { items: RawBatchItem[]; errors: BatchIssue[] } {
  const errors: BatchIssue[] = []
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) {
    return {
      items: [],
      errors: [
        {
          code: "csv.too_large",
          path: "/csv",
          message: `CSV is larger than ${MAX_CSV_BYTES / 1024 / 1024} MB.`,
        },
      ],
    }
  }
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return {
      items: [],
      errors: [
        {
          code: "csv.empty",
          path: "/csv",
          message: "CSV needs a header row and at least one data row.",
        },
      ],
    }
  }
  const slots = options.slots ?? {}
  const header = rows[0]!.map((h) => h.trim())
  const mapping = options.mapping ?? {}
  for (const column of Object.keys(mapping)) {
    if (!header.includes(column)) {
      errors.push({
        code: "csv.mapping_column",
        path: `/mapping/${column}`,
        message: `Column "${column}" is not in the CSV header.`,
      })
    }
  }
  const targets = header.map((column, c) => {
    const path = column in mapping ? (mapping[column] ?? "") : column
    const target = resolveTarget(path.trim(), slots)
    if (!target) {
      errors.push({
        code: "csv.unknown_column",
        path: `/csv/columns/${c}`,
        message: `Column "${column}" does not match a slot (${Object.keys(slots).join(", ") || "none"}) or caption/title/seed/platformOptions; map it with "mapping".`,
      })
    }
    return target
  })
  if (errors.length) return { items: [], errors }

  const items: RawBatchItem[] = []
  rows.slice(1).forEach((cells, r) => {
    const item: RawBatchItem = { slotValues: {} }
    const lists = new Map<string, Record<string, unknown>[]>()
    targets.forEach((target, c) => {
      const raw = cells[c] ?? ""
      if (!target || target.kind === "ignore" || raw.trim() === "") return
      const at = `/csv/rows/${r + 1}/${header[c]}`
      if (target.kind === "reserved") {
        if (target.name === "platformOptions") {
          try {
            const parsed = JSON.parse(raw)
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
              throw new Error("not an object")
            item.platformOptions = parsed
          } catch {
            errors.push({
              code: "csv.platform_options",
              path: at,
              message:
                'platformOptions must be a JSON object, e.g. {"tiktok":{"auto_add_music":true}}.',
            })
          }
        } else {
          item[target.name] = target.name === "caption" ? raw : raw.trim()
        }
        return
      }
      const coerced = coerce(raw, target.def)
      if ("error" in coerced) {
        errors.push({ code: "csv.value", path: at, message: coerced.error })
        return
      }
      if (target.kind === "slot") {
        item.slotValues[target.slot] = coerced.value
      } else {
        const list = lists.get(target.slot) ?? []
        list[target.index] = {
          ...(list[target.index] ?? {}),
          [target.field]: coerced.value,
        }
        lists.set(target.slot, list)
      }
    })
    for (const [slot, list] of lists)
      item.slotValues[slot] = list.filter(Boolean)
    items.push(item)
  })
  return { items, errors }
}
