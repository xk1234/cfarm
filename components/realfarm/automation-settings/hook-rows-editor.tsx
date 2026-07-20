"use client"

import { useRef } from "react"
import { toast } from "sonner"
import { IconCopy, IconLock, IconPlus, IconTrash } from "@tabler/icons-react"

import {
  automationHookId,
  type AutomationHookItem,
} from "@/lib/realfarm-automation"
import type { HookUsageState } from "@/lib/hook-publications"
import { cn } from "@/lib/utils"

export function HookRowsEditor({
  items,
  usage,
  safetyLockedIds = [],
  onChange,
}: {
  items: AutomationHookItem[]
  usage: HookUsageState[]
  safetyLockedIds?: string[]
  onChange: (items: AutomationHookItem[]) => void
}) {
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const usageById = new Map(usage.map((item) => [item.hookId, item]))
  const safetyLocked = new Set(safetyLockedIds)

  function focusSoon(id: string) {
    requestAnimationFrame(() => inputRefs.current.get(id)?.focus())
  }

  function addHook(afterIndex = items.length - 1, text = "") {
    const item = newHookItem(text, items.length)
    const next = [...items]
    next.splice(Math.max(0, afterIndex + 1), 0, item)
    onChange(next)
    focusSoon(item.id)
  }

  function updateItem(id: string, patch: Partial<AutomationHookItem>) {
    if (safetyLocked.has(id)) return
    onChange(
      items.map((item) =>
        item.id === id
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item
      )
    )
  }

  function pasteLines(index: number, raw: string) {
    if (!/\r?\n/.test(raw)) return false
    const current = items[index]
    if (usageById.get(current.id)?.used || safetyLocked.has(current.id)) {
      toast.error(
        "This hook is locked. Add the pasted hooks as new rows instead."
      )
      return true
    }
    const incoming = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const existing = new Set(
      items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item) => normalize(item.text))
    )
    let skipped = 0
    const accepted = incoming.filter((line) => {
      const key = normalize(line)
      if (!key || existing.has(key)) {
        skipped += 1
        return false
      }
      existing.add(key)
      return true
    })
    if (accepted.length === 0) {
      toast.message(
        `No hooks added${skipped ? ` · skipped ${skipped} duplicates` : ""}`
      )
      return true
    }
    const created = accepted.map((text, offset) =>
      offset === 0
        ? { ...current, text, updatedAt: new Date().toISOString() }
        : newHookItem(text, index + offset)
    )
    const next = [...items]
    next.splice(index, 1, ...created)
    onChange(next)
    toast.success(
      `Added ${accepted.length} ${accepted.length === 1 ? "hook" : "hooks"}${
        skipped ? ` · skipped ${skipped} duplicates` : ""
      }`
    )
    focusSoon(created.at(-1)!.id)
    return true
  }

  return (
    <div>
      <div className="overflow-hidden rounded-[10px] border border-app-panel-border bg-app-surface shadow-sm">
        {items.map((item, index) => {
          const used = usageById.get(item.id)
          const lockedForSafety = safetyLocked.has(item.id)
          const locked = Boolean(used?.used || lockedForSafety)
          return (
            <div
              key={item.id}
              className={cn(
                "flex min-h-12 items-center gap-3 border-b border-app-panel-border px-3 last:border-b-0",
                item.enabled ? "bg-app-surface" : "bg-app-surface-subtle"
              )}
            >
              <button
                type="button"
                role="switch"
                aria-checked={item.enabled}
                aria-label={`${item.enabled ? "Disable" : "Enable"} hook`}
                disabled={lockedForSafety}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                  item.enabled ? "bg-app-action" : "bg-[#c9c8c1]"
                )}
                onClick={() => updateItem(item.id, { enabled: !item.enabled })}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0 size-4 rounded-full bg-white shadow-sm transition-transform",
                    item.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                  )}
                />
              </button>
              <input
                ref={(node) => {
                  if (node) inputRefs.current.set(item.id, node)
                  else inputRefs.current.delete(item.id)
                }}
                value={item.text}
                disabled={locked}
                aria-label={`Hook ${index + 1}`}
                placeholder="Add a hook…"
                className="min-w-0 flex-1 bg-transparent py-3 text-[14px] font-medium text-app-text outline-none placeholder:text-app-text-faint disabled:cursor-default disabled:text-app-text-soft"
                onChange={(event) =>
                  updateItem(item.id, { text: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    addHook(index)
                  }
                }}
                onPaste={(event) => {
                  if (pasteLines(index, event.clipboardData.getData("text"))) {
                    event.preventDefault()
                  }
                }}
              />
              {locked ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eee9fb] px-2 py-1 text-[11px] font-semibold text-app-action"
                  title={
                    lockedForSafety
                      ? "Hook usage could not be verified"
                      : used?.lastPublishedAt
                        ? `Last published ${new Date(used.lastPublishedAt).toLocaleDateString()}`
                        : "Published hook"
                  }
                >
                  <IconLock className="size-3" />
                  {lockedForSafety
                    ? "Usage unavailable"
                    : `Used · ${used?.publishedPosts ?? 0}`}
                </span>
              ) : null}
              {used?.used ? (
                <button
                  type="button"
                  className="rounded-md p-1.5 text-app-text-faint hover:bg-app-surface-subtle hover:text-app-text"
                  aria-label="Duplicate hook"
                  onClick={() => addHook(index, `${item.text} variation`)}
                >
                  <IconCopy className="size-4" />
                </button>
              ) : null}
              <button
                type="button"
                disabled={locked}
                title={
                  lockedForSafety
                    ? "Hook usage must load before this hook can be deleted"
                    : used?.used
                      ? "Published hooks cannot be deleted"
                      : "Delete hook"
                }
                aria-label="Delete hook"
                className="rounded-md p-1.5 text-app-text-faint hover:bg-[#fff0ed] hover:text-[#b84a3a] disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() =>
                  onChange(items.filter((row) => row.id !== item.id))
                }
              >
                <IconTrash className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] border border-app-panel-border bg-app-surface px-3 py-2 text-[13px] font-semibold text-app-text shadow-sm hover:bg-app-surface-subtle"
        onClick={() => addHook()}
      >
        <IconPlus className="size-4" />
        Add hook
      </button>
    </div>
  )
}

function newHookItem(text: string, index: number): AutomationHookItem {
  const createdAt = new Date().toISOString()
  const id = `${automationHookId(text || createdAt)}_${index}_${crypto
    .randomUUID()
    .slice(0, 6)}`
  return { id, text, enabled: true, createdAt }
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}
