"use client"

import { useMemo, useState } from "react"
import { IconArrowLeft, IconPhoto } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  ApiClientError,
  createRender,
  type TemplateView,
} from "@/components/realfarm/api-client"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import {
  OUTPUT_FORMATS,
  type OutputFormat,
  type RenderRequest,
  type SlotValues,
  type SpecIssue,
} from "@/lib/render/spec"

import { SlotForm } from "./slot-form"
import {
  cleanSlotValues,
  initialSlotValues,
  issuesBySlotPath,
  slotValueIssues,
} from "./slot-values"
import { SpecPreview, useSpecPreview } from "./spec-preview"

export type RenderTarget = Pick<TemplateView, "id" | "name" | "spec" | "starter"> & {
  /** Pasted specs have no stored template. */
  source?: "template" | "pasted"
}

/** The request the slot filler sends: stored templates by id, starters/pasted specs inline. */
export function buildRenderRequest(
  target: RenderTarget,
  values: SlotValues,
  options: { title?: string; format?: OutputFormat; idempotencyKey?: string } = {}
): RenderRequest {
  const inline = target.starter || target.source === "pasted"
  return {
    ...(inline ? { spec: target.spec } : { templateId: target.id }),
    slotValues: cleanSlotValues(values),
    output: { format: options.format ?? "png", zip: true },
    ...(options.title?.trim() ? { title: options.title.trim() } : {}),
    wait: true,
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
  }
}

export function SlotFiller({
  target,
  initialValues,
  backLabel = "Back to templates",
  onBack,
  onRendered,
}: {
  target: RenderTarget
  initialValues?: SlotValues
  backLabel?: string
  onBack: () => void
  onRendered: (renderId: string) => void
}) {
  const [values, setValues] = useState<SlotValues>(() =>
    initialSlotValues(target.spec, initialValues)
  )
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({})
  const [title, setTitle] = useState(target.spec.name ?? target.name)
  const [format, setFormat] = useState<OutputFormat>("png")
  const [submitted, setSubmitted] = useState(false)
  const [serverIssues, setServerIssues] = useState<SpecIssue[]>([])
  const [rendering, setRendering] = useState(false)

  const localIssues = useMemo(() => slotValueIssues(target.spec, values), [target.spec, values])
  const issues = useMemo(
    () => issuesBySlotPath(submitted ? [...localIssues.errors, ...serverIssues] : serverIssues),
    [localIssues.errors, serverIssues, submitted]
  )
  const preview = useSpecPreview({ spec: target.spec, slotValues: values })
  const otherServerIssues = serverIssues.filter((issue) => !issue.path.startsWith("/slotValues"))

  async function render() {
    setSubmitted(true)
    setServerIssues([])
    if (localIssues.errors.length > 0) {
      toast.error(localIssues.errors[0].message)
      return
    }
    setRendering(true)
    try {
      const result = await createRender(
        buildRenderRequest(target, values, { title, format })
      )
      onRendered(result.id)
    } catch (error) {
      if (error instanceof ApiClientError && error.issues.length > 0) {
        setServerIssues(error.issues)
      }
      toast.error(error instanceof Error ? error.message : "Render failed.")
    } finally {
      setRendering(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label={backLabel} onClick={onBack}>
            <IconArrowLeft />
          </IconButton>
          <h1 className="min-w-0 truncate text-[22px] font-semibold tracking-[-0.02em] text-app-text">
            {target.name}
          </h1>
        </div>
        <Button
          type="button"
          variant="action"
          size="appDefault"
          className="min-w-[132px] self-start sm:self-auto"
          disabled={rendering}
          onClick={() => void render()}
        >
          <IconPhoto />
          {rendering ? "Rendering…" : "Render"}
        </Button>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="order-2 min-w-0 space-y-8 lg:order-1">
          <section className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-app-text">Render title</span>
              <input
                value={title}
                maxLength={512}
                onChange={(event) => setTitle(event.target.value)}
                className="h-9 w-full rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 text-sm outline-none focus:border-app-action"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-app-text">Format</span>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as OutputFormat)}
                className="h-9 w-full rounded-[10px] border border-app-panel-border bg-app-control-bg px-3 text-sm uppercase outline-none focus:border-app-action"
              >
                {OUTPUT_FORMATS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <SlotForm
            spec={target.spec}
            values={values}
            onChange={setValues}
            issues={issues}
            thumbnails={thumbnails}
            onThumbnail={(key, url) => setThumbnails((current) => ({ ...current, [key]: url }))}
            disabled={rendering}
          />
          {otherServerIssues.length > 0 ? (
            <ul role="alert" className="space-y-1 rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted">
              {otherServerIssues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  <span className="font-mono text-xs">{issue.path || "/"}</span> {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <section className="order-1 min-w-0 space-y-3 lg:order-2">
          <h2 className="text-sm font-semibold text-app-text">Preview</h2>
          <SpecPreview spec={target.spec} state={preview} emptyLabel="Live preview" />
        </section>
      </div>
    </div>
  )
}
