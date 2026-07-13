"use client"

import { useRef, useState } from "react"

import type { WordCollectionRecord } from "@/lib/word-collections"
import { cn } from "@/lib/utils"

const hookVariablePattern = /\[\[([a-zA-Z0-9_-]+)\]\]|\{([a-zA-Z0-9_-]+)\}/g

export type HookEditorSegment = {
  text: string
  slot?: string
}

export function hookEditorSegments(value: string): HookEditorSegment[] {
  const segments: HookEditorSegment[] = []
  let cursor = 0
  for (const match of value.matchAll(hookVariablePattern)) {
    const index = match.index ?? 0
    if (index > cursor) {
      segments.push({ text: value.slice(cursor, index) })
    }
    segments.push({ text: match[0], slot: match[1] || match[2] })
    cursor = index + match[0].length
  }
  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor) })
  }
  if (value.endsWith("\n")) {
    segments.push({ text: " " })
  }
  return segments
}

export function collectionForHookSlot(input: {
  slot: string
  hookSlots?: Record<string, string>
  collections: WordCollectionRecord[]
}) {
  const explicitId = input.hookSlots?.[input.slot]
  const lookup = explicitId || input.slot
  return input.collections.find(
    (collection) =>
      collection.id.toLowerCase() === lookup.toLowerCase() ||
      collection.name.toLowerCase() === lookup.toLowerCase()
  )
}

export function HookVariableEditor({
  value,
  collections,
  hookSlots,
  onChange,
}: {
  value: string
  collections: WordCollectionRecord[]
  hookSlots?: Record<string, string>
  onChange: (value: string) => void
}) {
  const highlightRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<{
    slot: string
    collection?: WordCollectionRecord
    left: number
    top: number
  } | null>(null)

  return (
    <>
      <div className="relative h-72 w-full rounded-[8px] border border-[#deddd5] bg-white focus-within:border-[#9f9e96]">
        <div
          ref={highlightRef}
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden whitespace-pre-wrap break-words p-5 text-[14px] leading-6 font-medium text-[#242421]"
          aria-hidden="true"
        >
          {hookEditorSegments(value).map((segment, index) => {
            if (!segment.slot) {
              return <span key={index}>{segment.text}</span>
            }
            const collection = collectionForHookSlot({
              slot: segment.slot,
              hookSlots,
              collections,
            })
            return (
              <span
                key={`${index}-${segment.slot}`}
                className={cn(
                  "pointer-events-auto relative cursor-help rounded-[4px] px-0.5 font-mono font-bold",
                  collection
                    ? "bg-[#eee7ff] text-[#6d28d9]"
                    : "bg-[#fff0d8] text-[#a15c00]"
                )}
                onMouseEnter={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setHovered({
                    slot: segment.slot!,
                    collection,
                    left: Math.min(window.innerWidth - 180, rect.left + rect.width / 2),
                    top: rect.bottom + 8,
                  })
                }}
                onMouseLeave={() => setHovered(null)}
              >
                {segment.text}
              </span>
            )
          })}
        </div>
        <textarea
          className="absolute inset-0 z-10 h-full w-full resize-none overflow-auto bg-transparent p-5 text-[14px] leading-6 font-medium text-transparent caret-[#242421] outline-none selection:bg-[#cdb8ff]/50"
          value={value}
          aria-label="Hooks"
          spellCheck={false}
          onScroll={(event) => {
            if (highlightRef.current) {
              highlightRef.current.scrollTop = event.currentTarget.scrollTop
              highlightRef.current.scrollLeft = event.currentTarget.scrollLeft
            }
          }}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {hovered ? (
        <div
          className="pointer-events-none fixed z-[100] w-[min(360px,calc(100vw-24px))] -translate-x-1/2 rounded-[9px] border border-[#ddd4f3] bg-white p-3 text-left shadow-[0_12px_36px_rgba(39,27,68,0.2)]"
          style={{ left: hovered.left, top: hovered.top }}
          role="tooltip"
        >
          <div className="font-mono text-[12px] font-bold text-[#6d28d9]">
            [[{hovered.slot}]]
          </div>
          {hovered.collection ? (
            <>
              <div className="mt-1 text-[11px] font-semibold text-[#77766f]">
                {hovered.collection.name} · {hovered.collection.words.length} values
              </div>
              <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-hidden">
                {hovered.collection.words.map((word) => (
                  <span
                    key={word}
                    className="rounded-full bg-[#f1edfa] px-2 py-1 text-[10px] font-semibold text-[#4f426b]"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-1 text-[11px] font-semibold text-[#a15c00]">
              No variable collection is mapped to this tag.
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}
