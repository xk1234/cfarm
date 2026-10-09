import { WorkflowArtifactPreview } from "@/components/realfarm/workflow-artifacts/artifact-preview"
import { JsonViewer } from "@/components/ui/json-viewer"

import type { WorkflowArtifact } from "./types"

export function WorkflowArtifactView({
  artifact,
  stageId,
  direction,
}: {
  artifact: WorkflowArtifact
  stageId: string
  direction: "input" | "output"
}) {
  return (
    <WorkflowArtifactPreview
      value={previewValue(artifact)}
      context={{ direction, stageId: previewStageId(stageId, artifact) }}
    />
  )
}

export function RawStageData({
  value,
  label,
}: {
  value: unknown
  label: string
}) {
  return (
    <details className="mt-8 border-t border-app-panel-border pt-4">
      <summary className="lc-focus-ring w-fit cursor-pointer rounded text-xs font-semibold text-app-muted-text hover:text-app-text">
        Raw stage data
      </summary>
      <JsonViewer
        value={parseSerializedJson(value)}
        label={label}
        compact
        className="mt-4"
      />
    </details>
  )
}

function previewStageId(stageId: string, artifact: WorkflowArtifact) {
  if (artifact.kind === "prompt") return `${stageId}-prompt`
  if (artifact.kind === "copy") return `${stageId}-script`
  if (artifact.kind === "qa") return `${stageId}-quality`
  return stageId
}

function previewValue(artifact: WorkflowArtifact) {
  const value = parseSerializedJson(artifact.value)
  const record = asRecord(value)

  if (artifact.kind === "media-gallery" && record) {
    const selectedImages = Array.isArray(record.slides)
      ? record.slides
      : Array.isArray(record.renderedSlides)
        ? record.renderedSlides
        : Array.isArray(record.outputImages)
          ? record.outputImages.map((url, index) => ({
              slide: index + 1,
              imageUrl: url,
            }))
          : []
    return { ...record, selectedImages }
  }

  if (
    artifact.kind === "final" &&
    record &&
    !Array.isArray(record.slides) &&
    Array.isArray(record.outputImages)
  ) {
    return {
      ...record,
      renderedSlides: record.outputImages.map((url, index) => ({
        slide: index + 1,
        imageUrl: url,
      })),
    }
  }

  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseSerializedJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}
