"use client"

import {
  ChevronLeft,
  ChevronRight,
  Info,
  Pencil,
  Play,
  RefreshCcw,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { AutomationTemplateExampleRun } from "@/lib/automation-templates"
import type { OpenRouterModelSummary } from "@/lib/openrouter-models"
import { tempTestingCenterFallbackModels } from "@/lib/realfarm-generation-model-registry"
import { slideshowTextGenerationPayload } from "@/lib/slideshow-text-generation"
import { cn } from "@/lib/utils"
import type {
  TempSlideImage,
  TempSlideImageCollection,
  TempSlideSpec,
  TempSlideStructuredOutput,
  TempSlideTestingAutomation,
  TempSlideTextPlaceholder,
} from "@/lib/temp-slide-testing"
import {
  buildTempSlideStructuredOutputSchema,
  buildTempSlideUserPrompt,
  defaultTempSlideSystemPrompt,
  defaultTempSlideUserInstructions,
  getTempSlidePromptPlaceholders,
  promptPreviewHook,
} from "@/lib/temp-slide-testing"

const fallbackModelOptions: OpenRouterModelSummary[] =
  tempTestingCenterFallbackModels

type GenerationRun = {
  id: string
  imageSeed: string
  automationId: string
  model: string
  status: "loading" | "success" | "error"
  startedAt: string
  selectedHook?: string
  result?: TempSlideStructuredOutput
  error?: string
}

type SlideTestingCenterProps = {
  automations: TempSlideTestingAutomation[]
  collections: TempSlideImageCollection[]
  exampleRunsByAutomationId: Record<string, AutomationTemplateExampleRun[]>
}

export function SlideTestingCenter({
  automations,
  collections,
  exampleRunsByAutomationId,
}: SlideTestingCenterProps) {
  const [selectedAutomationId, setSelectedAutomationId] = useState(
    automations[0]?.id ?? ""
  )
  const [modelOptions, setModelOptions] =
    useState<OpenRouterModelSummary[]>(fallbackModelOptions)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState("")
  const [selectedModels, setSelectedModels] = useState<string[]>([
    fallbackModelOptions[0].id,
  ])
  const [customModel, setCustomModel] = useState("")
  const [runs, setRuns] = useState<GenerationRun[]>([])
  const [systemPrompt, setSystemPrompt] = useState(defaultTempSlideSystemPrompt)
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(
    defaultTempSlideSystemPrompt
  )
  const [promptInstructions, setPromptInstructions] = useState(
    defaultTempSlideUserInstructions
  )
  const [draftPromptInstructions, setDraftPromptInstructions] = useState(
    defaultTempSlideUserInstructions
  )
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [automationModalOpen, setAutomationModalOpen] = useState(false)
  const [activeSlideByRunId, setActiveSlideByRunId] = useState<
    Record<string, number>
  >({})
  const [exampleCursorByAutomationId, setExampleCursorByAutomationId] =
    useState<Record<string, number>>({})

  const selectedAutomation = useMemo(
    () =>
      automations.find(
        (automation) => automation.id === selectedAutomationId
      ) ?? automations[0],
    [automations, selectedAutomationId]
  )
  const collectionMap = useMemo(
    () => collectionLookupMap(collections),
    [collections]
  )
  const allImages = useMemo(
    () => collections.flatMap((collection) => collection.images),
    [collections]
  )
  const runnableModels = useMemo(() => {
    const models = [...selectedModels, customModel]
      .map((model) => model.trim())
      .filter(Boolean)
    return [...new Set(models)]
  }, [customModel, selectedModels])
  const selectedAutomationRuns = runs.filter(
    (run) => run.automationId === selectedAutomation?.id
  )
  const promptPreviewPlaceholders = useMemo(
    () =>
      selectedAutomation
        ? getTempSlidePromptPlaceholders(selectedAutomation)
        : [],
    [selectedAutomation]
  )
  const promptPreviewSelectedHook = selectedAutomation
    ? promptPreviewHook(selectedAutomation)
    : ""
  const promptPreviewUserPrompt = selectedAutomation
    ? buildTempSlideUserPrompt({
        automationName: selectedAutomation.name,
        hook: promptPreviewSelectedHook,
        tone: selectedAutomation.tone,
        style: selectedAutomation.style,
        promptInstructions: draftPromptInstructions,
        placeholders: promptPreviewPlaceholders,
      })
    : ""
  const promptPreviewSchema = buildTempSlideStructuredOutputSchema(
    promptPreviewPlaceholders
  )
  const promptPreviewPayload = JSON.stringify(
    selectedAutomation
      ? slideshowTextGenerationPayload({
          automation: selectedAutomation,
          model: runnableModels[0] || "selected-openrouter-model",
          selectedHook: promptPreviewSelectedHook,
          systemPrompt: draftSystemPrompt,
          promptInstructions: draftPromptInstructions,
        })
      : {
          model: runnableModels[0] || "selected-openrouter-model",
          messages: [],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "temp_slide_testing_text",
              strict: true,
              schema: promptPreviewSchema,
            },
          },
        },
    null,
    2
  )

  useEffect(() => {
    let cancelled = false

    async function loadModels() {
      setModelsLoading(true)
      setModelsError("")
      try {
        const response = await fetch("/api/temp/testing-center/models")
        const payload = (await response.json()) as {
          models?: OpenRouterModelSummary[]
          error?: string
        }

        if (!response.ok || !Array.isArray(payload.models)) {
          throw new Error(payload.error || "Failed to load OpenRouter models")
        }

        const loadedModels = payload.models
        if (!cancelled && loadedModels.length > 0) {
          setModelOptions(loadedModels)
          setSelectedModels((current) => {
            const liveIds = new Set(loadedModels.map((model) => model.id))
            const retained = current.filter((model) => liveIds.has(model))
            return retained.length > 0 ? retained : [loadedModels[0].id]
          })
        }
      } catch (error) {
        if (!cancelled) {
          setModelsError(
            error instanceof Error
              ? error.message
              : "Failed to load OpenRouter models"
          )
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false)
        }
      }
    }

    void loadModels()

    return () => {
      cancelled = true
    }
  }, [])

  function toggleModel(model: string) {
    setSelectedModels((current) =>
      current.includes(model)
        ? current.filter((item) => item !== model)
        : [...current, model]
    )
  }

  async function generateModel(model: string) {
    if (!selectedAutomation) {
      return
    }

    const runSeed = randomRunSeed(model)
    const runId = `${Date.now()}-${runSeed}`
    const pendingRun: GenerationRun = {
      id: runId,
      imageSeed: runSeed,
      automationId: selectedAutomation.id,
      model,
      status: "loading",
      startedAt: new Date().toISOString(),
    }
    setRuns((current) => [pendingRun, ...current])

    try {
      const response = await fetch("/api/temp/testing-center/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automationId: selectedAutomation.id,
          model,
          systemPrompt,
          promptInstructions,
        }),
      })
      const payload = (await response.json()) as {
        selectedHook?: string
        result?: TempSlideStructuredOutput
        error?: string
      }

      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "Generation failed")
      }

      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                status: "success",
                selectedHook: payload.selectedHook,
                result: payload.result,
              }
            : run
        )
      )
    } catch (error) {
      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                status: "error",
                error:
                  error instanceof Error ? error.message : "Generation failed",
              }
            : run
        )
      )
    }
  }

  function generateSelectedModels() {
    for (const model of runnableModels) {
      void generateModel(model)
    }
  }

  function clearRuns() {
    setRuns((current) =>
      current.filter((run) => run.automationId !== selectedAutomation?.id)
    )
    if (selectedAutomation) {
      setActiveSlideByRunId((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([runId]) =>
            runs.some(
              (run) =>
                run.id === runId && run.automationId !== selectedAutomation.id
            )
          )
        )
      )
    }
  }

  function openPromptModal() {
    setDraftSystemPrompt(systemPrompt)
    setDraftPromptInstructions(promptInstructions)
    setPromptModalOpen(true)
  }

  function savePromptInstructions() {
    setSystemPrompt(draftSystemPrompt.trim() || defaultTempSlideSystemPrompt)
    setPromptInstructions(
      draftPromptInstructions.trim() || defaultTempSlideUserInstructions
    )
    setPromptModalOpen(false)
  }

  function showAdjacentSlide(
    runId: string,
    slideCount: number,
    direction: "previous" | "next"
  ) {
    setActiveSlideByRunId((current) => ({
      ...current,
      [runId]:
        direction === "next"
          ? ((current[runId] ?? 0) + 1) % Math.max(1, slideCount)
          : ((current[runId] ?? 0) - 1 + Math.max(1, slideCount)) %
            Math.max(1, slideCount),
    }))
  }

  function selectAutomation(automationId: string) {
    setSelectedAutomationId(automationId)
    setAutomationModalOpen(false)
  }

  function navigateAutomationExample(
    automationId: string,
    direction: "previous" | "next"
  ) {
    const count = exampleSlidePreviews(
      exampleRunsByAutomationId[automationId]
    ).length
    if (count === 0) {
      return
    }
    setExampleCursorByAutomationId((current) => {
      const cursor = current[automationId] ?? 0
      return {
        ...current,
        [automationId]:
          direction === "next"
            ? (cursor + 1) % count
            : (cursor - 1 + count) % count,
      }
    })
  }

  return (
    <main className="min-h-screen bg-[#f8f8f5] text-[#22221f]">
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dfded7] pb-5">
          <div className="space-y-2">
            <div className="inline-flex rounded-md border border-[#d6d4c9] bg-white px-2 py-1 text-xs font-semibold text-[#6f6d64]">
              Temp zone
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">
                Slide Testing Center
              </h1>
              <p className="max-w-3xl text-sm text-[#69675f]">
                Test automation slide text strategies across OpenRouter models
                without touching app workflows.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="softControl"
              size="sm"
              onClick={openPromptModal}
            >
              <Pencil aria-hidden="true" />
              Change prompt
            </Button>
            <Button
              type="button"
              variant="softControl"
              size="sm"
              onClick={clearRuns}
            >
              <RefreshCcw aria-hidden="true" />
              Clear runs
            </Button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="h-fit rounded-lg border border-[#dfded7] bg-white p-4 shadow-sm">
            <div className="space-y-4">
              <div className="block space-y-2">
                <span className="text-xs font-semibold text-[#8a887f] uppercase">
                  Automation
                </span>
                <button
                  type="button"
                  onClick={() => setAutomationModalOpen(true)}
                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-[#d8d6cc] bg-white px-3 py-2 text-left text-sm font-medium outline-none hover:bg-[#f6f5ef] focus:border-[#22221f]"
                >
                  <span className="truncate">
                    {selectedAutomation?.name ?? "Choose automation"}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[#8a887f]">
                    Change
                  </span>
                </button>
              </div>

              {selectedAutomation ? (
                <div className="rounded-md border border-[#ecebe4] bg-[#fbfbf8] p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {selectedAutomation.name}
                    </span>
                    <span className="rounded bg-[#ecebe4] px-2 py-1 text-xs text-[#6f6d64]">
                      {selectedAutomation.slides.length} slides
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-[#6f6d64]">
                    <div>
                      <dt className="font-semibold uppercase">Tone</dt>
                      <dd>{selectedAutomation.tone}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase">Style</dt>
                      <dd>{selectedAutomation.style}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase">
                        First hook option
                      </dt>
                      <dd>{selectedAutomation.hooks[0] ?? "No hook stored"}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#8a887f] uppercase">
                    OpenRouter models
                  </span>
                  <span className="text-xs text-[#8a887f]">
                    {modelsLoading
                      ? "Loading..."
                      : `${modelOptions.length} shown`}
                  </span>
                </div>
                {modelsError ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {modelsError}. Using fallback shortlist.
                  </p>
                ) : null}
                <div className="space-y-2">
                  {modelOptions.map((model) => (
                    <label
                      key={model.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-[#e1dfd5] bg-white px-3 py-2 text-sm hover:bg-[#f6f5ef]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(model.id)}
                        onChange={() => toggleModel(model.id)}
                        className="size-4 accent-[#22221f]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          {model.name}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-[#6f6d64]">
                          {model.id}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <input
                  value={customModel}
                  onChange={(event) => setCustomModel(event.target.value)}
                  placeholder="Custom OpenRouter model ID"
                  className="h-10 w-full rounded-md border border-[#d8d6cc] bg-white px-3 font-mono text-xs outline-none focus:border-[#22221f]"
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={generateSelectedModels}
                disabled={!selectedAutomation || runnableModels.length === 0}
              >
                <Play aria-hidden="true" />
                Generate selected models
              </Button>
            </div>
          </aside>

          <section className="min-w-0">
            {selectedAutomationRuns.length === 0 ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-[#d6d4c9] bg-white text-center">
                <div>
                  <p className="text-base font-semibold">No test runs yet</p>
                  <p className="mt-1 text-sm text-[#6f6d64]">
                    Choose models and generate to compare slide outputs.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {selectedAutomationRuns.map((run) => (
                  <RunResult
                    key={run.id}
                    run={run}
                    automation={selectedAutomation}
                    collectionMap={collectionMap}
                    allImages={allImages}
                    activeSlideIndex={activeSlideByRunId[run.id] ?? 0}
                    onPreviousSlide={() =>
                      showAdjacentSlide(
                        run.id,
                        selectedAutomation.slides.length,
                        "previous"
                      )
                    }
                    onNextSlide={() =>
                      showAdjacentSlide(
                        run.id,
                        selectedAutomation.slides.length,
                        "next"
                      )
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
      {promptModalOpen ? (
        <PromptModal
          value={draftPromptInstructions}
          systemPrompt={draftSystemPrompt}
          finalPayload={promptPreviewPayload}
          onSystemPromptChange={setDraftSystemPrompt}
          onChange={setDraftPromptInstructions}
          onClose={() => setPromptModalOpen(false)}
          onSave={savePromptInstructions}
          onReset={() => {
            setDraftSystemPrompt(defaultTempSlideSystemPrompt)
            setDraftPromptInstructions(defaultTempSlideUserInstructions)
          }}
        />
      ) : null}
      {automationModalOpen ? (
        <AutomationPickerModal
          automations={automations}
          selectedAutomationId={selectedAutomation?.id ?? ""}
          exampleRunsByAutomationId={exampleRunsByAutomationId}
          exampleCursorByAutomationId={exampleCursorByAutomationId}
          onClose={() => setAutomationModalOpen(false)}
          onSelect={selectAutomation}
          onNavigateExample={navigateAutomationExample}
        />
      ) : null}
    </main>
  )
}

function AutomationPickerModal({
  automations,
  selectedAutomationId,
  exampleRunsByAutomationId,
  exampleCursorByAutomationId,
  onClose,
  onSelect,
  onNavigateExample,
}: {
  automations: TempSlideTestingAutomation[]
  selectedAutomationId: string
  exampleRunsByAutomationId: Record<string, AutomationTemplateExampleRun[]>
  exampleCursorByAutomationId: Record<string, number>
  onClose: () => void
  onSelect: (automationId: string) => void
  onNavigateExample: (
    automationId: string,
    direction: "previous" | "next"
  ) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="flex h-[min(820px,92vh)] w-full max-w-6xl flex-col rounded-lg border border-[#dfded7] bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#ecebe4] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Choose automation</h2>
            <p className="text-sm text-[#6f6d64]">
              Browse example slideshows, then click a preview to switch.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-[#6f6d64] hover:bg-[#f1f0ea]"
            aria-label="Close automation picker"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {automations.map((automation) => {
              const previews = exampleSlidePreviews(
                exampleRunsByAutomationId[automation.id]
              )
              const cursor =
                (exampleCursorByAutomationId[automation.id] ?? 0) %
                Math.max(1, previews.length)
              const preview = previews[cursor]
              const selected = automation.id === selectedAutomationId

              return (
                <article
                  key={automation.id}
                  className={cn(
                    "relative overflow-hidden rounded-lg border bg-white shadow-sm",
                    selected ? "border-[#22221f]" : "border-[#dfded7]"
                  )}
                >
                  <button
                    type="button"
                    data-testid={`temp-automation-option-${automation.id}`}
                    onClick={() => onSelect(automation.id)}
                    className="block w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-[#22221f]/25"
                  >
                    <div className="relative aspect-[9/16] overflow-hidden bg-[#d8d6cc]">
                      {preview ? (
                        <img
                          src={preview.imageUrl}
                          alt={preview.text || `${automation.name} example`}
                          className="size-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-[#f1f0ea] px-4 text-center text-sm font-semibold text-[#8a887f]">
                          No example slideshow
                        </div>
                      )}
                      {preview ? (
                        <div className="absolute inset-0 bg-black/20" />
                      ) : null}
                      {preview?.text ? (
                        <div className="absolute inset-x-5 top-[43%] text-center font-tiktok text-[15px] leading-tight font-bold text-yellow-100 drop-shadow">
                          {preview.text}
                        </div>
                      ) : null}
                      {selected ? (
                        <div className="absolute top-2 left-2 rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#22221f]">
                          Selected
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-1 px-3 py-3">
                      <div className="truncate text-sm font-semibold">
                        {automation.name}
                      </div>
                      <div className="truncate text-xs text-[#6f6d64]">
                        {preview
                          ? `${preview.label} · slide ${preview.slideIndex + 1}/${preview.slideCount}`
                          : `${automation.slides.length} slide format`}
                      </div>
                    </div>
                  </button>
                  {previews.length > 1 ? (
                    <>
                      <button
                        type="button"
                        data-testid={`temp-automation-previous-${automation.id}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onNavigateExample(automation.id, "previous")
                        }}
                        className="absolute top-[42%] left-2 grid size-8 place-items-center rounded-full bg-white/90 text-[#22221f] shadow hover:bg-white"
                        aria-label={`Previous ${automation.name} example`}
                      >
                        <ChevronLeft aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        data-testid={`temp-automation-next-${automation.id}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onNavigateExample(automation.id, "next")
                        }}
                        className="absolute top-[42%] right-2 grid size-8 place-items-center rounded-full bg-white/90 text-[#22221f] shadow hover:bg-white"
                        aria-label={`Next ${automation.name} example`}
                      >
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </button>
                    </>
                  ) : null}
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function PromptModal({
  value,
  systemPrompt,
  finalPayload,
  onSystemPromptChange,
  onChange,
  onClose,
  onSave,
  onReset,
}: {
  value: string
  systemPrompt: string
  finalPayload: string
  onSystemPromptChange: (value: string) => void
  onChange: (value: string) => void
  onClose: () => void
  onSave: () => void
  onReset: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="flex h-[min(820px,92vh)] w-full max-w-5xl flex-col rounded-lg border border-[#dfded7] bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#ecebe4] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Generation prompt</h2>
            <p className="text-sm text-[#6f6d64]">
              Edit the system prompt and instruction block. The full request
              payload updates on the right.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-[#6f6d64] hover:bg-[#f1f0ea]"
            aria-label="Close prompt editor"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-5 py-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex min-h-0 flex-col gap-3">
            <label className="flex min-h-0 flex-1 flex-col gap-2">
              <span className="text-xs font-semibold text-[#8a887f] uppercase">
                Editable system prompt
              </span>
              <textarea
                value={systemPrompt}
                onChange={(event) => onSystemPromptChange(event.target.value)}
                className="min-h-[150px] flex-1 resize-none rounded-md border border-[#d8d6cc] bg-[#fbfbf8] p-3 font-mono text-sm leading-relaxed outline-none focus:border-[#22221f]"
              />
            </label>
            <label className="flex min-h-0 flex-1 flex-col gap-2">
              <span className="text-xs font-semibold text-[#8a887f] uppercase">
                Editable instructions
              </span>
              <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="min-h-[180px] flex-1 resize-none rounded-md border border-[#d8d6cc] bg-[#fbfbf8] p-3 font-mono text-sm leading-relaxed outline-none focus:border-[#22221f]"
              />
            </label>
            <div className="rounded-md bg-[#f6f5ef] p-3 text-xs text-[#6f6d64]">
              Dynamic fields like automation, hook, tone, style, placeholder
              IDs, and the schema are read-only here and generated from the
              selected automation.
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-3">
            <div>
              <div className="text-xs font-semibold text-[#8a887f] uppercase">
                Final OpenRouter payload
              </div>
              <p className="mt-1 text-xs text-[#6f6d64]">
                This includes model, messages, response_format, and the full
                structured output schema.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[#d8d6cc] bg-[#22221f] p-3 font-mono text-xs leading-relaxed text-white">
              <pre className="whitespace-pre-wrap">{finalPayload}</pre>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#ecebe4] px-5 py-4">
          <Button
            type="button"
            variant="softControl"
            size="sm"
            onClick={onReset}
          >
            Reset default
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="softControl"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={onSave}>
              Save prompt
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RunResult({
  run,
  automation,
  collectionMap,
  allImages,
  activeSlideIndex,
  onPreviousSlide,
  onNextSlide,
}: {
  run: GenerationRun
  automation: TempSlideTestingAutomation
  collectionMap: Map<string, TempSlideImageCollection>
  allImages: TempSlideImage[]
  activeSlideIndex: number
  onPreviousSlide: () => void
  onNextSlide: () => void
}) {
  const normalizedSlideIndex =
    activeSlideIndex % Math.max(1, automation.slides.length)
  const activeSlide = automation.slides[normalizedSlideIndex]

  return (
    <article className="overflow-hidden rounded-lg border border-[#dfded7] bg-white shadow-sm">
      {run.status === "loading" ? (
        <div className="flex aspect-[9/16] items-center justify-center bg-[#fbfbf8] p-4">
          <div className="w-full">
            <div className="h-2 overflow-hidden rounded-full bg-[#ecebe4]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#22221f]" />
            </div>
            <p className="mt-3 text-center text-sm text-[#6f6d64]">
              Generating structured slide text...
            </p>
          </div>
        </div>
      ) : null}

      {run.status === "error" ? (
        <div className="flex aspect-[9/16] items-center justify-center bg-red-50 p-4 text-center text-sm text-red-700">
          {run.error}
        </div>
      ) : null}

      {run.status === "success" && run.result && activeSlide ? (
        <div className="relative">
          <SlidePreview
            slide={activeSlide}
            run={run}
            text={run.result.text}
            fixedHook={run.selectedHook ?? promptPreviewHook(automation)}
            images={imagesForSlide(
              activeSlide,
              collectionMap,
              allImages,
              run.imageSeed
            )}
            overlayImages={imagesForCollectionId(
              activeSlide.overlayImage?.collectionId,
              collectionMap
            )}
            compact
          />
          <span className="absolute top-2 right-2 z-20 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-[#22221f] shadow">
            {normalizedSlideIndex + 1}/{automation.slides.length}
          </span>
          <span className="absolute bottom-2 left-2 z-20 max-w-[78%] truncate rounded-full bg-[#22221f]/88 px-2 py-1 text-[10px] font-semibold text-white shadow">
            Model {run.model}
          </span>
          <button
            type="button"
            onClick={() => showSlideInfoToast(activeSlide)}
            className="absolute top-2 left-2 z-20 grid size-8 place-items-center rounded-full bg-white/90 text-[#22221f] shadow hover:bg-white focus-visible:ring-3 focus-visible:ring-[#22221f]/25 focus-visible:outline-none"
            aria-label="Show slide parameters"
          >
            <Info aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={onPreviousSlide}
            className="absolute top-1/2 left-2 z-20 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#22221f] shadow hover:bg-white focus-visible:ring-3 focus-visible:ring-[#22221f]/25 focus-visible:outline-none"
            aria-label="Previous generated slide"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNextSlide}
            className="absolute top-1/2 right-2 z-20 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#22221f] shadow hover:bg-white focus-visible:ring-3 focus-visible:ring-[#22221f]/25 focus-visible:outline-none"
            aria-label="Next generated slide"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
    </article>
  )
}

function SlidePreview({
  slide,
  run,
  text,
  fixedHook,
  images,
  overlayImages,
  compact = false,
}: {
  slide: TempSlideSpec
  run: GenerationRun
  text: Record<string, string>
  fixedHook: string
  images: TempSlideImage[]
  overlayImages: TempSlideImage[]
  compact?: boolean
}) {
  const groupedTextItems = groupTextItemsByPosition(slide.textItems)

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-lg bg-[#d8d6cc] shadow-sm"
        style={{ aspectRatio: aspectRatioValue(slide.aspectRatio) }}
      >
        <ImageGrid
          images={images}
          imageGrid={slide.imageGrid}
          seed={`${run.imageSeed}-${slide.id}`}
        />
        {slide.overlay ? (
          <div className="absolute inset-0 bg-black/25" />
        ) : null}
        {slide.overlayImage?.enabled ? (
          <OverlayImage
            images={overlayImages}
            seed={`${run.imageSeed}-${slide.id}-overlay`}
            height={slide.overlayImage.height}
          />
        ) : null}
        {slide.displayText ? (
          <>
            <TextStack
              position="top"
              items={groupedTextItems.top}
              text={text}
              fixedHook={fixedHook}
            />
            <TextStack
              position="center"
              items={groupedTextItems.center}
              text={text}
              fixedHook={fixedHook}
            />
            <TextStack
              position="bottom"
              items={groupedTextItems.bottom}
              text={text}
              fixedHook={fixedHook}
            />
          </>
        ) : null}
      </div>
      {compact ? null : (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#6f6d64]">
          <span className="font-semibold text-[#22221f]">{slide.title}</span>
          <span>
            {slide.aspectRatio} / {slide.imageGrid}
          </span>
        </div>
      )}
    </div>
  )
}

function OverlayImage({
  images,
  seed,
  height,
}: {
  images: TempSlideImage[]
  seed: string
  height: number
}) {
  const selectedImages = pickImages(images, 1, seed)
  const selectedImage = selectedImages[0]
  if (!selectedImage) {
    return null
  }

  const spacing = Number.isFinite(height)
    ? Math.max(0, Math.min(12, height))
    : 5
  const widthPercent = Math.max(58, Math.min(86, 96 - spacing * 4))

  return (
    <div
      className="absolute top-1/2 left-1/2 z-[5] overflow-hidden rounded-md bg-black shadow-lg"
      style={{
        width: `${widthPercent}%`,
        aspectRatio: "16 / 9",
        transform: "translate(-50%, -43%)",
      }}
    >
      <img
        src={selectedImage.imageUrl}
        alt={selectedImage.description || ""}
        className="size-full object-cover"
      />
    </div>
  )
}

function ImageGrid({
  images,
  imageGrid,
  seed,
}: {
  images: TempSlideImage[]
  imageGrid: string
  seed: string
}) {
  const imageCount = imageCountForGrid(imageGrid)
  const selectedImages = pickImages(images, imageCount, seed)

  if (selectedImages.length === 0) {
    return <div className="absolute inset-0 bg-[#d8d6cc]" />
  }

  if (imageGrid === "none") {
    return (
      <img
        src={selectedImages[0].imageUrl}
        alt={selectedImages[0].description || ""}
        className="absolute inset-0 size-full object-cover"
      />
    )
  }

  return (
    <div
      className={cn(
        "absolute inset-0 grid gap-0.5 bg-[#22221f]",
        gridClassName(imageGrid)
      )}
    >
      {selectedImages.map((image, index) => (
        <img
          key={`${image.id}-${index}`}
          src={image.imageUrl}
          alt={image.description || ""}
          className="size-full object-cover"
        />
      ))}
    </div>
  )
}

function TextStack({
  position,
  items,
  text,
  fixedHook,
}: {
  position: "top" | "center" | "bottom"
  items: TempSlideTextPlaceholder[]
  text: Record<string, string>
  fixedHook: string
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "absolute right-0 left-0 z-10 flex flex-col gap-2 px-4",
        positionClassName(position)
      )}
    >
      {items.map((item) => {
        const resolvedText =
          item.textMode === "static"
            ? item.staticText
            : item.section === "hook"
              ? fixedHook
              : text[item.id]
        return (
          <div
            key={item.id}
            className="mx-auto"
            style={{
              width: item.textItemWidth || "80%",
              textAlign: textAlignValue(item.textAlign),
            }}
          >
            <span
              className={cn(
                "inline-block rounded-sm px-1 py-0.5 font-sans leading-tight font-semibold whitespace-pre-wrap",
                textStyleClassName(item.textStyle),
                !resolvedText && "text-white/50"
              )}
              style={textStyle(item)}
            >
              {resolvedText || "missing text"}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function imagesForSlide(
  slide: TempSlideSpec,
  collectionMap: Map<string, TempSlideImageCollection>,
  allImages: TempSlideImage[],
  seed: string
) {
  const collectionImages = imagesForCollectionId(
    slide.collectionId,
    collectionMap
  )
  return collectionImages.length > 0
    ? collectionImages
    : pickImages(allImages, 24, `${seed}-fallback`)
}

function imagesForCollectionId(
  collectionId: string | undefined,
  collectionMap: Map<string, TempSlideImageCollection>
) {
  return collectionId ? (collectionMap.get(collectionId)?.images ?? []) : []
}

function collectionLookupMap(collections: TempSlideImageCollection[]) {
  const map = new Map<string, TempSlideImageCollection>()
  for (const collection of collections) {
    map.set(collection.id, collection)
    for (const alias of collection.aliases) {
      map.set(alias, collection)
    }
  }
  return map
}

function exampleSlidePreviews(
  runs: AutomationTemplateExampleRun[] | undefined
) {
  return (runs ?? []).flatMap((run, runIndex) => {
    const slides = run.plan?.slides ?? []
    return slides.flatMap((slide, slideIndex) => {
      const imageUrl = slide.imageUrl?.trim() ?? ""
      if (!imageUrl) {
        return []
      }
      return [
        {
          id: `${run.id}-${slide.id ?? slideIndex}`,
          imageUrl,
          text: slide.text?.trim() || slide.imageCaption?.trim() || "",
          label: `Slideshow ${runIndex + 1}`,
          slideIndex,
          slideCount: slides.length,
        },
      ]
    })
  })
}

function showSlideInfoToast(slide: TempSlideSpec) {
  toast.info(`${slide.title} parameters`, {
    description: slideInfoDescription(slide),
    duration: 9000,
  })
}

function slideInfoDescription(slide: TempSlideSpec) {
  const textItems = slide.textItems
    .map((item, index) => {
      const direction =
        item.textMode === "static"
          ? `static: ${item.staticText || "(empty)"}`
          : item.contentDirection || "Write concise text for this box."
      return `${index + 1}. ${direction} (${item.wordLengthMin}-${item.wordLengthMax} words, ${item.textPosition}, ${item.textStyle}, ${item.textAlign})`
    })
    .join("\n")

  return [
    `section: ${slide.section}`,
    `aspect ratio: ${slide.aspectRatio}`,
    `image grid: ${slide.imageGrid}`,
    `overlay: ${slide.overlay ? "on" : "off"}`,
    `overlay image: ${
      slide.overlayImage?.enabled
        ? `${slide.overlayImage.collectionId || "none"} (${slide.overlayImage.height})`
        : "off"
    }`,
    `display text: ${slide.displayText ? "on" : "off"}`,
    `collection: ${slide.collectionId || "none"}`,
    "text boxes:",
    textItems || "none",
  ].join("\n")
}

function pickImages(images: TempSlideImage[], count: number, seed: string) {
  if (images.length <= count) {
    return images
  }

  const selected: TempSlideImage[] = []
  let cursor = hash(seed) % images.length
  for (
    let index = 0;
    selected.length < count && index < images.length * 2;
    index += 1
  ) {
    const image = images[cursor % images.length]
    if (!selected.some((selectedImage) => selectedImage.id === image.id)) {
      selected.push(image)
    }
    cursor += 7
  }
  return selected
}

function groupTextItemsByPosition(items: TempSlideTextPlaceholder[]) {
  return {
    top: items.filter((item) => item.textPosition === "top"),
    center: items.filter(
      (item) => item.textPosition !== "top" && item.textPosition !== "bottom"
    ),
    bottom: items.filter((item) => item.textPosition === "bottom"),
  }
}

function imageCountForGrid(imageGrid: string) {
  if (imageGrid === "2x2") {
    return 4
  }
  if (imageGrid === "1x3") {
    return 3
  }
  if (imageGrid === "1x2") {
    return 2
  }
  return 1
}

function gridClassName(imageGrid: string) {
  if (imageGrid === "2x2") {
    return "grid-cols-2 grid-rows-2"
  }
  if (imageGrid === "1x3") {
    return "grid-cols-1 grid-rows-3"
  }
  if (imageGrid === "1x2") {
    return "grid-cols-1 grid-rows-2"
  }
  return "grid-cols-1"
}

function positionClassName(position: "top" | "center" | "bottom") {
  if (position === "top") {
    return "top-5"
  }
  if (position === "bottom") {
    return "bottom-5"
  }
  return "top-1/2 -translate-y-1/2"
}

function textStyleClassName(textStyleValue: string) {
  if (textStyleValue === "blackText") {
    return "text-black"
  }
  if (textStyleValue === "yellowText") {
    return "text-yellow-300"
  }
  if (textStyleValue === "background") {
    return "bg-white text-black"
  }
  return "text-white"
}

function textStyle(item: TempSlideTextPlaceholder): CSSProperties {
  const fontSize = parseFloat(item.fontSize)
  return {
    fontSize: `${Number.isFinite(fontSize) ? Math.max(13, fontSize * 1.45) : 18}px`,
    maxWidth: "100%",
    textShadow:
      item.textStyle === "outline"
        ? "0 1px 2px #000, 1px 0 2px #000, -1px 0 2px #000"
        : undefined,
  }
}

function textAlignValue(value: string): CSSProperties["textAlign"] {
  return value === "left" || value === "right" ? value : "center"
}

function aspectRatioValue(value: string) {
  if (value === "1:1") {
    return "1 / 1"
  }
  if (value === "4:5") {
    return "4 / 5"
  }
  if (value === "3:4") {
    return "3 / 4"
  }
  if (value === "3:2") {
    return "3 / 2"
  }
  return "9 / 16"
}

function hash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  }
  return result
}

function randomRunSeed(model: string) {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${model}-${uuid}`
}
