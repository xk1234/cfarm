import type {
  AutomationRunRecord,
  AutomationRunSlide,
} from "@/lib/automation-runner"
import {
  automationFormatSection,
  type AutomationSchema,
  type TextItem,
} from "@/lib/realfarm-automation"
import { isRuntimeHookVariable } from "@/lib/hook-variables"
import { wordRangeViolation } from "@/lib/temp-slide-testing-shared"

export type AutomationOutputQaFindingCode =
  | "COUNT_MISMATCH"
  | "UNRESOLVED_TOKEN"
  | "DUPLICATE_VARIABLE_DRAW"
  | "NEAR_DUPLICATE_OUTPUT"
  | "EMPTY_SLIDE_TEXT"
  | "WORD_LENGTH_VIOLATION"

export type AutomationOutputQaFinding = {
  code: AutomationOutputQaFindingCode
  severity: "error" | "warning"
  message: string
  slideIndex?: number
  textItemId?: string
  expected?: number | string
  actual?: number | string
  priorOutputId?: string
}

export type AutomationOutputQaReport = {
  valid: boolean
  actualSlideCount: number
  bodySlideCount: number
  findings: AutomationOutputQaFinding[]
}

const unresolvedTokenPattern = /\[\[[A-Z][A-Z0-9_-]*\]\]/gi
const countTokenPattern = /(COUNT|NUMBER|TOTAL|ITEMS?|THINGS?|WAYS?|SIGNS?)/i
export function validateAutomationRunOutput(input: {
  run: AutomationRunRecord
  schema?: AutomationSchema
  priorRuns?: AutomationRunRecord[]
}): AutomationOutputQaReport {
  const findings: AutomationOutputQaFinding[] = []
  const slides = input.run.plan.slides
  const bodySlides = slides.filter((slide) => slide.role === "content")
  const bodySlideCount = bodySlides.length

  findings.push(...countMismatchFindings(input.run, bodySlideCount))
  findings.push(...unresolvedTokenFindings(input.run))
  if (input.schema?.distinct_variable_draws !== false) {
    findings.push(...duplicateVariableDrawFindings(input.run))
  }
  findings.push(
    ...nearDuplicateFindings(input.run, input.priorRuns ?? []),
    ...slideTextFindings(slides, input.schema)
  )

  return {
    valid: !findings.some((finding) => finding.severity === "error"),
    actualSlideCount: slides.length,
    bodySlideCount,
    findings,
  }
}

function countMismatchFindings(
  run: AutomationRunRecord,
  bodySlideCount: number
): AutomationOutputQaFinding[] {
  if (bodySlideCount === 0) return []
  const substitutions = Object.entries(run.plan.hookSubstitutions ?? {})
  const explicitCounts = substitutions.flatMap(([name, rawValue]) => {
    if (!countTokenPattern.test(name)) return []
    const numeric = integerInRange(rawValue, 1, 100)
    return numeric == null ? [] : [numeric]
  })
  const literalCounts = [...run.plan.hook.matchAll(/\b(\d{1,2}|100)\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0)
  const expectedCounts = [...new Set([...explicitCounts, ...literalCounts])]
  if (expectedCounts.length === 0 || expectedCounts.includes(bodySlideCount)) {
    return []
  }
  const expected = expectedCounts[0]
  return [
    {
      code: "COUNT_MISMATCH",
      severity: "error",
      expected,
      actual: bodySlideCount,
      message: `The hook promises ${expected} item${expected === 1 ? "" : "s"}, but ${bodySlideCount} body slide${bodySlideCount === 1 ? "" : "s"} rendered.`,
    },
  ]
}

function unresolvedTokenFindings(
  run: AutomationRunRecord
): AutomationOutputQaFinding[] {
  const values: Array<{
    text: string
    slideIndex?: number
    textItemId?: string
  }> = [{ text: run.plan.hook }]
  run.plan.slides.forEach((slide, slideIndex) => {
    if (slide.textItems?.length) {
      slide.textItems.forEach((item) =>
        values.push({ text: item.text, slideIndex, textItemId: item.id })
      )
    } else {
      values.push({ text: slide.text, slideIndex })
    }
  })
  return values.flatMap((value) => {
    const tokens = [...new Set(value.text.match(unresolvedTokenPattern) ?? [])]
    return tokens.map((token) => ({
      code: "UNRESOLVED_TOKEN" as const,
      severity: "error" as const,
      slideIndex:
        value.slideIndex === undefined ? undefined : value.slideIndex + 1,
      textItemId: value.textItemId,
      actual: token,
      message: `${token} survived variable substitution in rendered text.`,
    }))
  })
}

function duplicateVariableDrawFindings(
  run: AutomationRunRecord
): AutomationOutputQaFinding[] {
  const byValue = new Map<string, string[]>()
  for (const [name, rawValue] of Object.entries(
    run.plan.hookSubstitutions ?? {}
  )) {
    if (isRuntimeHookVariable(name)) continue
    const value = rawValue.trim()
    if (!value) continue
    const key = value.toLocaleLowerCase()
    byValue.set(key, [...(byValue.get(key) ?? []), name])
  }
  return [...byValue.entries()].flatMap(([value, names]) =>
    names.length < 2
      ? []
      : [
          {
            code: "DUPLICATE_VARIABLE_DRAW" as const,
            severity: "error" as const,
            expected: "distinct values",
            actual: value,
            message: `The value “${value}” was drawn into multiple hook slots: ${names.join(", ")}.`,
          },
        ]
  )
}

function nearDuplicateFindings(
  run: AutomationRunRecord,
  priorRuns: AutomationRunRecord[]
): AutomationOutputQaFinding[] {
  if (!run.plan.hookId) return []
  const primary = primaryVariableValue(run)
  if (!primary) return []
  const prior = priorRuns.find(
    (candidate) =>
      candidate.id !== run.id &&
      candidate.plan.hookId === run.plan.hookId &&
      primaryVariableValue(candidate)?.toLocaleLowerCase() ===
        primary.toLocaleLowerCase()
  )
  if (!prior) return []
  return [
    {
      code: "NEAR_DUPLICATE_OUTPUT",
      severity: "warning",
      expected: "a new hook-variable combination",
      actual: primary,
      priorOutputId: prior.slideshowId ?? prior.id,
      message: `This output reuses hook ${run.plan.hookId} with the primary value “${primary}” from an earlier output.`,
    },
  ]
}

function primaryVariableValue(run: AutomationRunRecord) {
  const entries = Object.entries(run.plan.hookSubstitutions ?? {})
  const preferred = entries.find(
    ([name, value]) => value.trim() && !isRuntimeHookVariable(name)
  )
  return preferred?.[1].trim()
}

function slideTextFindings(
  slides: AutomationRunSlide[],
  schema?: AutomationSchema
): AutomationOutputQaFinding[] {
  return slides.flatMap((slide, slideIndex) => {
    const renderedItems = slide.textItems?.length
      ? slide.textItems
      : slide.text
        ? [{ id: "text", text: slide.text }]
        : []
    const section = schema
      ? automationFormatSection(
          schema,
          slide.role === "hook"
            ? "hook"
            : slide.role === "cta"
              ? "cta"
              : "content"
        )
      : undefined
    if (section?.noText || slide.displayText === false) return []
    if (renderedItems.length === 0) {
      return [
        {
          code: "EMPTY_SLIDE_TEXT" as const,
          severity: "error" as const,
          slideIndex: slideIndex + 1,
          message: `Slide ${slideIndex + 1} has no rendered text.`,
        },
      ]
    }

    const configuredById = new Map(
      (section?.textItems ?? []).map((item) => [item.id, item])
    )
    return renderedItems.flatMap((item, itemIndex) => {
      const text = item.text.trim()
      const configured =
        configuredById.get(item.id) ?? section?.textItems[itemIndex]
      if (!text) {
        return [
          {
            code: "EMPTY_SLIDE_TEXT" as const,
            severity: "error" as const,
            slideIndex: slideIndex + 1,
            textItemId: item.id,
            message: `Slide ${slideIndex + 1} text item ${item.id} is empty.`,
          },
        ]
      }
      return configured
        ? wordLengthFindings(text, configured, slideIndex, item.id)
        : []
    })
  })
}

function wordLengthFindings(
  text: string,
  configured: TextItem,
  slideIndex: number,
  textItemId: string
): AutomationOutputQaFinding[] {
  const words = text.split(/\s+/).filter(Boolean).length
  const direction = wordRangeViolation(
    words,
    configured.wordLengthMin,
    configured.wordLengthMax
  )
  if (!direction) return []
  const limit =
    direction === "below" ? configured.wordLengthMin : configured.wordLengthMax
  return [
    {
      code: "WORD_LENGTH_VIOLATION",
      severity: "error",
      slideIndex: slideIndex + 1,
      textItemId,
      expected: `${direction === "below" ? "at least" : "at most"} ${limit} words`,
      actual: words,
      message: `Slide ${slideIndex + 1} text item ${textItemId} has ${words} words; its configured ${direction === "below" ? "minimum" : "maximum"} is ${limit}.`,
    },
  ]
}

function integerInRange(value: string, min: number, max: number) {
  const match = value.match(/\b\d+\b/)
  if (!match) return null
  const numeric = Number(match[0])
  return Number.isInteger(numeric) && numeric >= min && numeric <= max
    ? numeric
    : null
}
