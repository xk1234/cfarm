"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  LuCircleCheckBig,
  LuCopy,
  LuPlay,
  LuRotateCcw,
  LuTriangleAlert,
} from "react-icons/lu"

import { GeneratedSlideshowFrame } from "@/components/realfarm/automation-settings/generated-slideshow-frame"
import { StandardGenerationLoadingScreen } from "@/components/realfarm/generation-loading"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { AutomationRecord } from "@/lib/automations"
import type {
  AutomationRunPlan,
  AutomationRunStatus,
} from "@/lib/automation-runner"
import { cn } from "@/lib/utils"
import type JSONEditor from "jsoneditor"
import type { JSONEditorMode } from "jsoneditor"

type DebugAutomationPreview = {
  automationId: string
  automationTitle: string
  generatedAt: string
  status: Exclude<AutomationRunStatus, "running">
  error?: string
  plan: AutomationRunPlan
}

type PreviewTab = "slides" | "records" | "json"

export function DebugAutomationEditor({
  records,
}: {
  records: AutomationRecord[]
}) {
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "")
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) ?? records[0],
    [records, selectedId]
  )
  const selectedEditorJson = useMemo(
    () =>
      selectedRecord
        ? prettyJson(editableAutomationJson(selectedRecord))
        : "{}",
    [selectedRecord]
  )
  const [editorJson, setEditorJson] = useState(() =>
    selectedRecord ? prettyJson(editableAutomationJson(selectedRecord)) : "{}"
  )
  const [preview, setPreview] = useState<DebugAutomationPreview | null>(null)
  const [error, setError] = useState("")
  const [generating, setGenerating] = useState(false)

  const parsedAutomation = useMemo(() => {
    try {
      return {
        value: JSON.parse(editorJson) as unknown,
        error: "",
      }
    } catch (parseError) {
      return {
        value: null,
        error: getApiErrorMessage(parseError, "Invalid JSON"),
      }
    }
  }, [editorJson])
  const isDirty = editorJson !== selectedEditorJson

  function selectRecord(id: string) {
    const record = records.find((item) => item.id === id)
    setSelectedId(id)
    setEditorJson(record ? prettyJson(editableAutomationJson(record)) : "{}")
    setPreview(null)
    setError("")
  }

  function resetJson() {
    if (!selectedRecord) {
      return
    }
    setEditorJson(prettyJson(editableAutomationJson(selectedRecord)))
    setPreview(null)
    setError("")
  }

  function formatJson() {
    if (parsedAutomation.error) {
      setError(parsedAutomation.error)
      return
    }
    setEditorJson(prettyJson(editableAutomationJson(parsedAutomation.value)))
    setError("")
  }

  async function generatePreview() {
    if (generating || parsedAutomation.error) {
      setError(parsedAutomation.error)
      return
    }

    setGenerating(true)
    setError("")
    try {
      const previewAutomation = selectedRecord
        ? automationJsonForPreview(parsedAutomation.value, selectedRecord)
        : parsedAutomation.value
      const payload = await fetchJsonWithTimeout<DebugAutomationPreview>(
        "/api/debug/automation-preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            automation: previewAutomation,
            now: new Date().toISOString(),
          }),
          timeoutMs: 60_000,
        }
      )
      setPreview(payload)
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Failed to generate debug preview")
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f6f1] text-[#242421]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 py-4 md:px-6">
        <header className="flex flex-col gap-3 border-b border-[#deddd4] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[24px] leading-8 font-bold tracking-normal">
              Automation JSON Debugger
            </h1>
            <p className="mt-1 text-[13px] leading-5 font-semibold text-[#77766f]">
              Edit an automation record locally, generate slides from that JSON,
              and inspect the plan without writing changes back to the DB.
              Hidden DB-only sections are preserved for generation.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-bold text-[#77766f]">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5",
                isDirty
                  ? "border-[#e1c871] bg-[#fff8dc] text-[#6f5b00]"
                  : "border-[#d8d7cf] bg-white text-[#606058]"
              )}
            >
              {isDirty ? (
                <LuTriangleAlert className="size-3.5" />
              ) : (
                <LuCircleCheckBig className="size-3.5" />
              )}
              {isDirty ? "Local edits only" : "DB copy loaded"}
            </span>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 py-4 xl:grid-cols-[minmax(520px,0.92fr)_minmax(520px,1.08fr)]">
          <section className="flex min-h-[640px] flex-col overflow-hidden rounded-[8px] border border-[#deddd4] bg-white">
            <div className="flex flex-col gap-3 border-b border-[#e6e5de] p-3 md:flex-row md:items-center">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                  Automation
                </span>
                <select
                  value={selectedRecord?.id ?? ""}
                  onChange={(event) => selectRecord(event.target.value)}
                  className="h-10 rounded-[6px] border border-[#d8d7cf] bg-white px-3 text-[13px] font-semibold text-[#242421] outline-none focus:border-[#242421]"
                >
                  {records.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={formatJson}
                  className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[#d8d7cf] bg-white px-3 text-[13px] font-bold text-[#242421] hover:bg-[#f4f4ef]"
                >
                  Format
                </button>
                <button
                  type="button"
                  onClick={resetJson}
                  className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[#d8d7cf] bg-white px-3 text-[13px] font-bold text-[#242421] hover:bg-[#f4f4ef]"
                >
                  <LuRotateCcw className="size-4" />
                  Reset
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 bg-[#f8f8f4] p-3">
              <JsonEditorPanel
                value={editorJson}
                onChange={(value) => {
                  setEditorJson(value)
                  setError("")
                }}
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-[#e6e5de] p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 text-[12px] leading-5 font-semibold text-[#77766f]">
                {parsedAutomation.error
                  ? parsedAutomation.error
                  : "JSON is valid. Hidden DB, schedule, and social sections are merged from the selected DB record."}
              </div>
              <button
                type="button"
                onClick={() => void generatePreview()}
                disabled={generating || Boolean(parsedAutomation.error)}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[6px] bg-[#242421] px-4 text-[13px] font-bold text-white hover:bg-[#34342f] disabled:cursor-not-allowed disabled:bg-[#aaa9a1]"
              >
                <LuPlay className="size-4" />
                {generating ? "Generating" : "Generate Slides"}
              </button>
            </div>
          </section>

          <section className="flex min-h-[640px] flex-col overflow-hidden rounded-[8px] border border-[#deddd4] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#e6e5de] p-4">
              <div>
                <h2 className="text-[16px] leading-6 font-bold">
                  Generated Result
                </h2>
                <p className="mt-0.5 text-[12px] leading-5 font-semibold text-[#77766f]">
                  Preview plan returned from the edited automation JSON.
                </p>
              </div>
              {preview && (
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      JSON.stringify(preview.plan, null, 2)
                    )
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[#d8d7cf] bg-white px-3 text-[12px] font-bold text-[#242421] hover:bg-[#f4f4ef]"
                >
                  <LuCopy className="size-3.5" />
                  LuCopy Plan
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {generating ? (
                <StandardGenerationLoadingScreen
                  title="Generating debug slides"
                  description="Using the edited JSON to build a read-only automation plan."
                />
              ) : error ? (
                <EmptyResult tone="error" title="Preview failed" text={error} />
              ) : preview ? (
                <PreviewResult preview={preview} />
              ) : (
                <EmptyResult
                  title="No preview yet"
                  text="Edit the JSON or use the DB copy, then generate slides."
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function JsonEditorPanel({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<JSONEditor | null>(null)
  const initialValueRef = useRef(value)
  const lastEmittedValueRef = useRef(value)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let cancelled = false
    let editor: JSONEditor | null = null

    async function mountEditor() {
      const container = containerRef.current
      if (!container) {
        return
      }
      const { default: JSONEditorConstructor } = await import("jsoneditor")
      if (cancelled) {
        return
      }
      editor = new JSONEditorConstructor(
        container,
        {
          mode: "tree" as JSONEditorMode,
          modes: ["tree", "code", "text", "view"] as JSONEditorMode[],
          mainMenuBar: true,
          navigationBar: true,
          statusBar: true,
          search: true,
          history: true,
          onChange: () => {
            if (!editor) {
              return
            }
            const nextValue = editorText(editor)
            lastEmittedValueRef.current = nextValue
            onChangeRef.current(nextValue)
          },
        },
        parseJsonText(initialValueRef.current)
      )
      editorRef.current = editor
      editor.expand({ path: ["schema"], isExpand: true, recursive: false })
    }

    void mountEditor()

    return () => {
      cancelled = true
      editor?.destroy()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || value === lastEmittedValueRef.current) {
      return
    }
    setEditorValue(editor, value)
    lastEmittedValueRef.current = value
  }, [value])

  return (
    <div className="h-full min-h-[540px] overflow-hidden rounded-[7px] border border-[#d8d7cf] bg-white">
      <div ref={containerRef} className="h-full min-h-[540px]" />
    </div>
  )
}

function PreviewResult({ preview }: { preview: DebugAutomationPreview }) {
  const slides = preview.plan.slides ?? []
  const [activeTab, setActiveTab] = useState<PreviewTab>("slides")
  const tabs: { id: PreviewTab; label: string }[] = [
    { id: "slides", label: "Slides" },
    { id: "records", label: "Records" },
    { id: "json", label: "Plan JSON" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[8px] border border-[#e6e5de] bg-[#fbfbf7] p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="truncate text-[15px] leading-6 font-bold text-[#242421]">
            {preview.plan.hook || preview.automationTitle}
          </div>
          <div className="mt-0.5 truncate text-[12px] leading-5 font-semibold text-[#77766f]">
            {slides.length} slides · {preview.plan.language || "English"} ·{" "}
            {preview.plan.textModel || "no model"}
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Preview result views"
          className="grid shrink-0 grid-cols-3 rounded-[7px] border border-[#d8d7cf] bg-white p-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "h-8 rounded-[5px] px-3 text-[12px] font-bold whitespace-nowrap transition",
                activeTab === tab.id
                  ? "bg-[#242421] text-white shadow-sm"
                  : "text-[#77766f] hover:bg-[#f4f4ef] hover:text-[#242421]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {preview.error && (
        <EmptyResult
          tone="error"
          title="Generation error"
          text={preview.error}
        />
      )}

      {activeTab === "slides" ? (
        <div className="space-y-4">
          <DebugSlideshowViewer preview={preview} />
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Status" value={preview.status} tone={preview.status} />
            <Stat label="Slides" value={String(slides.length)} />
            <Stat label="Language" value={preview.plan.language || "English"} />
            <Stat label="Model" value={preview.plan.textModel || "no model"} />
          </div>
          <div className="rounded-[8px] border border-[#e6e5de] bg-white p-4">
            <div className="text-[11px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
              Caption
            </div>
            <div className="mt-2 text-[13px] leading-5 font-semibold text-[#242421]">
              {preview.plan.caption || "No caption generated."}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "records" ? (
        <div className="rounded-[8px] border border-[#e6e5de] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-[#242421]">
                Slide Records
              </h3>
              <p className="mt-0.5 text-[12px] leading-5 font-semibold text-[#77766f]">
                Inspect the generated slide objects without leaving this result.
              </p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {slides.map((slide, index) => (
              <article
                key={slide.id || `${slide.imageUrl}-${index}`}
                className="overflow-hidden rounded-[8px] border border-[#e6e5de] bg-white"
              >
                <div className="flex items-center justify-between border-b border-[#eeeeea] px-3 py-2">
                  <div className="text-[12px] font-bold text-[#242421]">
                    Slide {index + 1}
                  </div>
                  <div className="rounded-[5px] bg-[#f1f0ea] px-2 py-1 text-[11px] font-bold text-[#77766f]">
                    {slide.role} · {slide.aspectRatio || "default"}
                  </div>
                </div>
                <div className="grid grid-cols-[132px_1fr] gap-3 p-3">
                  <div
                    className="overflow-hidden rounded-[6px] bg-[#deddd4]"
                    style={{ aspectRatio: aspectRatioCss(slide.aspectRatio) }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Debug view must render local DB image URLs directly. */}
                    <img
                      src={slide.imageUrl}
                      alt={
                        slide.imageCaption || slide.text || "Generated slide"
                      }
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] leading-6 font-bold text-[#242421]">
                      {slide.text}
                    </div>
                    <div className="mt-2 text-[12px] leading-5 font-semibold text-[#77766f]">
                      {slide.imageCaption || "No image caption"}
                    </div>
                    <dl className="mt-3 grid gap-2 text-[11px] font-semibold text-[#77766f]">
                      <div>
                        <dt className="font-bold text-[#242421]">Image key</dt>
                        <dd className="break-all">
                          {slide.imageKey || slide.imageUrl}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-[#242421]">Aspect</dt>
                        <dd>{slide.aspectRatio || "default"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "json" ? (
        <div className="overflow-hidden rounded-[8px] border border-[#e6e5de] bg-[#10100f] text-[#f4f4ef]">
          <div>
            <div className="border-b border-white/10 px-4 py-3 text-[13px] font-bold">
              Generated plan JSON
            </div>
            <pre className="max-h-[680px] overflow-auto p-4 text-[11px] leading-5">
              {JSON.stringify(preview.plan, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DebugSlideshowViewer({
  preview,
}: {
  preview: DebugAutomationPreview
}) {
  const slides = preview.plan.slides ?? []
  const [activeIndex, setActiveIndex] = useState(0)
  const clampedIndex = Math.min(activeIndex, Math.max(0, slides.length - 1))
  const activeSlide = slides[clampedIndex]

  if (!activeSlide) {
    return (
      <EmptyResult
        tone="error"
        title="No slides"
        text={preview.error || "The generated plan did not include slides."}
      />
    )
  }

  return (
    <section className="rounded-[8px] border border-[#d8d7cf] bg-[#fbfbf7] p-4">
      <div className="mb-4 min-w-0">
        <h3 className="truncate text-[16px] font-bold text-[#242421]">
          Slide Viewer
        </h3>
        <p className="mt-0.5 text-[12px] leading-5 font-semibold text-[#77766f]">
          Slide {clampedIndex + 1} of {slides.length} ·{" "}
          {activeSlide.aspectRatio || "default"} · {activeSlide.role}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,360px)_1fr]">
        <GeneratedSlideshowFrame
          slides={slides}
          statusLabel={preview.status}
          statusClassName={
            preview.status === "failed"
              ? "bg-[#d94444] text-white"
              : "bg-emerald-600 text-white"
          }
          onSlideChange={({ index }) => setActiveIndex(index)}
          renderOverlay={({ index }) => {
            const slide = slides[index]
            if (!slide) {
              return null
            }
            return <DebugSlideOverlay slide={slide} />
          }}
        />

        <div className="min-w-0">
          <div className="rounded-[8px] border border-[#e6e5de] bg-white p-4">
            <div className="text-[11px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
              Active Slide Text
            </div>
            <div className="mt-2 text-[20px] leading-7 font-bold text-[#242421]">
              {activeSlide.text}
            </div>
            <div className="mt-2 text-[12px] leading-5 font-semibold text-[#77766f]">
              {activeSlide.imageCaption || "No image caption"}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DebugSlideOverlay({
  slide,
}: {
  slide: DebugAutomationPreview["plan"]["slides"][number]
}) {
  const textItems = slide.textItems?.length
    ? slide.textItems
    : [
        {
          id: "fallback",
          text: slide.text,
          font: "",
          fontSize: "10px",
          textSize: { width: 70, height: 18 },
          textStyle: "whiteText",
          textAlign: "center",
          textAnchor: "padded",
          textPosition: { x: 50, y: 45 },
        },
      ]

  return (
    <>
      {slide.overlay ? <div className="absolute inset-0 bg-black/25" /> : null}
      {slide.overlayImage?.imageUrl ? (
        <div className="absolute inset-x-[12%] top-1/2 -translate-y-1/2 overflow-hidden rounded-[6px] shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- Debug overlay renders local DB image URLs directly. */}
          <img
            src={slide.overlayImage.imageUrl}
            alt={slide.overlayImage.imageCaption || ""}
            className="aspect-video w-full object-cover"
            draggable={false}
          />
        </div>
      ) : null}
      {slide.displayText !== false
        ? textItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "absolute px-2 py-1 font-bold break-words",
                textAlignClass(item.textAlign),
                textStyleClass(item.textStyle)
              )}
              style={{
                ...debugTextBoxStyle(item),
                fontSize: debugFontSize(item.fontSize),
                lineHeight: 1.1,
              }}
            >
              {item.text}
            </div>
          ))
        : null}
    </>
  )
}

function debugTextBoxStyle(item: {
  textAlign?: string
  textPosition: { x: number; y: number }
  textSize: { width: number }
}) {
  const width = Math.max(10, Math.min(90, item.textSize.width))
  const y = clampPercentNumber(item.textPosition.y)
  const x = boundedTextXPercent(item)
  if (item.textAlign === "left") {
    return {
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}%`,
      transform: "translateY(-50%)",
    }
  }
  if (item.textAlign === "right") {
    return {
      right: `${100 - x}%`,
      top: `${y}%`,
      width: `${width}%`,
      transform: "translateY(-50%)",
    }
  }
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}%`,
    transform: "translate(-50%, -50%)",
  }
}

function boundedTextXPercent(item: {
  textAlign?: string
  textPosition: { x: number }
  textSize: { width: number }
}) {
  const width = Math.max(10, Math.min(90, item.textSize.width))
  const safeMargin = 5
  const raw = clampPercentNumber(item.textPosition.x)
  if (item.textAlign === "left") {
    return Math.min(100 - width - safeMargin, Math.max(safeMargin, raw))
  }
  if (item.textAlign === "right") {
    return Math.min(100 - safeMargin, Math.max(width + safeMargin, raw))
  }
  return Math.min(
    100 - width / 2 - safeMargin,
    Math.max(width / 2 + safeMargin, raw)
  )
}

function aspectRatioCss(value: string | undefined) {
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
  if (value === "fit") {
    return "1 / 1"
  }
  return "9 / 16"
}

function clampPercentNumber(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50))
}

function debugFontSize(value: string | undefined) {
  const parsed = Number(value?.replace("px", ""))
  const size = Number.isFinite(parsed) ? parsed : 10
  return `${Math.max(12, Math.min(34, size * 2.2))}px`
}

function textAlignClass(value: string | undefined) {
  if (value === "left") {
    return "text-left"
  }
  if (value === "right") {
    return "text-right"
  }
  return "text-center"
}

function textStyleClass(value: string | undefined) {
  if (value === "yellowText") {
    return "text-[#ffe861] drop-shadow-[0_2px_3px_rgb(0_0_0/0.7)]"
  }
  if (value === "blackText") {
    return "text-[#121210]"
  }
  return "text-white drop-shadow-[0_2px_3px_rgb(0_0_0/0.8)]"
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "succeeded" | "failed"
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] border p-3",
        tone === "failed"
          ? "border-[#f0c1c1] bg-[#fff4f4]"
          : tone === "succeeded"
            ? "border-[#c8dfc4] bg-[#f3fbf0]"
            : "border-[#e6e5de] bg-[#fbfbf7]"
      )}
    >
      <div className="text-[11px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
        {label}
      </div>
      <div className="mt-1 truncate text-[15px] font-bold text-[#242421]">
        {value}
      </div>
    </div>
  )
}

function EmptyResult({
  title,
  text,
  tone,
}: {
  title: string
  text: string
  tone?: "error"
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] border p-5",
        tone === "error"
          ? "border-[#f0c1c1] bg-[#fff4f4] text-[#8a2d2d]"
          : "border-dashed border-[#d8d7cf] bg-[#fbfbf7] text-[#77766f]"
      )}
    >
      <div className="text-[14px] font-bold text-[#242421]">{title}</div>
      <div className="mt-1 text-[12px] leading-5 font-semibold">{text}</div>
    </div>
  )
}

function editableAutomationJson(value: unknown) {
  const editable = cloneJson(value)
  if (!isRecordValue(editable) || !isRecordValue(editable.schema)) {
    return editable
  }

  for (const key of hiddenRootKeys) {
    delete editable[key]
  }
  for (const key of hiddenSchemaKeys) {
    delete editable.schema[key]
  }
  hideNonOutputFormattingFields(editable.schema)
  return editable
}

function automationJsonForPreview(
  visibleValue: unknown,
  sourceRecord: AutomationRecord
) {
  const preview = cloneJson(visibleValue)
  if (!isRecordValue(preview) || !isRecordValue(preview.schema)) {
    return preview
  }

  const sourceSchema = sourceRecord.schema as unknown
  if (!isRecordValue(sourceSchema)) {
    return preview
  }

  for (const key of hiddenRootKeys) {
    const sourceValue = sourceRecord[key]
    if (sourceValue !== undefined) {
      preview[key] = cloneJson(sourceValue)
    }
  }
  for (const key of hiddenSchemaKeys) {
    if (key in sourceSchema) {
      preview.schema[key] = cloneJson(sourceSchema[key])
    }
  }
  return preview
}

function parseJsonText(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return {}
  }
}

function setEditorValue(editor: JSONEditor, value: string) {
  try {
    editor.set(JSON.parse(value))
  } catch {
    editor.setText(value)
  }
}

function editorText(editor: JSONEditor) {
  try {
    return prettyJson(editor.get())
  } catch {
    return editor.getText()
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hideNonOutputFormattingFields(schema: Record<string, unknown>) {
  if (isRecordValue(schema.image_collection_ids)) {
  }
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

const hiddenSchemaKeys = [
  "created_at",
  "status",
  "social_integrations",
  "social_post_settings",
  "social_publish_as",
  "schedule",
] as const

const hiddenRootKeys = [
  "sourceAutomationId",
  "sourceUrl",
  "status",
  "favorite",
  "theme",
  "importedAt",
  "updatedAt",
  "raw",
] as const
