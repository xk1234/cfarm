"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  IconArrowUpRight,
  IconGitFork,
  IconLoader2,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react"

import { slideshowWorkflowStorageKey } from "./slideshow-workflow"
import type { AutomationRunApiRecord } from "./types"

type ForkScope = "input" | "selection"

type PromptCandidate = {
  label: string
  path: string
  content: string
}

type Variation = {
  id: string
  name: string
  replacement: string
}

type ForkResponse = {
  error?: string
  groupId?: string
  runs?: Array<{
    run: AutomationRunApiRecord
    variationId: string
    variationName: string
    workflowUrl: string
    previewUrl?: string
    downloadUrl?: string
  }>
}

export function WorkflowForkPanel({
  run,
  prompt,
  onClose,
}: {
  run: AutomationRunApiRecord
  prompt: unknown
  onClose: () => void
}) {
  const candidates = useMemo(() => promptCandidates(prompt), [prompt])
  const initialCandidate = candidates.at(-1) ?? candidates[0]
  const [candidatePath, setCandidatePath] = useState(
    initialCandidate?.path ?? ""
  )
  const candidate =
    candidates.find((item) => item.path === candidatePath) ?? candidates[0]
  const [scope, setScope] = useState<ForkScope>("input")
  const [selection, setSelection] = useState({
    start: 0,
    end: 0,
    text: "",
  })
  const [variations, setVariations] = useState<Variation[]>([
    variation(0, "Variation A", initialCandidate?.content ?? ""),
  ])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<ForkResponse | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !running) onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", closeOnEscape)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, running])

  function resetForCandidate(path: string) {
    const next = candidates.find((item) => item.path === path)
    setCandidatePath(path)
    setSelection({ start: 0, end: 0, text: "" })
    setVariations([variation(0, "Variation A", next?.content ?? "")])
    setResult(null)
    setError("")
  }

  function changeScope(next: ForkScope) {
    if (!candidate) return
    setScope(next)
    setSelection({ start: 0, end: 0, text: "" })
    setVariations([
      variation(0, "Variation A", next === "input" ? candidate.content : ""),
    ])
    setResult(null)
    setError("")
  }

  function captureSelection() {
    const textarea = textareaRef.current
    if (!textarea || textarea.selectionEnd <= textarea.selectionStart) return
    const text = candidate.content.slice(
      textarea.selectionStart,
      textarea.selectionEnd
    )
    setSelection({
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      text,
    })
    setVariations((current) =>
      current.map((item) => ({ ...item, replacement: text }))
    )
    setResult(null)
    setError("")
  }

  async function runVariations() {
    if (!candidate) return
    const activeSelection =
      scope === "input"
        ? { start: 0, end: candidate.content.length, text: candidate.content }
        : selection
    if (!activeSelection.text) {
      setError("Select the part of the input you want to replace.")
      return
    }
    setRunning(true)
    setError("")
    setResult(null)
    try {
      const response = await fetch(
        `/api/automations/runs/${encodeURIComponent(run.id)}/fork`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stageId: "generate-text",
            scope,
            path: candidate.path,
            selectionStart: activeSelection.start,
            selectionEnd: activeSelection.end,
            selectedText: activeSelection.text,
            variations: variations.map(({ name, replacement }) => ({
              name,
              replacement,
            })),
          }),
        }
      )
      const payload = (await response.json().catch(() => ({}))) as ForkResponse
      if (!response.ok) {
        throw new Error(payload.error || "The workflow fork could not be run.")
      }
      for (const item of payload.runs ?? []) {
        window.sessionStorage.setItem(
          slideshowWorkflowStorageKey(item.run.id),
          JSON.stringify(item.run)
        )
      }
      setResult(payload)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The workflow fork could not be run."
      )
    } finally {
      setRunning(false)
    }
  }

  if (!candidate) {
    return (
      <ModalFrame title="Fork input" running={false} onClose={onClose}>
        <div className="rounded-[12px] border border-dashed border-app-panel-border bg-app-surface-subtle px-4 py-5 text-[13px] font-medium text-app-muted-text">
          This run does not contain an editable provider input.
        </div>
      </ModalFrame>
    )
  }

  const canRun =
    !running &&
    (scope === "input" || Boolean(selection.text)) &&
    variations.every((item) => item.name.trim())

  return (
    <ModalFrame title="Fork input" running={running} onClose={onClose}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-app-muted-text">
          <IconGitFork className="size-4 text-app-action" aria-hidden />
          {scope === "input" ? "Entire input" : "Selected passage"}
        </span>
        <button
          type="button"
          className="lc-focus-ring rounded-[6px] px-2 py-1 text-[12px] font-semibold text-app-action transition hover:bg-app-control-hover active:scale-[0.98]"
          onClick={() => changeScope(scope === "input" ? "selection" : "input")}
        >
          {scope === "input" ? "Fork only part of input" : "Fork entire input"}
        </button>
      </div>

      {candidates.length > 1 ? (
        <label className="mt-5 block">
          <span className="text-[11px] font-medium text-app-text-faint">
            Input
          </span>
          <select
            value={candidate.path}
            onChange={(event) => resetForCandidate(event.target.value)}
            className="lc-focus-ring mt-1.5 h-10 w-full rounded-[8px] border border-app-panel-border bg-app-surface px-3 text-[13px] font-semibold text-app-text"
          >
            {candidates.map((item) => (
              <option key={item.path} value={item.path}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {scope === "selection" ? (
        <>
          <label className="mt-4 block">
            <span className="text-[11px] font-medium text-app-text-faint">
              Select a passage to replace
            </span>
            <textarea
              ref={textareaRef}
              readOnly
              value={candidate.content}
              onSelect={captureSelection}
              onKeyUp={captureSelection}
              className="lc-focus-ring mt-1.5 min-h-52 w-full resize-y rounded-[10px] border border-app-panel-border bg-app-surface-subtle px-4 py-3 font-mono text-[12px] leading-5 text-app-text selection:bg-app-action/20"
            />
          </label>
          {selection.text ? (
            <div className="mt-4">
              <span className="text-[11px] font-medium text-app-text-faint">
                Selected passage
              </span>
              <blockquote className="mt-1.5 max-h-32 overflow-y-auto rounded-[8px] border-l-2 border-app-action bg-app-surface-subtle px-3 py-2 text-[12px] leading-5 whitespace-pre-wrap text-app-text">
                {selection.text}
              </blockquote>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-5 space-y-3">
        {variations.map((item, index) => (
          <article
            key={item.id}
            className="rounded-[12px] border border-app-panel-border p-3"
          >
            <div className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(event) =>
                  setVariations((current) =>
                    current.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, name: event.target.value }
                        : entry
                    )
                  )
                }
                aria-label={`Variation ${index + 1} name`}
                className="lc-focus-ring h-8 min-w-0 flex-1 rounded-[6px] bg-transparent px-2 text-[12px] font-semibold text-app-text"
              />
              {variations.length > 1 ? (
                <button
                  type="button"
                  className="lc-focus-ring grid size-8 place-items-center rounded-[6px] text-app-text-faint transition hover:bg-app-danger-surface hover:text-app-danger active:scale-[0.98]"
                  aria-label={`Remove ${item.name}`}
                  onClick={() =>
                    setVariations((current) =>
                      current.filter((entry) => entry.id !== item.id)
                    )
                  }
                >
                  <IconTrash className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <textarea
              value={item.replacement}
              onChange={(event) =>
                setVariations((current) =>
                  current.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, replacement: event.target.value }
                      : entry
                  )
                )
              }
              aria-label={`${item.name} ${scope === "input" ? "input" : "replacement"}`}
              placeholder={
                scope === "input" ? "Variation input" : "Replacement text"
              }
              className={`lc-focus-ring mt-2 w-full resize-y rounded-[8px] bg-app-surface-subtle px-3 py-2 text-[13px] leading-5 text-app-text ${scope === "input" ? "min-h-52 font-mono text-[12px]" : "min-h-28"}`}
            />
          </article>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {variations.length < 4 ? (
          <button
            type="button"
            className="lc-focus-ring inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-semibold text-app-muted-text transition hover:bg-app-control-hover hover:text-app-text active:scale-[0.98]"
            onClick={() =>
              setVariations((current) => [
                ...current,
                variation(
                  current.length,
                  `Variation ${letter(current.length)}`,
                  scope === "input" ? candidate.content : selection.text
                ),
              ])
            }
          >
            <IconPlus className="size-4" aria-hidden /> Add variation
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canRun}
          className="lc-focus-ring inline-flex h-9 items-center gap-2 rounded-[8px] bg-app-action px-4 text-[12px] font-semibold text-white transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => void runVariations()}
        >
          {running ? (
            <IconLoader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <IconGitFork className="size-4" aria-hidden />
          )}
          {running
            ? "Running downstream steps"
            : `Run ${variations.length} ${variations.length === 1 ? "variation" : "variations"}`}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-[8px] bg-app-danger-surface px-3 py-2 text-[12px] font-semibold text-app-danger">
          {error}
        </p>
      ) : null}

      {result?.runs?.length ? <ForkResults result={result} /> : null}
    </ModalFrame>
  )
}

function ModalFrame({
  title,
  running,
  onClose,
  children,
}: {
  title: string
  running: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-3 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-fork-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !running) onClose()
      }}
    >
      <section className="flex max-h-[min(90dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-[16px] border border-app-panel-border bg-app-surface shadow-[var(--app-shadow-card)]">
        <header className="flex shrink-0 items-center justify-between border-b border-app-panel-border px-5 py-4">
          <h2
            id="workflow-fork-title"
            className="text-[18px] font-semibold tracking-[-0.02em] text-app-text"
          >
            {title}
          </h2>
          <button
            type="button"
            disabled={running}
            aria-label="Close fork input"
            className="lc-focus-ring grid size-8 place-items-center rounded-[7px] text-app-text-faint transition hover:bg-app-control-hover hover:text-app-text active:scale-[0.98] disabled:opacity-40"
            onClick={onClose}
          >
            <IconX className="size-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
      </section>
    </div>
  )
}

function ForkResults({ result }: { result: ForkResponse }) {
  return (
    <section className="mt-5 border-t border-app-panel-border pt-4">
      <h3 className="text-[12px] font-semibold text-app-text">
        Variation results
      </h3>
      <div className="mt-2 space-y-2">
        {result.runs?.map((item) => (
          <article
            key={item.variationId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-app-surface-subtle px-3 py-3"
          >
            <div>
              <p className="text-[13px] font-semibold text-app-text">
                {item.variationName}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-app-success">
                Complete
              </p>
            </div>
            <div className="flex items-center gap-3 text-[12px] font-semibold">
              <Link
                href={item.workflowUrl}
                className="lc-focus-ring rounded-[5px] text-app-text hover:underline"
              >
                Workflow
              </Link>
              {item.previewUrl ? (
                <a
                  href={item.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="lc-focus-ring inline-flex items-center gap-1 rounded-[5px] text-app-action hover:underline"
                >
                  Final slideshow
                  <IconArrowUpRight className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function promptCandidates(value: unknown): PromptCandidate[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const messages = (value as Record<string, unknown>).messages
  if (!Array.isArray(messages)) return []
  return messages.flatMap((message, index) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return []
    }
    const record = message as Record<string, unknown>
    if (typeof record.content !== "string") return []
    const role = typeof record.role === "string" ? record.role : "message"
    return [
      {
        label: `${role.charAt(0).toUpperCase()}${role.slice(1)} prompt`,
        path: `/messages/${index}/content`,
        content: record.content,
      },
    ]
  })
}

function variation(
  index: number,
  name: string,
  replacement: string
): Variation {
  return {
    id: `variation-${index + 1}-${crypto.randomUUID()}`,
    name,
    replacement,
  }
}

function letter(index: number) {
  return String.fromCharCode("A".charCodeAt(0) + index)
}
