/**
 * Pure analysis of pasted/uploaded spec JSON for the "Paste JSON" entry point.
 * Accepts either a bare SlideshowSpec or a render-request-like wrapper
 * `{ spec, slotValues?, title? }`. Every issue keeps its JSON Pointer and gets
 * the line/column it points at in the pasted text.
 */
import {
  isTemplate,
  validateSpec,
  type SlideshowSpec,
  type SlotValues,
  type SpecIssue,
} from "@/lib/render/spec"

import {
  jsonParseErrorLocation,
  locateJsonPointer,
  type TextLocation,
} from "./json-locate"

export type LocatedIssue = SpecIssue & {
  /** Pointer into the pasted document (wrapper-aware). */
  textPath: string
  location: TextLocation | null
}

export type SpecJsonAnalysis =
  | { status: "empty" }
  | { status: "parse_error"; message: string; location: TextLocation | null }
  | {
      status: "invalid"
      errors: LocatedIssue[]
      warnings: LocatedIssue[]
    }
  | {
      status: "valid"
      spec: SlideshowSpec
      slotValues: SlotValues | undefined
      title: string | undefined
      /** The spec declares slots. */
      template: boolean
      /** A template that still needs slot values before it can render. */
      needsSlotValues: boolean
      warnings: LocatedIssue[]
    }

type Unwrapped = {
  spec: unknown
  slotValues: unknown
  title: string | undefined
  /** Pointer prefix of the spec inside the pasted document. */
  prefix: string
}

function unwrap(document: unknown): Unwrapped {
  if (
    document &&
    typeof document === "object" &&
    !Array.isArray(document) &&
    "spec" in document &&
    !("slides" in document)
  ) {
    const record = document as Record<string, unknown>
    return {
      spec: record.spec,
      slotValues: record.slotValues,
      title: typeof record.title === "string" ? record.title : undefined,
      prefix: "/spec",
    }
  }
  return { spec: document, slotValues: undefined, title: undefined, prefix: "" }
}

function locate(text: string, issue: SpecIssue, prefix: string): LocatedIssue {
  const textPath = issue.path.startsWith("/slotValues") ? issue.path : `${prefix}${issue.path}`
  return { ...issue, textPath, location: locateJsonPointer(text, textPath) }
}

export function analyzeSpecJson(text: string): SpecJsonAnalysis {
  if (!text.trim()) return { status: "empty" }
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    return {
      status: "parse_error",
      message: raw.replace(/^JSON\.parse: /, ""),
      location: jsonParseErrorLocation(text, error),
    }
  }
  const { spec, slotValues, title, prefix } = unwrap(document)
  if (
    slotValues !== undefined &&
    (slotValues === null || typeof slotValues !== "object" || Array.isArray(slotValues))
  ) {
    return {
      status: "invalid",
      errors: [
        locate(
          text,
          { code: "slot.type", path: "/slotValues", message: "slotValues must be an object." },
          prefix
        ),
      ],
      warnings: [],
    }
  }
  const result = validateSpec(spec, slotValues !== undefined ? { slotValues } : {})
  const warnings = result.warnings.map((issue) => locate(text, issue, prefix))
  if (!result.ok || !result.spec) {
    return {
      status: "invalid",
      errors: result.errors.map((issue) => locate(text, issue, prefix)),
      warnings,
    }
  }
  const template = isTemplate(result.spec)
  return {
    status: "valid",
    spec: result.spec,
    slotValues: slotValues as SlotValues | undefined,
    title: title ?? result.spec.name,
    template,
    needsSlotValues: template && slotValues === undefined,
    warnings,
  }
}

/** One-line human label for an issue location. */
export function issueLocationLabel(issue: LocatedIssue): string {
  const path = issue.textPath || "/"
  return issue.location ? `Line ${issue.location.line} · ${path}` : path
}
