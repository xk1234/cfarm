"use client"

import { useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconCheck, IconFlask } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { AutomationRecord } from "@/lib/automations"

type VariableDimension = {
  token: string
  variableName: string
  source: "derived" | "override" | "missing"
  collectionId?: string
  collectionName?: string
  sweepable: boolean
  reason?: string
  sampleValues: string[]
}

type FixedDimension = {
  name: string
  label: string
  token: string
  reason: string
}

type AutomationLevelDimension = {
  dimension: "contentDirection" | "tone" | "model"
  name?: string
  label: string
  currentValue: string
  sampleValues: string[]
}

type DimensionsResponse = {
  automationDimensions: AutomationLevelDimension[]
  variables: VariableDimension[]
  fixed: FixedDimension[]
  enabledHookCount: number
}

type ExperimentDimensionChoice = {
  key: string
  dimension: "contentDirection" | "tone" | "model" | "variable"
  name?: string
  label: string
  detail?: string
  currentValue?: string
  sampleValues: string[]
  sweepable: boolean
  reason?: string
}

type ExperimentCell = {
  cellId: string
  variant: Record<string, string>
  plan?: {
    hook: string
    hookSubstitutions?: Record<string, string>
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

export function TestingFacility() {
  const [automations, setAutomations] = useState<AutomationRecord[]>([])
  const [automationId, setAutomationId] = useState("")
  const [dimensions, setDimensions] = useState<DimensionsResponse | null>(null)
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([])
  const [variationValues, setVariationValues] = useState<
    Record<string, string>
  >({})
  const [allHooks, setAllHooks] = useState(true)
  const [repeats, setRepeats] = useState(1)
  const [seed, setSeed] = useState(4242)
  const [result, setResult] = useState<ExperimentResponse | null>(null)
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
          throw new Error(payload.error || "Could not load inputs")
        return payload as DimensionsResponse
      })
      .then(setDimensions)
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load inputs"
        )
      )
  }, [automationId])

  const grid = useMemo(() => experimentGrid(result?.cells ?? []), [result])
  const choices = useMemo(() => dimensionChoices(dimensions), [dimensions])

  async function runExperiment() {
    if (!automationId) return
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const vary = selectedDimensions.map((key) => {
        const choice = choices.find((candidate) => candidate.key === key)
        if (!choice)
          throw new Error("A chosen dimension is no longer available")
        return {
          dimension: choice.dimension,
          name: choice.name,
          values: parseValues(variationValues[key]),
        }
      })
      if (vary.some((variation) => variation.values.length === 0)) {
        throw new Error("Add at least one variation for every chosen dimension")
      }
      const response = await fetch(
        `/api/automations/${encodeURIComponent(automationId)}/experiment`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ vary, allHooks, repeats, seed }),
        }
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Experiment failed")
      setResult(payload as ExperimentResponse)
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
          Compare automation previews
        </h1>
        <p className="text-sm leading-6 text-app-muted-text">
          Hold a saved automation steady, move selected inputs, and inspect
          every preview. Experiments cannot save or publish.
        </p>
      </header>

      <section className="rounded-dialog border border-app-panel-border bg-app-surface-raised p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Choose automation">
            <select
              value={automationId}
              onChange={(event) => {
                setError("")
                setDimensions(null)
                setSelectedDimensions([])
                setVariationValues({})
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

          <Field label="Choose variables">
            <div className="min-h-10 rounded-control border border-app-panel-border bg-app-surface-subtle p-2">
              {!automationId ? (
                <p className="px-1 py-1 text-xs text-app-muted-text">
                  Choose an automation first.
                </p>
              ) : !dimensions ? (
                <div className="h-6 animate-pulse rounded-control bg-app-control-hover" />
              ) : (
                <div className="space-y-3">
                  <div>
                    <h3 className="px-2 pb-1 text-xs font-semibold text-app-text">
                      Automation-level inputs
                    </h3>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {choices
                        .filter((choice) => choice.dimension !== "variable")
                        .map((choice) => (
                          <DimensionOption
                            key={choice.key}
                            choice={choice}
                            selected={selectedDimensions.includes(choice.key)}
                            onChange={(checked) =>
                              setSelectedDimensions((current) =>
                                checked
                                  ? [...current, choice.key]
                                  : current.filter((key) => key !== choice.key)
                              )
                            }
                          />
                        ))}
                    </div>
                  </div>
                  <div className="border-t border-app-panel-border pt-3">
                    <h3 className="px-2 pb-1 text-xs font-semibold text-app-muted-text">
                      Hook variables
                    </h3>
                    {dimensions.variables.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-app-muted-text">
                        This automation has no hook variables.
                      </p>
                    ) : (
                      <div className="grid gap-1 sm:grid-cols-2">
                        {choices
                          .filter((choice) => choice.dimension === "variable")
                          .map((choice) => (
                            <DimensionOption
                              key={choice.key}
                              choice={choice}
                              selected={selectedDimensions.includes(choice.key)}
                              onChange={(checked) =>
                                setSelectedDimensions((current) =>
                                  checked
                                    ? [...current, choice.key]
                                    : current.filter(
                                        (key) => key !== choice.key
                                      )
                                )
                              }
                            />
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Field>

          <Field label="Choose variations">
            <div className="space-y-3">
              {selectedDimensions.length === 0 ? (
                <p className="rounded-control border border-dashed border-app-panel-border p-3 text-xs text-app-muted-text">
                  Select an input, then enter one variation per line or separate
                  them with commas.
                </p>
              ) : (
                selectedDimensions.map((key) => {
                  const choice = choices.find(
                    (candidate) => candidate.key === key
                  )
                  if (!choice) return null
                  const placeholder =
                    choice.dimension === "contentDirection"
                      ? "One variation per line or comma-separated"
                      : choice.sampleValues.join(", ")
                  return (
                    <div key={key} className="space-y-1.5">
                      <label
                        htmlFor={`variations-${key}`}
                        className="text-xs font-medium text-app-text"
                      >
                        {choice.label}
                      </label>
                      {choice.dimension === "contentDirection" ? (
                        <textarea
                          id={`variations-${key}`}
                          rows={3}
                          value={variationValues[key] ?? ""}
                          onChange={(event) =>
                            setVariationValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          placeholder={placeholder}
                          className="lc-focus-ring min-h-20 w-full resize-y rounded-control border border-app-panel-border bg-app-control-bg px-3 py-2 text-sm text-app-text placeholder:text-app-text-faint"
                        />
                      ) : (
                        <input
                          id={`variations-${key}`}
                          value={variationValues[key] ?? ""}
                          onChange={(event) =>
                            setVariationValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          placeholder={placeholder}
                          className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text placeholder:text-app-text-faint"
                        />
                      )}
                      {choice.currentValue ? (
                        <p className="text-xs text-app-muted-text">
                          Current: {choice.currentValue}
                        </p>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </Field>

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
                className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text"
              />
            </Field>
            <label className="col-span-2 flex min-h-10 items-center gap-3 rounded-control border border-app-panel-border px-3 text-sm font-medium text-app-text">
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
          </div>
        </div>

        {dimensions?.fixed.length ? (
          <details className="mt-5 border-t border-app-panel-border pt-4">
            <summary className="cursor-pointer text-xs font-medium text-app-muted-text">
              Runtime variables are fixed
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {dimensions.fixed.map((variable) => (
                <span
                  key={variable.name}
                  title={variable.reason}
                  className="rounded-full border border-app-panel-border bg-app-surface-subtle px-2.5 py-1 font-mono text-xs text-app-muted-text"
                >
                  {variable.token}
                </span>
              ))}
            </div>
          </details>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-4 border-t border-app-panel-border pt-4">
          <p className="text-xs text-app-muted-text">
            Maximum 200 synchronous cells. Each cell can make a model call.
          </p>
          <Button
            variant="action"
            size="appDefault"
            disabled={!automationId || loading}
            onClick={() => void runExperiment()}
          >
            {loading ? "Running previews..." : "Run experiment"}
          </Button>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-control bg-app-danger-surface p-3 text-sm text-app-danger"
          >
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </section>

      <ResultsGrid grid={grid} hasResult={Boolean(result)} />
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

function DimensionOption({
  choice,
  selected,
  onChange,
}: {
  choice: ExperimentDimensionChoice
  selected: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      title={choice.reason ?? choice.currentValue}
      className="flex min-h-10 items-start gap-2 rounded-control px-2 py-2 text-xs text-app-text hover:bg-app-control-hover"
    >
      <input
        type="checkbox"
        className="mt-0.5 accent-app-action"
        disabled={!choice.sweepable}
        checked={selected}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span
          className={
            choice.dimension === "variable" ? "font-mono" : "font-medium"
          }
        >
          {choice.label}
        </span>
        <span className="block text-app-muted-text">
          {choice.detail ??
            (choice.currentValue
              ? `Current: ${choice.currentValue}`
              : "No current value")}
        </span>
      </span>
    </label>
  )
}

function ResultsGrid({
  grid,
  hasResult,
}: {
  grid: ReturnType<typeof experimentGrid>
  hasResult: boolean
}) {
  if (!hasResult) {
    return (
      <section className="rounded-dialog border border-dashed border-app-panel-border bg-app-surface-raised px-6 py-12 text-center">
        <IconFlask className="mx-auto size-6 text-app-muted-text" />
        <h2 className="mt-3 text-heading font-semibold text-app-text">
          No test runs yet
        </h2>
        <p className="mt-1 text-sm text-app-muted-text">
          Configure a sweep to compare generated copy and QA findings.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-heading font-semibold text-app-text">Results</h2>
        <p className="text-sm text-app-muted-text">
          Rows are hooks. Columns are variations.
        </p>
      </div>
      <div className="overflow-x-auto rounded-dialog border border-app-panel-border bg-app-surface-raised">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr className="bg-app-surface-subtle">
              <th className="sticky left-0 min-w-52 border-r border-app-panel-border bg-app-surface-subtle p-3 text-xs font-semibold text-app-muted-text">
                Hook
              </th>
              {grid.columns.map((column) => (
                <th
                  key={column}
                  className="min-w-80 border-l border-app-panel-border p-3 font-mono text-xs font-medium text-app-text"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.hook} className="align-top">
                <th className="sticky left-0 border-t border-r border-app-panel-border bg-app-surface-raised p-3 text-sm font-medium text-app-text">
                  {row.label}
                </th>
                {grid.columns.map((column) => (
                  <td
                    key={column}
                    className="border-t border-l border-app-panel-border p-3"
                  >
                    {row.cells
                      .get(column)
                      ?.map((cell) => (
                        <ResultCell key={cell.cellId} cell={cell} />
                      )) ?? (
                      <span className="text-xs text-app-muted-text">
                        No preview
                      </span>
                    )}
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
          <p key={slide.id} className="text-xs leading-5 text-app-text">
            {slide.text}
          </p>
        ))}
      </div>
      {Object.keys(cell.plan?.hookSubstitutions ?? {}).length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 border-t border-app-panel-border pt-2 font-mono text-xs">
          {Object.entries(cell.plan?.hookSubstitutions ?? {}).map(
            ([name, value]) => (
              <div key={name} className="contents">
                <dt className="text-app-muted-text">{name}</dt>
                <dd className="text-app-text">{value}</dd>
              </div>
            )
          )}
        </dl>
      ) : null}
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

function parseValues(value = "") {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()))].filter(
    Boolean
  )
}

function dimensionChoices(
  dimensions: DimensionsResponse | null
): ExperimentDimensionChoice[] {
  if (!dimensions) return []
  return [
    ...dimensions.automationDimensions.map((dimension) => ({
      ...dimension,
      key: `${dimension.dimension}:${dimension.name ?? ""}`,
      sweepable: true,
    })),
    ...dimensions.variables.map((variable) => ({
      key: `variable:${variable.variableName}`,
      dimension: "variable" as const,
      name: variable.variableName,
      label: variable.token,
      detail: variable.sweepable ? variable.collectionName : variable.reason,
      sampleValues: variable.sampleValues,
      sweepable: variable.sweepable,
      reason: variable.reason,
    })),
  ]
}

function experimentGrid(cells: ExperimentCell[]) {
  const columns = [
    ...new Set(
      cells.map(
        (cell) =>
          Object.entries(cell.variant)
            .filter(([key]) => key !== "hook" && key !== "repeat")
            .map(([key, value]) => `${key}=${value}`)
            .join(", ") || "Baseline"
      )
    ),
  ]
  const rowsByHook = new Map<
    string,
    {
      hook: string
      label: string
      cells: Map<string, ExperimentCell[]>
    }
  >()
  for (const cell of cells) {
    const hook = cell.variant.hook || cell.plan?.hook || "Selected hook"
    const column =
      Object.entries(cell.variant)
        .filter(([key]) => key !== "hook" && key !== "repeat")
        .map(([key, value]) => `${key}=${value}`)
        .join(", ") || "Baseline"
    const row = rowsByHook.get(hook) ?? {
      hook,
      label: cell.plan?.hook || hook,
      cells: new Map<string, ExperimentCell[]>(),
    }
    row.cells.set(column, [...(row.cells.get(column) ?? []), cell])
    rowsByHook.set(hook, row)
  }
  return { columns, rows: [...rowsByHook.values()] }
}
