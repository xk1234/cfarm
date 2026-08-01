"use client"

import { useEffect, useMemo, useState } from "react"
import {
  IconAlertTriangle,
  IconCheck,
  IconFlask,
  IconSparkles,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { AutomationRecord } from "@/lib/automations"

type SectionId = "hook" | "body" | "cta"
type FieldDimension =
  | "slideDirection"
  | "itemDirection"
  | "wordRange"
  | "staticText"
  | "tone"
  | "promptFormatting"
  | "slideCount"

type TextItemDimension = {
  itemId: string
  label: string
  contentDirection: string
  wordRange: { min: number; max: number; value: string }
  textMode: "prompt" | "static"
  staticText: string
}

type SectionDimension = {
  section: SectionId
  slideCount: number
  textItems: TextItemDimension[]
  slides: Array<{ slideIndex: number; contentDirection: string }>
}

type DimensionsResponse = {
  automationId: string
  sections: SectionDimension[]
  tone: { value: string; preset: string }
  promptFormatting: {
    style: string
    narrative: string
    num_of_slides: number
  }
  enabledHookCount: number
}

type ExperimentCell = {
  cellId: string
  variant: Record<string, string>
  plan?: {
    hook: string
    slides: Array<{ id: string; role: string; text: string }>
  }
  qa?: {
    valid: boolean
    findings: Array<{
      code: string
      severity: "error" | "warning"
      message: string
    }>
  }
  error?: string
}

type ExperimentResponse = {
  experimentId: string
  cells: ExperimentCell[]
}

type ExperimentView = ExperimentResponse & {
  candidates: string[]
  fieldKey: string
  fieldLabel: string
  repeats: number
}

const sectionLabels: Record<SectionId, string> = {
  hook: "Hook",
  body: "Body",
  cta: "CTA",
}

export function TestingFacility() {
  const [automations, setAutomations] = useState<AutomationRecord[]>([])
  const [automationId, setAutomationId] = useState("")
  const [dimensions, setDimensions] = useState<DimensionsResponse | null>(null)
  const [sectionId, setSectionId] = useState<SectionId | "automation">("body")
  const [targetKey, setTargetKey] = useState("")
  const [field, setField] = useState<FieldDimension>("slideDirection")
  const [candidateText, setCandidateText] = useState("")
  const [allHooks, setAllHooks] = useState(true)
  const [repeats, setRepeats] = useState(1)
  const [seed, setSeed] = useState(4242)
  const [result, setResult] = useState<ExperimentView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    void fetch("/api/automations")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load automations")
        return (await response.json()) as { records?: AutomationRecord[] }
      })
      .then(({ records = [] }) =>
        setAutomations(
          records.filter(
            (record) => record.schema.automationKind === "slideshow"
          )
        )
      )
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load automations"
        )
      )
  }, [])

  useEffect(() => {
    if (!automationId) return
    void fetch(
      `/api/automations/${encodeURIComponent(automationId)}/experiment`
    )
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok)
          throw new Error(payload.error || "Could not load fields")
        return payload as DimensionsResponse
      })
      .then((response) => {
        const initialSection =
          response.sections.find((section) => section.section === "body") ??
          response.sections[0]
        const initialTarget = initialSection?.slides[0]
          ? `slide:${initialSection.slides[0].slideIndex}`
          : initialSection?.textItems[0]
            ? `item:${initialSection.textItems[0].itemId}`
            : "section"
        const initialField = initialTarget.startsWith("slide:")
          ? "slideDirection"
          : initialTarget.startsWith("item:")
            ? "itemDirection"
            : "slideCount"
        setDimensions(response)
        setSectionId(initialSection?.section ?? "body")
        setTargetKey(initialTarget)
        setField(initialField)
        setCandidateText(
          currentFieldValue(
            response,
            initialSection?.section ?? "body",
            initialTarget,
            initialField
          )
        )
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load fields"
        )
      )
  }, [automationId])

  const selectedSection = useMemo(
    () =>
      sectionId === "automation"
        ? undefined
        : dimensions?.sections.find((section) => section.section === sectionId),
    [dimensions, sectionId]
  )
  const fieldOptions = optionsForTarget(sectionId, targetKey)
  const candidates = parseValues(candidateText)
  const grid = useMemo(() => experimentGrid(result), [result])

  function chooseSection(nextSection: SectionId | "automation") {
    setSectionId(nextSection)
    setResult(null)
    if (nextSection === "automation") {
      chooseTarget(nextSection, "automation", "tone")
      return
    }
    const section = dimensions?.sections.find(
      (candidate) => candidate.section === nextSection
    )
    const nextTarget = section?.slides[0]
      ? `slide:${section.slides[0].slideIndex}`
      : section?.textItems[0]
        ? `item:${section.textItems[0].itemId}`
        : "section"
    chooseTarget(nextSection, nextTarget)
  }

  function chooseTarget(
    activeSection: SectionId | "automation",
    nextTarget: string,
    forcedField?: FieldDimension
  ) {
    const nextField =
      forcedField ?? optionsForTarget(activeSection, nextTarget)[0]?.value
    if (!nextField) return
    setResult(null)
    setTargetKey(nextTarget)
    setField(nextField)
    setCandidateText(
      dimensions
        ? currentFieldValue(dimensions, activeSection, nextTarget, nextField)
        : ""
    )
  }

  function chooseField(nextField: FieldDimension) {
    setField(nextField)
    setResult(null)
    setCandidateText(
      dimensions
        ? currentFieldValue(dimensions, sectionId, targetKey, nextField)
        : ""
    )
  }

  async function runExperiment() {
    if (!automationId || !dimensions) return
    if (candidates.length === 0) {
      setError("Add at least one candidate value")
      return
    }
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const variation = buildVariation(sectionId, targetKey, field, candidates)
      const response = await fetch(
        `/api/automations/${encodeURIComponent(automationId)}/experiment`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            vary: [variation],
            allHooks,
            repeats,
            seed,
          }),
        }
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Experiment failed")
      setResult({
        ...(payload as ExperimentResponse),
        candidates,
        fieldKey: variationKey(variation),
        fieldLabel: selectedFieldLabel(dimensions, sectionId, targetKey, field),
        repeats,
      })
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Experiment failed"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="max-w-3xl space-y-2">
        <div className="flex items-center gap-2 text-app-muted-text">
          <IconFlask className="size-5" />
          <span className="text-role-label">Testing facility</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          Compare prompt fields
        </h1>
        <p className="text-sm leading-6 text-app-muted-text">
          Change one generation instruction, hold the saved automation steady,
          and compare the copy it produces. Experiments cannot save or publish.
        </p>
      </header>

      <section className="rounded-dialog border border-app-panel-border bg-app-surface-raised p-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
          <div className="space-y-5">
            <Field label="Choose automation">
              <select
                value={automationId}
                onChange={(event) => {
                  setError("")
                  setDimensions(null)
                  setTargetKey("")
                  setCandidateText("")
                  setResult(null)
                  setAutomationId(event.target.value)
                }}
                className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-surface-raised px-3 text-sm text-app-text"
              >
                <option value="">Select a saved automation</option>
                {automations.map((automation) => (
                  <option key={automation.id} value={automation.id}>
                    {automation.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Section">
                <select
                  value={sectionId}
                  disabled={!dimensions}
                  onChange={(event) =>
                    chooseSection(
                      event.target.value as SectionId | "automation"
                    )
                  }
                  className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text disabled:opacity-50"
                >
                  <option value="automation">Automation-wide</option>
                  {dimensions?.sections.map((section) => (
                    <option key={section.section} value={section.section}>
                      {sectionLabels[section.section]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Slide or text item">
                <select
                  value={targetKey}
                  disabled={!dimensions}
                  onChange={(event) =>
                    chooseTarget(sectionId, event.target.value)
                  }
                  className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text disabled:opacity-50"
                >
                  {sectionId === "automation" ? (
                    <option value="automation">Automation prompts</option>
                  ) : (
                    <>
                      {selectedSection?.slides.map((slide) => (
                        <option
                          key={`slide-${slide.slideIndex}`}
                          value={`slide:${slide.slideIndex}`}
                        >
                          Slide {slide.slideIndex}
                        </option>
                      ))}
                      {selectedSection?.textItems.map((item) => (
                        <option
                          key={`item-${item.itemId}`}
                          value={`item:${item.itemId}`}
                        >
                          {item.label}
                        </option>
                      ))}
                      <option value="section">Section settings</option>
                    </>
                  )}
                </select>
              </Field>

              <Field label="Field">
                <select
                  value={field}
                  disabled={!dimensions}
                  onChange={(event) =>
                    chooseField(event.target.value as FieldDimension)
                  }
                  className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text disabled:opacity-50"
                >
                  {fieldOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Candidate values">
              <textarea
                value={candidateText}
                disabled={!dimensions}
                onChange={(event) => {
                  setCandidateText(event.target.value)
                  setResult(null)
                }}
                rows={7}
                placeholder="Enter one prompt direction per line"
                className="lc-focus-ring w-full resize-y rounded-control border border-app-panel-border bg-app-control-bg px-3 py-2.5 text-sm leading-6 text-app-text placeholder:text-app-text-faint disabled:opacity-50"
              />
              <p className="text-xs leading-5 text-app-muted-text">
                One candidate per line. The saved value is loaded first so you
                can edit it or add alternatives below.
              </p>
            </Field>
          </div>

          <aside className="space-y-5 border-t border-app-panel-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-app-surface-subtle text-app-action">
                <IconSparkles className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-app-text">
                  Controlled comparison
                </h2>
                <p className="mt-1 text-xs leading-5 text-app-muted-text">
                  Every candidate in the same repeat shares hook and image
                  draws. Only this field changes.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Repeats">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={repeats}
                  onChange={(event) => setRepeats(Number(event.target.value))}
                  className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text"
                />
              </Field>
              <Field label="Seed">
                <input
                  type="number"
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value))}
                  className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 font-mono text-sm text-app-text"
                />
              </Field>
            </div>

            <label className="flex min-h-10 items-center gap-3 rounded-control border border-app-panel-border px-3 text-sm font-medium text-app-text transition-colors hover:bg-app-control-hover">
              <input
                type="checkbox"
                className="accent-app-action"
                checked={allHooks}
                onChange={(event) => setAllHooks(event.target.checked)}
              />
              <span>
                Test all hooks
                <span className="ml-2 text-xs font-normal text-app-muted-text">
                  {dimensions
                    ? `${dimensions.enabledHookCount} enabled`
                    : "Uses the enabled hook pool"}
                </span>
              </span>
            </label>

            <div className="border-t border-app-panel-border pt-4">
              <p className="text-xs leading-5 text-app-muted-text">
                {candidates.length || 0} candidate
                {candidates.length === 1 ? "" : "s"} × {repeats || 0} repeat
                {repeats === 1 ? "" : "s"}
                {allHooks && dimensions
                  ? ` × ${dimensions.enabledHookCount} hooks`
                  : ""}
                . Maximum 200 synchronous cells.
              </p>
              <Button
                variant="action"
                size="appDefault"
                className="mt-3 w-full"
                disabled={
                  !automationId ||
                  !dimensions ||
                  candidates.length === 0 ||
                  loading
                }
                onClick={() => void runExperiment()}
              >
                {loading ? "Running previews..." : "Run experiment"}
              </Button>
            </div>
          </aside>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-control bg-app-danger-surface p-3 text-sm text-app-danger"
          >
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </section>

      <ResultsGrid grid={grid} result={result} />
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-role-label text-app-text">{label}</h2>
      {children}
    </div>
  )
}

function ResultsGrid({
  grid,
  result,
}: {
  grid: ReturnType<typeof experimentGrid>
  result: ExperimentView | null
}) {
  if (!result) {
    return (
      <section className="rounded-dialog border border-dashed border-app-panel-border bg-app-surface-raised px-6 py-12 text-center">
        <IconFlask className="mx-auto size-6 text-app-muted-text" />
        <h2 className="mt-3 text-heading font-semibold text-app-text">
          No test runs yet
        </h2>
        <p className="mt-1 text-sm text-app-muted-text">
          Choose a prompt field to compare generated copy and QA findings.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-heading font-semibold text-app-text">Results</h2>
        <p className="text-sm text-app-muted-text">
          Varied field:{" "}
          <span className="font-medium text-app-text">{result.fieldLabel}</span>
          . Rows are candidate values; columns are repeats.
        </p>
      </div>
      <div className="overflow-x-auto rounded-dialog border border-app-panel-border bg-app-surface-raised">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr className="bg-app-surface-subtle">
              <th className="sticky left-0 min-w-64 border-r border-app-panel-border bg-app-surface-subtle p-3 text-xs font-semibold text-app-muted-text">
                Candidate value
              </th>
              {grid.columns.map((column) => (
                <th
                  key={column.key}
                  className="min-w-80 border-l border-app-panel-border p-3 font-mono text-xs font-medium text-app-text"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.value} className="align-top">
                <th className="sticky left-0 max-w-80 border-t border-r border-app-panel-border bg-app-surface-raised p-3 text-sm leading-5 font-medium text-app-text">
                  {row.value}
                </th>
                {grid.columns.map((column) => (
                  <td
                    key={column.key}
                    className="border-t border-l border-app-panel-border p-3"
                  >
                    <div className="space-y-3">
                      {row.cells
                        .get(column.key)
                        ?.map((cell) => (
                          <ResultCell key={cell.cellId} cell={cell} />
                        )) ?? (
                        <span className="text-xs text-app-muted-text">
                          No preview
                        </span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ResultCell({ cell }: { cell: ExperimentCell }) {
  if (cell.error && !cell.plan) {
    return (
      <div className="rounded-card bg-app-danger-surface p-3 text-sm text-app-danger">
        {cell.error}
      </div>
    )
  }
  return (
    <article className="space-y-3 rounded-card border border-app-panel-border p-3">
      <div className="flex items-center gap-2">
        {cell.qa?.valid ? (
          <IconCheck className="size-4 text-app-success" />
        ) : (
          <IconAlertTriangle className="size-4 text-app-danger" />
        )}
        <span className="text-xs font-medium text-app-muted-text">
          {cell.qa?.valid ? "QA passed" : "Review findings"}
        </span>
      </div>
      <p className="text-sm leading-5 font-semibold text-app-text">
        {cell.plan?.hook}
      </p>
      <div className="space-y-1.5">
        {cell.plan?.slides.map((slide) => (
          <div
            key={slide.id}
            className="grid grid-cols-[auto_1fr] gap-2 text-xs leading-5"
          >
            <span className="font-mono text-app-muted-text">{slide.role}</span>
            <p className="text-app-text">{slide.text}</p>
          </div>
        ))}
      </div>
      {cell.qa?.findings.length ? (
        <ul className="space-y-1 border-t border-app-panel-border pt-2">
          {cell.qa.findings.map((finding, index) => (
            <li
              key={`${finding.code}-${index}`}
              className="text-xs leading-5 text-app-muted-text"
            >
              <span className="font-mono text-app-text">{finding.code}</span>{" "}
              {finding.message}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

function optionsForTarget(
  section: SectionId | "automation",
  targetKey: string
): Array<{ value: FieldDimension; label: string }> {
  if (section === "automation") {
    return [
      { value: "tone", label: "Tone" },
      { value: "promptFormatting", label: "Prompt formatting" },
    ]
  }
  if (targetKey.startsWith("slide:")) {
    return [{ value: "slideDirection", label: "Content direction" }]
  }
  if (targetKey.startsWith("item:")) {
    return [
      { value: "itemDirection", label: "Content direction" },
      { value: "wordRange", label: "Word range" },
      { value: "staticText", label: "Static text" },
    ]
  }
  return [{ value: "slideCount", label: "Slide count" }]
}

function currentFieldValue(
  dimensions: DimensionsResponse,
  sectionId: SectionId | "automation",
  targetKey: string,
  field: FieldDimension
) {
  if (field === "tone") return dimensions.tone.value
  if (field === "promptFormatting") return dimensions.promptFormatting.style
  if (sectionId === "automation") return ""
  const section = dimensions.sections.find(
    (candidate) => candidate.section === sectionId
  )
  if (!section) return ""
  if (field === "slideCount") return String(section.slideCount)
  if (targetKey.startsWith("slide:")) {
    const slideIndex = Number(targetKey.slice("slide:".length))
    return (
      section.slides.find((slide) => slide.slideIndex === slideIndex)
        ?.contentDirection ?? ""
    )
  }
  const itemId = targetKey.slice("item:".length)
  const item = section.textItems.find(
    (candidate) => candidate.itemId === itemId
  )
  if (!item) return ""
  if (field === "itemDirection") return item.contentDirection
  if (field === "wordRange") return item.wordRange.value
  if (field === "staticText") return item.staticText
  return ""
}

function buildVariation(
  sectionId: SectionId | "automation",
  targetKey: string,
  field: FieldDimension,
  values: string[]
) {
  if (field === "tone" || field === "promptFormatting") {
    return { dimension: field, values } as const
  }
  if (sectionId === "automation") {
    throw new Error("Choose an automation-wide prompt field")
  }
  if (field === "slideDirection") {
    return {
      dimension: field,
      target: {
        section: sectionId,
        slideIndex: Number(targetKey.slice("slide:".length)),
      },
      values,
    } as const
  }
  if (
    field === "itemDirection" ||
    field === "wordRange" ||
    field === "staticText"
  ) {
    return {
      dimension: field,
      target: {
        section: sectionId,
        itemId: targetKey.slice("item:".length),
      },
      values,
    } as const
  }
  return {
    dimension: "slideCount" as const,
    target: { section: sectionId },
    values,
  }
}

function variationKey(variation: ReturnType<typeof buildVariation>) {
  if (variation.dimension === "slideDirection") {
    return `${variation.dimension}:${variation.target.section}:${variation.target.slideIndex}`
  }
  if (
    variation.dimension === "itemDirection" ||
    variation.dimension === "wordRange" ||
    variation.dimension === "staticText"
  ) {
    return `${variation.dimension}:${variation.target.section}:${variation.target.itemId}`
  }
  if (variation.dimension === "slideCount") {
    return `${variation.dimension}:${variation.target.section}`
  }
  return variation.dimension
}

function selectedFieldLabel(
  dimensions: DimensionsResponse,
  sectionId: SectionId | "automation",
  targetKey: string,
  field: FieldDimension
) {
  const fieldLabel =
    optionsForTarget(sectionId, targetKey).find(
      (option) => option.value === field
    )?.label ?? field
  if (sectionId === "automation") return fieldLabel
  const sectionLabel = sectionLabels[sectionId]
  if (targetKey.startsWith("slide:")) {
    return `${sectionLabel} · slide ${targetKey.slice("slide:".length)} · ${fieldLabel}`
  }
  if (targetKey.startsWith("item:")) {
    const itemId = targetKey.slice("item:".length)
    const item = dimensions.sections
      .find((section) => section.section === sectionId)
      ?.textItems.find((candidate) => candidate.itemId === itemId)
    return `${sectionLabel} · ${item?.label ?? itemId} · ${fieldLabel}`
  }
  return `${sectionLabel} · ${fieldLabel}`
}

function parseValues(value = "") {
  return [...new Set(value.split("\n").map((item) => item.trim()))].filter(
    Boolean
  )
}

function experimentGrid(result: ExperimentView | null) {
  if (!result) return { columns: [], rows: [] }
  const columns = Array.from({ length: result.repeats }, (_, index) => ({
    key: String(index + 1),
    label: `Repeat ${index + 1}`,
  }))
  const rows = result.candidates.map((value) => {
    const cells = new Map<string, ExperimentCell[]>()
    for (const cell of result.cells) {
      if (cell.variant[result.fieldKey] !== value) continue
      const repeat = cell.variant.repeat ?? "1"
      cells.set(repeat, [...(cells.get(repeat) ?? []), cell])
    }
    return { value, cells }
  })
  return { columns, rows }
}
