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

  // The highlight layer must have IDENTICAL text metrics to the textarea
  // beneath it: any font, weight, or padding difference on the slot tokens
  // shifts line wrapping, so the visible text no longer sits where the
  // textarea's invisible text actually is — clicks then land on the wrong
  // character. Token styling is therefore limited to background/color, and
  // the layer never intercepts pointer events (tooltips are hit-tested from
  // wrapper mousemove instead, so clicks always reach the textarea).
  function hoverFromPoint(clientX: number, clientY: number) {
    const spans =
      highlightRef.current?.querySelectorAll<HTMLElement>("[data-slot]") ?? []
    for (const span of spans) {
      const rect = span.getBoundingClientRect()
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        const slot = span.dataset.slot
        if (!slot) continue
        const top = rect.bottom + 8
        setHovered((current) =>
          current?.slot === slot && Math.abs(current.top - top) < 1
            ? current
            : {
                slot,
                collection: collectionForHookSlot({
                  slot,
                  hookSlots,
                  collections,
                }),
                left: Math.min(
                  window.innerWidth - 180,
                  rect.left + rect.width / 2
                ),
                top,
              }
        )
        return
      }
    }
    setHovered((current) => (current ? null : current))
  }

  return (
    <>
      <div
        className="relative h-72 w-full rounded-[8px] border border-[#deddd5] bg-white focus-within:border-[#9f9e96]"
        onMouseMove={(event) => hoverFromPoint(event.clientX, event.clientY)}
        onMouseLeave={() => setHovered(null)}
      >
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
                data-slot={segment.slot}
                className={cn(
                  "rounded-[4px]",
                  collection
                    ? "bg-[#eee7ff] text-[#6d28d9]"
                    : "bg-[#fff0d8] text-[#a15c00]"
                )}
              >
                {segment.text}
              </span>
            )
          })}
        </div>
        <textarea
          className="absolute inset-0 z-10 h-full w-full resize-none overflow-auto bg-transparent p-5 text-[14px] leading-6 font-medium break-words text-transparent caret-[#242421] outline-none selection:bg-[#cdb8ff]/50"
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
