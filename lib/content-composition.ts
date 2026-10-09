import { randomUUID } from "node:crypto"

import type { ContentOutput } from "@/lib/content-outputs"

export type ContentGeneration = {
  id: string
  templateId: string
  inputOutputIds: string[]
  outputIds: string[]
  status: "processing" | "ready" | "failed"
  createdAt: string
  error?: string
}

export type PublishGateMetadata = {
  title?: string
  caption?: string
  description?: string
  hashtags: string[]
}

export function compositionPrompt(outputs: readonly ContentOutput[]) {
  return outputs
    .map((output, index) => {
      const media = output.media
        .filter((item) => item.kind !== "thumbnail")
        .map((item) => item.url)
      return [
        `Input ${index + 1} (${output.kind})`,
        `Title: ${output.title}`,
        output.text ? `Content:\n${output.text}` : "",
        media.length > 0 ? `Media:\n${media.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n\n")
}

export function publishGateContent(
  outputs: readonly ContentOutput[],
  metadata: PublishGateMetadata
) {
  const parts = [
    metadata.caption?.trim(),
    metadata.description?.trim(),
    ...outputs
      .filter((output) => output.kind === "text")
      .map((output) => output.text.trim()),
    normalizeHashtags(metadata.hashtags),
  ].filter(Boolean)
  return parts.join("\n\n")
}

export function publishGateMedia(outputs: readonly ContentOutput[]) {
  return outputs.flatMap((output) =>
    output.media
      .filter((item) => item.kind !== "thumbnail")
      .sort((left, right) => left.order - right.order)
      .map((item) => ({
        id: `${output.id}:${item.order}`,
        kind: item.kind as "image" | "video",
        url: item.url,
        alt: output.title,
      }))
  )
}

export function generationRecord(input: {
  templateId: string
  inputOutputIds?: readonly string[]
  outputIds?: readonly string[]
  status?: ContentGeneration["status"]
  error?: string
  id?: string
  now?: Date
}): ContentGeneration {
  return {
    id: input.id ?? randomUUID(),
    templateId: input.templateId,
    inputOutputIds: [...(input.inputOutputIds ?? [])],
    outputIds: [...(input.outputIds ?? [])],
    status: input.status ?? "ready",
    createdAt: (input.now ?? new Date()).toISOString(),
    error: input.error,
  }
}

function normalizeHashtags(values: readonly string[]) {
  return values
    .flatMap((value) => value.split(/[\s,]+/))
    .map((value) => value.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((value) => `#${value.replace(/\s+/g, "")}`)
    .join(" ")
}
