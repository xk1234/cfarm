"use client"

import { useId, useRef, type ChangeEvent } from "react"
import { IconAlertTriangle, IconCircleCheck, IconUpload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { SPEC_LIMITS } from "@/lib/render/spec"
import { cn } from "@/lib/utils"

import { issueLocationLabel, type LocatedIssue, type SpecJsonAnalysis } from "./spec-json"

/** Paste/upload a spec with inline, path-annotated validation results. */
export function SpecJsonInput({
  value,
  analysis,
  onChange,
}: {
  value: string
  analysis: SpecJsonAnalysis
  onChange: (value: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const id = useId()
  const statusId = `${id}-status`

  function focusOffset(offset: number) {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    const lineEnd = value.indexOf("\n", offset)
    textarea.setSelectionRange(offset, lineEnd === -1 ? value.length : lineEnd)
    const line = value.slice(0, offset).split("\n").length
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 18
    textarea.scrollTop = Math.max(0, (line - 4) * lineHeight)
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    // Oversized files still load so validation can report `limits.spec_size`.
    onChange(await file.slice(0, SPEC_LIMITS.maxSpecBytes * 4).text())
  }

  const invalid = analysis.status === "invalid" || analysis.status === "parse_error"

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-app-text">
          Spec JSON
        </label>
        <Button
          type="button"
          variant="softControl"
          size="appDefault"
          onClick={() => fileRef.current?.click()}
        >
          <IconUpload />
          Upload JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void readFile(event)}
        />
      </div>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={statusId}
        placeholder={'{\n  "version": 1,\n  "canvas": { "preset": "9:16" },\n  "slides": [ … ]\n}'}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "block h-[min(60vh,520px)] min-h-64 w-full resize-y rounded-xl border bg-app-control-bg p-3 font-mono text-[12px] leading-[18px] text-app-text outline-none focus:border-app-action",
          invalid ? "border-app-danger" : "border-app-panel-border"
        )}
      />
      <div id={statusId} aria-live="polite">
        <SpecJsonStatus analysis={analysis} onJump={focusOffset} />
      </div>
    </div>
  )
}

export function SpecJsonStatus({
  analysis,
  onJump,
}: {
  analysis: SpecJsonAnalysis
  onJump?: (offset: number) => void
}) {
  if (analysis.status === "empty") return null
  if (analysis.status === "parse_error") {
    return (
      <div role="alert" className="rounded-xl bg-app-danger-surface p-3 text-sm text-app-danger-muted">
        <p className="flex items-center gap-2 font-semibold">
          <IconAlertTriangle className="size-4" />
          Invalid JSON
          {analysis.location ? ` at line ${analysis.location.line}, column ${analysis.location.column}` : ""}
        </p>
        <p className="mt-1 font-mono text-xs">{analysis.message}</p>
      </div>
    )
  }
  if (analysis.status === "invalid") {
    return (
      <div role="alert" className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-app-danger-muted">
          <IconAlertTriangle className="size-4" />
          {analysis.errors.length === 1 ? "1 error" : `${analysis.errors.length} errors`}
        </p>
        <IssueList issues={analysis.errors} tone="error" onJump={onJump} />
        {analysis.warnings.length > 0 ? (
          <IssueList issues={analysis.warnings} tone="warning" onJump={onJump} />
        ) : null}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-app-success">
        <IconCircleCheck className="size-4" />
        {analysis.needsSlotValues
          ? "Valid template. Fill its slots to render."
          : "Valid spec. Ready to render."}
      </p>
      {analysis.warnings.length > 0 ? (
        <IssueList issues={analysis.warnings} tone="warning" onJump={onJump} />
      ) : null}
    </div>
  )
}

function IssueList({
  issues,
  tone,
  onJump,
}: {
  issues: LocatedIssue[]
  tone: "error" | "warning"
  onJump?: (offset: number) => void
}) {
  return (
    <ul className="divide-y divide-app-panel-border overflow-hidden rounded-xl border border-app-panel-border bg-app-surface">
      {issues.map((issue, index) => {
        const content = (
          <>
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold",
                tone === "error"
                  ? "bg-app-danger-surface text-app-danger-muted"
                  : "bg-app-warning-surface text-app-warning"
              )}
            >
              {issue.code}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-app-text">{issue.message}</span>
              <span className="block truncate font-mono text-[11px] text-app-muted-text">
                {issueLocationLabel(issue)}
              </span>
            </span>
          </>
        )
        return (
          <li key={`${issue.code}-${issue.textPath}-${index}`}>
            {onJump && issue.location ? (
              <button
                type="button"
                onClick={() => onJump(issue.location!.offset)}
                className="lc-focus-ring flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-app-control-hover"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start gap-3 px-3 py-2">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
