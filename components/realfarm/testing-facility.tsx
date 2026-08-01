"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFlask,
  IconSearch,
} from "@tabler/icons-react";
import { DropdownMenu } from "radix-ui";

import { Button } from "@/components/ui/button";
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal";
import type { AutomationRecord } from "@/lib/automations";
import { cn } from "@/lib/utils";

type VariableDimension = {
  token: string;
  variableName: string;
  source: "derived" | "override" | "missing";
  collectionId?: string;
  collectionName?: string;
  sweepable: boolean;
  reason?: string;
  sampleValues: string[];
};

type FixedDimension = {
  name: string;
  label: string;
  token: string;
  reason: string;
};

type AutomationLevelDimension = {
  dimension: "contentDirection" | "tone" | "model";
  name?: string;
  slideIndex?: number;
  label: string;
  currentValue: string;
  sampleValues: string[];
};

type DimensionsResponse = {
  automationDimensions: AutomationLevelDimension[];
  variables: VariableDimension[];
  fixed: FixedDimension[];
};

type ExperimentDimensionChoice = {
  key: string;
  dimension: "contentDirection" | "tone" | "model";
  name?: string;
  slideIndex?: number;
  label: string;
  currentValue?: string;
  sampleValues: string[];
  sweepable: boolean;
  reason?: string;
};

type TemplateSampleRecord = {
  id: string;
  name: string;
  automationKind?: "slideshow" | "video" | "ugc";
  schema: {
    tone?: { value?: string };
    formatting?: Array<{
      id: string;
      textItems?: Array<{
        contentDirection?: string;
      }>;
      slideOverrides?: Array<{
        slideIndex: number;
        contentDirection: string;
      }>;
    }>;
  };
};

type VariationSample = {
  id: string;
  value: string;
  group: "Current automation" | "Suggested" | "Automation templates";
  source: string;
};

type ExperimentCell = {
  cellId: string;
  variant: Record<string, string>;
  plan?: {
    title?: string;
    caption?: string;
    hashtags?: string;
    hook: string;
    hookTemplate?: string;
    hookSubstitutions?: Record<string, string>;
    imageCollectionIds?: string[];
    textModel?: string;
    slides: Array<{
      id: string;
      role: string;
      text: string;
      imageUrl?: string;
      imageCaption?: string;
    }>;
    debug?: {
      selectedHookIndex?: number;
      textSimilarityRetry?: boolean;
      textModelPrompt?: unknown;
      textGenerationResult?: unknown;
      textTransformations?: unknown;
      webSearchSources?: unknown;
    };
  };
  qa?: {
    valid: boolean;
    findings: Array<{
      code: string;
      severity: "error" | "warning";
      message: string;
    }>;
  };
  error?: string;
};

type ExperimentResponse = {
  experimentId: string;
  cells: ExperimentCell[];
};

export function TestingFacility() {
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [automationId, setAutomationId] = useState("");
  const [dimensions, setDimensions] = useState<DimensionsResponse | null>(null);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [variationValues, setVariationValues] = useState<
    Record<string, string>
  >({});
  const [repeats, setRepeats] = useState(1);
  const [result, setResult] = useState<ExperimentResponse | null>(null);
  const [samplePickerKey, setSamplePickerKey] = useState<string | null>(null);
  const [templateSamples, setTemplateSamples] = useState<
    TemplateSampleRecord[] | null
  >(null);
  const [templateSamplesLoading, setTemplateSamplesLoading] = useState(false);
  const [templateSamplesError, setTemplateSamplesError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/automations")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load automations");
        return (await response.json()) as { records?: AutomationRecord[] };
      })
      .then(({ records = [] }) =>
        setAutomations(
          records.filter(
            (record) => record.schema.automationKind === "slideshow",
          ),
        ),
      )
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load automations",
        ),
      );
  }, []);

  useEffect(() => {
    if (!automationId) return;
    void fetch(
      `/api/automations/${encodeURIComponent(automationId)}/experiment`,
    )
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Could not load inputs");
        return payload as DimensionsResponse;
      })
      .then(setDimensions)
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load inputs",
        ),
      );
  }, [automationId]);

  const grid = useMemo(() => experimentGrid(result?.cells ?? []), [result]);
  const choices = useMemo(() => dimensionChoices(dimensions), [dimensions]);
  const samplePickerChoice = choices.find(
    (choice) => choice.key === samplePickerKey,
  );

  async function openSamplePicker(key: string) {
    setSamplePickerKey(key);
    if (templateSamples || templateSamplesLoading) return;

    setTemplateSamplesLoading(true);
    setTemplateSamplesError("");
    try {
      const response = await fetch("/api/automation-templates");
      const payload = (await response.json()) as {
        error?: string;
        records?: TemplateSampleRecord[];
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not load template samples");
      }
      setTemplateSamples(
        (payload.records ?? []).filter(
          (record) =>
            record.automationKind !== "video" &&
            record.automationKind !== "ugc",
        ),
      );
    } catch (loadError) {
      setTemplateSamplesError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load template samples",
      );
    } finally {
      setTemplateSamplesLoading(false);
    }
  }

  async function runExperiment() {
    if (!automationId) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const vary = selectedDimensions.map((key) => {
        const choice = choices.find((candidate) => candidate.key === key);
        if (!choice)
          throw new Error("A chosen dimension is no longer available");
        return {
          dimension: choice.dimension,
          name: choice.name,
          slideIndex: choice.slideIndex,
          values: parseValues(
            variationValues[key],
            choice.dimension === "contentDirection",
          ),
        };
      });
      if (vary.some((variation) => variation.values.length === 0)) {
        throw new Error(
          "Add at least one variation for every chosen dimension",
        );
      }
      const response = await fetch(
        `/api/automations/${encodeURIComponent(automationId)}/experiment`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ vary, repeats, textOnly: true }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Experiment failed");
      setResult(payload as ExperimentResponse);
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Experiment failed",
      );
    } finally {
      setLoading(false);
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
      </header>

      <section className="rounded-dialog border border-app-panel-border bg-app-surface-raised p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Choose automation">
            <select
              aria-label="Choose automation"
              value={automationId}
              onChange={(event) => {
                setError("");
                setDimensions(null);
                setSelectedDimensions([]);
                setVariationValues({});
                setResult(null);
                setAutomationId(event.target.value);
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

          <Field label="Choose inputs">
            <AutomationInputDropdown
              disabled={!automationId || !dimensions}
              loading={Boolean(automationId && !dimensions)}
              choices={choices}
              selected={selectedDimensions}
              onChange={setSelectedDimensions}
            />
          </Field>

          <Field label="Choose variations">
            <div className="space-y-3">
              {selectedDimensions.length === 0 ? (
                <p className="rounded-control border border-dashed border-app-panel-border p-3 text-xs text-app-muted-text">
                  Select an input, then enter the variations to compare.
                </p>
              ) : (
                selectedDimensions.map((key) => {
                  const choice = choices.find(
                    (candidate) => candidate.key === key,
                  );
                  if (!choice) return null;
                  const placeholder =
                    choice.dimension === "contentDirection"
                      ? "One variation per line"
                      : choice.sampleValues.join(", ");
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor={`variations-${key}`}
                          className="text-xs font-medium text-app-text"
                        >
                          {choice.label}
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => void openSamplePicker(key)}
                        >
                          Browse samples
                        </Button>
                      </div>
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
                    </div>
                  );
                })
              )}
            </div>
          </Field>

          <Field label="Repeats">
            <input
              aria-label="Repeats"
              type="number"
              min={1}
              max={20}
              value={repeats}
              onChange={(event) => setRepeats(Number(event.target.value))}
              className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg px-3 text-sm text-app-text"
            />
          </Field>
        </div>

        {dimensions &&
        (dimensions.variables.length > 0 || dimensions.fixed.length > 0) ? (
          <details className="mt-5 border-t border-app-panel-border pt-4">
            <summary className="cursor-pointer text-xs font-medium text-app-muted-text">
              Reusable and runtime variables are fixed
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...dimensions.variables, ...dimensions.fixed].map(
                (variable) => (
                  <span
                    key={
                      "variableName" in variable
                        ? variable.variableName
                        : variable.name
                    }
                    title={
                      "variableName" in variable
                        ? "Reusable variables keep their configured values across comparison previews."
                        : variable.reason
                    }
                    className="rounded-full border border-app-panel-border bg-app-surface-subtle px-2.5 py-1 font-mono text-xs text-app-muted-text"
                  >
                    {variable.token}
                  </span>
                ),
              )}
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

      {samplePickerChoice ? (
        <VariationSamplesModal
          choice={samplePickerChoice}
          existingValue={variationValues[samplePickerChoice.key] ?? ""}
          templateRecords={templateSamples ?? []}
          loadingTemplates={templateSamplesLoading}
          templatesError={templateSamplesError}
          onClose={() => setSamplePickerKey(null)}
          onAdd={(values) => {
            setVariationValues((current) => ({
              ...current,
              [samplePickerChoice.key]: mergeVariationValues(
                current[samplePickerChoice.key],
                values,
                samplePickerChoice.dimension === "contentDirection",
              ),
            }));
            setSamplePickerKey(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-role-label text-app-text">{label}</h2>
      {children}
    </div>
  );
}

function AutomationInputDropdown({
  disabled,
  loading,
  choices,
  selected,
  onChange,
}: {
  disabled: boolean;
  loading: boolean;
  choices: ExperimentDimensionChoice[];
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const label = loading
    ? "Loading inputs..."
    : selected.length === 0
      ? "Select inputs to compare"
      : selected.length === 1
        ? choices.find((choice) => choice.key === selected[0])?.label
        : `${selected.length} inputs selected`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className="lc-focus-ring flex h-10 w-full items-center justify-between gap-3 rounded-control border border-app-panel-border bg-app-control-bg px-3 text-left text-sm text-app-text disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Choose automation-level inputs"
        >
          <span className="truncate">
            {disabled && !loading ? "Choose an automation first" : label}
          </span>
          <IconChevronDown className="size-4 shrink-0 text-app-muted-text" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="start"
          className="app-popover z-[120] max-h-80 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto p-1"
        >
          {choices.map((choice) => {
            const checked = selected.includes(choice.key);
            return (
              <DropdownMenu.CheckboxItem
                key={choice.key}
                checked={checked}
                disabled={!choice.sweepable}
                title={choice.reason ?? choice.currentValue}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() =>
                  onChange(
                    checked
                      ? selected.filter((key) => key !== choice.key)
                      : [...selected, choice.key],
                  )
                }
                className={cn(
                  "relative flex cursor-default items-center rounded-control py-2 pr-9 pl-3 text-xs text-app-text outline-none data-[disabled]:text-app-muted-text data-[highlighted]:bg-app-control-hover",
                  !choice.sweepable && "cursor-not-allowed",
                )}
              >
                <span className="min-w-0 truncate">{choice.label}</span>
                <DropdownMenu.ItemIndicator className="absolute right-3">
                  <IconCheck className="size-3.5" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function VariationSamplesModal({
  choice,
  existingValue,
  templateRecords,
  loadingTemplates,
  templatesError,
  onClose,
  onAdd,
}: {
  choice: ExperimentDimensionChoice;
  existingValue: string;
  templateRecords: TemplateSampleRecord[];
  loadingTemplates: boolean;
  templatesError: string;
  onClose: () => void;
  onAdd: (values: string[]) => void;
}) {
  const samples = useMemo(
    () => variationSamples(choice, templateRecords),
    [choice, templateRecords],
  );
  const existing = useMemo(
    () =>
      new Set(
        parseValues(existingValue, choice.dimension === "contentDirection").map(
          normalizeSampleValue,
        ),
      ),
    [choice.dimension, existingValue],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visibleSamples = samples.filter(
    (sample) =>
      !query ||
      sample.value.toLowerCase().includes(query) ||
      sample.source.toLowerCase().includes(query),
  );
  const grouped = groupVariationSamples(visibleSamples);

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="flex max-h-[min(760px,calc(100vh-2rem))] max-w-3xl flex-col overflow-hidden">
        <AppModalHeader
          title={`Choose samples for ${choice.label}`}
          onClose={onClose}
        />
        <div className="border-b border-app-panel-border p-4">
          <label className="relative block">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-muted-text" />
            <input
              aria-label="Search variation samples"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search samples"
              className="lc-focus-ring h-10 w-full rounded-control border border-app-panel-border bg-app-control-bg pr-3 pl-9 text-sm text-app-text placeholder:text-app-text-faint"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {variationSampleGroups.map((group) => {
            const groupSamples = grouped.get(group) ?? [];
            if (groupSamples.length === 0) return null;
            return (
              <section key={group} className="mb-5 last:mb-0">
                <h3 className="mb-2 text-xs font-semibold text-app-muted-text">
                  {group}
                </h3>
                <div className="divide-y divide-app-panel-border overflow-hidden rounded-control border border-app-panel-border">
                  {groupSamples.map((sample) => {
                    const checked = selected.includes(sample.id);
                    const alreadyAdded = existing.has(
                      normalizeSampleValue(sample.value),
                    );
                    return (
                      <label
                        key={sample.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 bg-app-surface-raised px-3 py-2.5 hover:bg-app-control-hover",
                          alreadyAdded && "cursor-default opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0 accent-app-action"
                          checked={checked || alreadyAdded}
                          disabled={alreadyAdded}
                          onChange={() =>
                            setSelected((current) =>
                              checked
                                ? current.filter((id) => id !== sample.id)
                                : [...current, sample.id],
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-sm leading-5 text-app-text">
                            {sample.value}
                          </span>
                          <span className="mt-0.5 block text-xs text-app-muted-text">
                            {alreadyAdded ? "Already added" : sample.source}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {loadingTemplates ? (
            <div className="h-16 animate-pulse rounded-control bg-app-control-hover" />
          ) : null}
          {templatesError ? (
            <p className="rounded-control bg-app-danger-surface p-3 text-sm text-app-danger">
              {templatesError}
            </p>
          ) : null}
          {!loadingTemplates &&
          !templatesError &&
          visibleSamples.length === 0 ? (
            <p className="rounded-control border border-dashed border-app-panel-border p-4 text-sm text-app-muted-text">
              No matching samples.
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-app-panel-border p-4">
          <Button
            type="button"
            variant="softControl"
            size="appDefault"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="action"
            size="appDefault"
            disabled={selected.length === 0}
            onClick={() =>
              onAdd(
                selected.flatMap((id) => {
                  const sample = samples.find(
                    (candidate) => candidate.id === id,
                  );
                  return sample ? [sample.value] : [];
                }),
              )
            }
          >
            Add {selected.length || ""}{" "}
            {selected.length === 1 ? "variation" : "variations"}
          </Button>
        </div>
      </AppModalPanel>
    </AppModal>
  );
}

function ResultsGrid({
  grid,
  hasResult,
}: {
  grid: ReturnType<typeof experimentGrid>;
  hasResult: boolean;
}) {
  const [selectedCell, setSelectedCell] = useState<ExperimentCell | null>(null);
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
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-heading font-semibold text-app-text">Results</h2>
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
                        <ResultCell
                          key={cell.cellId}
                          cell={cell}
                          onSelect={() => setSelectedCell(cell)}
                        />
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
      {selectedCell ? (
        <OutputTraceModal
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
        />
      ) : null}
    </section>
  );
}

function ResultCell({
  cell,
  onSelect,
}: {
  cell: ExperimentCell;
  onSelect: () => void;
}) {
  if (cell.error && !cell.plan) {
    return (
      <div className="rounded-card bg-app-danger-surface p-3 text-sm text-app-danger">
        {cell.error}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-full space-y-3 rounded-card border border-app-panel-border p-3 text-left transition-colors hover:border-app-action/40 hover:bg-app-surface-subtle focus-visible:ring-2 focus-visible:ring-app-action/30 focus-visible:outline-none"
    >
      <div className="flex items-center gap-2">
        {cell.qa?.valid ? (
          <IconCheck className="size-4 text-app-success" />
        ) : (
          <IconAlertTriangle className="size-4 text-app-danger" />
        )}
        <span className="text-xs font-medium text-app-muted-text">
          {cell.qa?.valid ? "QA passed" : "Review findings"}
        </span>
        <IconChevronRight className="ml-auto size-4 text-app-text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-app-action" />
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
            ),
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
    </button>
  );
}

type TraceStep = {
  id: string;
  label: string;
  model?: string;
  prompt: unknown;
  output: unknown;
};

function OutputTraceModal({
  cell,
  onClose,
}: {
  cell: ExperimentCell;
  onClose: () => void;
}) {
  const steps = traceSteps(cell);
  const [activeStepId, setActiveStepId] = useState(steps[0]?.id ?? "");
  const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0];

  return (
    <AppModal className="z-[110] bg-[#242136]/45" onClose={onClose}>
      <AppModalPanel className="max-h-[calc(100vh-2rem)] max-w-[1120px] overflow-hidden p-0">
        <AppModalHeader
          title="Generation trace"
          closeLabel="Close generation trace"
          onClose={onClose}
        />
        <div className="grid min-h-0 md:h-[min(720px,calc(100vh-7rem))] md:grid-cols-[250px_minmax(0,1fr)]">
          <nav className="overflow-y-auto border-b border-app-panel-border bg-app-surface-subtle p-3 md:border-r md:border-b-0">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepId(step.id)}
                className={cn(
                  "mb-1 flex min-h-12 w-full items-center gap-3 rounded-control px-3 py-2 text-left",
                  step.id === activeStep?.id
                    ? "bg-app-strong text-white"
                    : "text-app-text hover:bg-app-control-hover",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                    step.id === activeStep?.id
                      ? "border-white/35"
                      : "border-app-panel-border text-app-muted-text",
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {step.label}
                  </span>
                  {step.model ? (
                    <span
                      className={cn(
                        "block truncate font-mono text-[11px]",
                        step.id === activeStep?.id
                          ? "text-white/70"
                          : "text-app-text-faint",
                      )}
                    >
                      {step.model}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </nav>
          {activeStep ? (
            <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
              <div className="grid gap-5 xl:grid-cols-2">
                <TraceValue title="Prompt / input" value={activeStep.prompt} />
                <TraceValue title="Produced output" value={activeStep.output} />
              </div>
            </div>
          ) : null}
        </div>
      </AppModalPanel>
    </AppModal>
  );
}

function TraceValue({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-app-text">{title}</h3>
      <pre className="min-h-52 overflow-auto rounded-card border border-app-panel-border bg-app-surface-subtle p-4 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-app-text">
        {formatTraceValue(value)}
      </pre>
    </section>
  );
}

function formatTraceValue(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null, null, 2);
}

function traceSteps(cell: ExperimentCell): TraceStep[] {
  if (!cell.plan) return [];
  const plan = cell.plan;
  return [
    {
      id: "hook",
      label: "Resolve hook",
      prompt: {
        template: plan.hookTemplate ?? plan.hook,
        substitutions: plan.hookSubstitutions ?? {},
        variant: cell.variant,
      },
      output: { hook: plan.hook },
    },
    {
      id: "text",
      label: "Generate slide text",
      model: plan.textModel,
      prompt: plan.debug?.textModelPrompt ?? "Prompt trace unavailable",
      output: plan.debug?.textGenerationResult ?? {
        title: plan.title,
        caption: plan.caption,
        hashtags: plan.hashtags,
        slides: plan.slides.map(({ id, role, text }) => ({ id, role, text })),
      },
    },
    {
      id: "images",
      label: "Choose pictures",
      prompt: {
        collectionIds: plan.imageCollectionIds ?? [],
        slideCopy: plan.slides.map(({ id, role, text }) => ({
          id,
          role,
          text,
        })),
      },
      output: plan.slides.map(({ id, role, imageUrl, imageCaption }) => ({
        id,
        role,
        imageUrl,
        imageCaption,
      })),
    },
    {
      id: "qa",
      label: "Validate output",
      prompt: {
        generatedHook: plan.hook,
        generatedSlides: plan.slides.map(({ id, role, text }) => ({
          id,
          role,
          text,
        })),
      },
      output: cell.qa ?? { valid: false, findings: [] },
    },
  ];
}

function parseValues(value = "", preserveCommas = false) {
  const separator = preserveCommas ? /\n/ : /[\n,]/;
  return [...new Set(value.split(separator).map((item) => item.trim()))].filter(
    Boolean,
  );
}

function mergeVariationValues(
  current = "",
  additions: string[],
  preserveCommas = false,
) {
  const values = [
    ...parseValues(current, preserveCommas),
    ...additions.map((value) => value.trim()).filter(Boolean),
  ];
  const unique = [
    ...new Map(
      values.map((value) => [normalizeSampleValue(value), value]),
    ).values(),
  ];
  return unique.join(preserveCommas ? "\n" : ", ");
}

function normalizeSampleValue(value: string) {
  return value.trim().toLowerCase();
}

const variationSampleGroups: VariationSample["group"][] = [
  "Current automation",
  "Suggested",
  "Automation templates",
];

function groupVariationSamples(samples: VariationSample[]) {
  const groups = new Map<VariationSample["group"], VariationSample[]>();
  for (const sample of samples) {
    groups.set(sample.group, [...(groups.get(sample.group) ?? []), sample]);
  }
  return groups;
}

function variationSamples(
  choice: ExperimentDimensionChoice,
  templateRecords: TemplateSampleRecord[],
) {
  const samples: VariationSample[] = [];

  if (choice.currentValue?.trim()) {
    samples.push({
      id: `current:${choice.key}`,
      value: choice.currentValue.trim(),
      group: "Current automation",
      source: "Current automation",
    });
  }

  choice.sampleValues.forEach((value, index) => {
    if (!value.trim()) return;
    samples.push({
      id: `suggested:${choice.key}:${index}`,
      value: value.trim(),
      group: "Suggested",
      source: choice.dimension === "model" ? "Available model" : "Preset",
    });
  });

  templateRecords.forEach((record) => {
    templateVariationValues(choice, record).forEach((value, index) => {
      if (!value.trim()) return;
      samples.push({
        id: `template:${record.id}:${choice.key}:${index}`,
        value: value.trim(),
        group: "Automation templates",
        source: record.name,
      });
    });
  });

  const seen = new Set<string>();
  return samples.filter((sample) => {
    const normalized = normalizeSampleValue(sample.value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function templateVariationValues(
  choice: ExperimentDimensionChoice,
  record: TemplateSampleRecord,
) {
  if (choice.dimension === "tone") {
    return record.schema.tone?.value ? [record.schema.tone.value] : [];
  }
  if (choice.dimension !== "contentDirection" || !choice.name) return [];

  const block = record.schema.formatting?.find(
    (candidate) => candidate.id === choice.name,
  );
  if (!block) return [];

  if (choice.slideIndex) {
    const override = block.slideOverrides?.find(
      (candidate) => candidate.slideIndex === choice.slideIndex,
    )?.contentDirection;
    if (override) return [override];
  }

  return [
    ...(block.textItems ?? []).flatMap((item) =>
      item.contentDirection ? [item.contentDirection] : [],
    ),
    ...(choice.slideIndex
      ? []
      : (block.slideOverrides ?? []).map(
          (override) => override.contentDirection,
        )),
  ];
}

function dimensionChoices(
  dimensions: DimensionsResponse | null,
): ExperimentDimensionChoice[] {
  if (!dimensions) return [];
  return dimensions.automationDimensions
    .filter(
      (dimension) =>
        !(
          dimension.dimension === "contentDirection" &&
          dimension.name === "hook"
        ),
    )
    .map((dimension) => ({
      ...dimension,
      key: `${dimension.dimension}:${dimension.name ?? ""}:${dimension.slideIndex ?? ""}`,
      sweepable: true,
    }));
}

function experimentGrid(cells: ExperimentCell[]) {
  const columns = [
    ...new Set(
      cells.map(
        (cell) =>
          Object.entries(cell.variant)
            .filter(([key]) => key !== "hook" && key !== "repeat")
            .map(([key, value]) => `${key}=${value}`)
            .join(", ") || "Baseline",
      ),
    ),
  ];
  const rowsByHook = new Map<
    string,
    {
      hook: string;
      label: string;
      cells: Map<string, ExperimentCell[]>;
    }
  >();
  for (const cell of cells) {
    const hook = cell.variant.hook || cell.plan?.hook || "Selected hook";
    const column =
      Object.entries(cell.variant)
        .filter(([key]) => key !== "hook" && key !== "repeat")
        .map(([key, value]) => `${key}=${value}`)
        .join(", ") || "Baseline";
    const row = rowsByHook.get(hook) ?? {
      hook,
      label: cell.plan?.hook || hook,
      cells: new Map<string, ExperimentCell[]>(),
    };
    row.cells.set(column, [...(row.cells.get(column) ?? []), cell]);
    rowsByHook.set(hook, row);
  }
  return { columns, rows: [...rowsByHook.values()] };
}
