"use client"

import { IconX } from "@tabler/icons-react"

import type { CharacterRecord } from "@/lib/characters"
import {
  characterGenerationPrimaryMedia,
  defaultCharacterPreviewUrl,
  type CharacterImageGenerationRecord,
  type CharacterPromptAttachment,
} from "@/lib/realfarm-character-ui"
import { cn } from "@/lib/utils"

import { ratioToCss } from "./workflow-helpers"

export function CharacterAvatar({
  character,
  sizeClassName,
}: {
  character: CharacterRecord
  sizeClassName: string
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border-2 border-white bg-cover bg-center shadow-sm",
        sizeClassName
      )}
      role="img"
      aria-label={character.name}
      style={{
        backgroundImage: `url(${character.preview_url || defaultCharacterPreviewUrl})`,
      }}
    />
  )
}

export function GenerationPreview({
  generation,
  selectedCharacter,
  selected,
}: {
  generation: CharacterImageGenerationRecord
  selectedCharacter: CharacterRecord
  selected?: boolean
}) {
  const primaryMedia = characterGenerationPrimaryMedia(generation)

  return (
    <div
      className={cn(
        "relative grid overflow-hidden rounded-xl bg-app-media-empty transition group-hover:ring-2 group-hover:ring-app-action/60",
        selected && "ring-2 ring-app-action"
      )}
      style={{ aspectRatio: ratioToCss(generation.aspectRatio) }}
    >
      {generation.status === "processing" ? (
        <div className="grid place-items-center px-6">
          <div className="w-full">
            <div className="mb-4 flex items-center justify-center">
              <CharacterAvatar
                character={selectedCharacter}
                sizeClassName="size-16"
              />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-app-surface">
              <div
                className="h-full rounded-full bg-app-action transition-all"
                style={{ width: `${generation.progress}%` }}
              />
            </div>
            <div className="mt-3 text-center text-[12px] font-medium text-app-muted-text">
              Generating…
            </div>
          </div>
        </div>
      ) : primaryMedia?.type === "video" ? (
        <video
          src={primaryMedia.url}
          className="h-full w-full object-cover"
          muted
          playsInline
          controls
        />
      ) : primaryMedia?.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- Generated local image URL is returned by the app API.
        <img
          src={primaryMedia.url}
          alt={generation.prompt || "Generated character image"}
          className="h-full w-full object-cover"
        />
      ) : generation.status === "failed" ? (
        <div className="grid place-items-center px-5 text-center">
          <div>
            <IconX className="mx-auto size-8 text-app-danger" />
            <div className="mt-3 text-[13px] font-medium text-app-danger-muted">
              {generation.error || "Generation failed"}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid place-items-center">
          <CharacterAvatar
            character={selectedCharacter}
            sizeClassName="size-20"
          />
        </div>
      )}
    </div>
  )
}

export type PromptInputItem = {
  id: string
  url: string
  label: string
  isVideo?: boolean
  accent?: boolean
  onRemove?: () => void
}

export function PromptInputRow({
  items,
  ariaLabel,
}: {
  items: PromptInputItem[]
  ariaLabel: string
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2" aria-label={ariaLabel}>
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "group/input relative size-16 shrink-0 overflow-hidden rounded-xl border bg-app-media-empty",
            item.accent ? "border-app-action" : "border-app-panel-border"
          )}
          title={item.label}
        >
          {item.isVideo ? (
            <video
              src={item.url}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- Local/generated thumbnails can be blob or local API URLs.
            <img
              src={item.url}
              alt={item.label}
              className="h-full w-full object-cover"
            />
          )}
          <span
            className={cn(
              "absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5 text-[10px] font-medium text-white",
              item.accent ? "bg-app-action/90" : "bg-black/55"
            )}
          >
            {item.label}
          </span>
          {item.onRemove && (
            <button
              type="button"
              className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover/input:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove ${item.label}`}
              onClick={item.onRemove}
            >
              <IconX className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function AttachmentSquareRow({
  attachments,
  ariaLabel,
}: {
  attachments: CharacterPromptAttachment[]
  ariaLabel: string
}) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex gap-2 overflow-x-auto" aria-label={ariaLabel}>
      {attachments.map((attachment) => (
        <a
          key={`${attachment.kind}-${attachment.url}`}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          title={attachment.label}
          className="block size-14 shrink-0 overflow-hidden rounded-xl border border-app-panel-border bg-app-surface-subtle transition hover:-translate-y-0.5 hover:border-app-muted-text/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Local/generated attachment thumbnails can be blob or local API URLs. */}
          <img
            src={attachment.url}
            alt={attachment.label}
            className="h-full w-full object-cover"
          />
        </a>
      ))}
    </div>
  )
}
