"use client"

import { useEffect, useMemo, useState } from "react"

import { SelectControl, SwitchPill } from "@/components/ui/form-controls"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import {
  automationHooks,
  automationTone,
  schemaWithAutomationHookSlots,
  schemaWithAutomationHooks,
  schemaWithAutomationTone,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import type { WordCollectionRecord } from "@/lib/word-collections"
import { cn } from "@/lib/utils"

import { SettingsFooter, SettingsPage, SettingsRow } from "./settings-layout"

const dynamicHookSlotPattern = /\[\[([a-zA-Z0-9_-]+)\]\]|\{([a-zA-Z0-9_-]+)\}/g

export function PromptTextarea({
  title,
  value,
  large,
  onChange,
}: {
  title: string
  value: string
  large?: boolean
  onChange?: (value: string) => void
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-[#242421]">
          {title}
        </span>
        <span className="flex items-center gap-2 text-[13px] font-semibold text-[#62615b]">
          Use prompt <SwitchPill enabled />
        </span>
      </div>
      <textarea
        className={cn(
          "w-full resize-none rounded-[8px] border border-[#d8d7cf] bg-white p-4 text-[14px] leading-6 font-medium outline-none focus:border-[#9f9e96]",
          large ? "h-32" : "h-24"
        )}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  )
}

export function PromptConfigPanel({
  automation,
  config,
  onConfigChange,
  onCancel,
  onSave,
}: {
  automation: Automation
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
  onCancel: () => void
  onSave: () => void
}) {
  const hooks = automationHooks(config)
  const dynamicSlots = useMemo(() => detectDynamicHookSlots(hooks), [hooks])
  const [wordCollections, setWordCollections] = useState<
    WordCollectionRecord[]
  >([])

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ collections?: WordCollectionRecord[] }>(
      "/api/word-collections",
      { toastOnError: false }
    )
      .then((payload) => {
        if (active) {
          setWordCollections(payload.collections ?? [])
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  function updateHooks(value: string) {
    const hooks = value
      .split("\n")
      .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
      .filter(Boolean)
    onConfigChange(schemaWithAutomationHooks(config, hooks))
  }

  function updateHookSlot(slot: string, collectionId: string) {
    const nextSlots = { ...(config.hook_slots ?? {}) }
    if (collectionId) {
      nextSlots[slot] = collectionId
    } else {
      delete nextSlots[slot]
    }
    onConfigChange(schemaWithAutomationHookSlots(config, nextSlots))
  }

  function selectedCollectionId(slot: string) {
    const explicit = config.hook_slots?.[slot]
    if (explicit) {
      return explicit
    }
    return (
      wordCollections.find(
        (collection) =>
          collection.id.toLowerCase() === slot.toLowerCase() ||
          collection.name.toLowerCase() === slot.toLowerCase()
      )?.id ?? ""
    )
  }

  function updateTone(value: string) {
    onConfigChange(schemaWithAutomationTone(config, value))
  }

  const tonePresets = [
    "Conversational & Relatable",
    "Motivational & Empowering",
    "Educational & Informative",
    "Bold & Provocative",
    "Calm & Reflective",
    "Witty & Humorous",
  ]
  const currentTone = automationTone(config)
  const selectedTone = tonePresets.includes(currentTone)
    ? currentTone
    : "Custom"

  return (
    <SettingsPage
      title="Hooks & Style"
      description={`Edit the narrative hooks and generation tone for ${automation.name}.`}
    >
      <div className="space-y-6">
        <SettingsRow
          title="Tone"
          description="Voice used for generated slide text."
          control={
            <SelectControl
              value={selectedTone}
              onChange={(event) => {
                const value = event.target.value
                updateTone(
                  value === "Custom"
                    ? "Write in a custom tone for this automation."
                    : value
                )
              }}
            >
              {[...tonePresets, "Custom"].map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </SelectControl>
          }
        />
        {selectedTone === "Custom" ? (
          <label className="block">
            <div className="mb-2">
              <div className="text-[16px] font-semibold text-[#242421]">
                Custom tone
              </div>
              <div className="mt-1 text-[14px] font-medium text-[#77766f]">
                Full voice and style instruction used for generated slide text.
              </div>
            </div>
            <textarea
              className="h-44 w-full resize-none rounded-[8px] border border-[#deddd5] bg-white p-5 text-[14px] leading-6 font-medium outline-none focus:border-[#9f9e96]"
              value={currentTone}
              onChange={(event) => updateTone(event.target.value)}
            />
          </label>
        ) : null}
        <label className="block">
          <div className="mb-2">
            <div className="text-[16px] font-semibold text-[#242421]">
              Hooks
            </div>
            <div className="mt-1 text-[14px] font-medium text-[#77766f]">
              One hook per line. These feed the slideshow editor and runner.
            </div>
          </div>
          <textarea
            className="h-72 w-full resize-none rounded-[8px] border border-[#deddd5] bg-white p-5 text-[14px] leading-6 font-medium outline-none focus:border-[#9f9e96]"
            value={hooks.join("\n")}
            onChange={(event) => updateHooks(event.target.value)}
          />
        </label>
        {dynamicSlots.length > 0 ? (
          <section className="rounded-[10px] border border-[#deddd5] bg-[#fafaf7] p-4">
            <div className="flex items-start justify-between gap-5">
              <div>
                <h3 className="text-[16px] font-semibold text-[#242421]">
                  Dynamic tags
                </h3>
                <p className="mt-1 max-w-[560px] text-[14px] leading-5 font-medium text-[#77766f]">
                  Tags such as <span className="font-mono">[[test]]</span> use a
                  same-name word collection by default, or you can map them to
                  another collection here.
                </p>
              </div>
              <span className="rounded-full border border-[#deddd5] bg-white px-2.5 py-1 text-[11px] font-bold text-[#77766f]">
                {dynamicSlots.length} detected
              </span>
            </div>
            <div className="mt-4 divide-y divide-[#e6e5de] rounded-[8px] border border-[#e6e5de] bg-white">
              {dynamicSlots.map((slot) => {
                const value = selectedCollectionId(slot)
                const collection = wordCollections.find(
                  (item) => item.id === value
                )
                return (
                  <div
                    key={slot}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_240px]"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[13px] font-bold text-[#242421]">
                        [[{slot}]]
                      </div>
                      <div className="mt-1 truncate text-[12px] font-semibold text-[#77766f]">
                        {collection
                          ? `${collection.words.length} values available`
                          : "No same-name collection found yet"}
                      </div>
                    </div>
                    <SelectControl
                      className="w-full"
                      value={value}
                      onChange={(event) =>
                        updateHookSlot(slot, event.target.value)
                      }
                    >
                      <option value="">Select collection</option>
                      {wordCollections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.name} ({collection.words.length})
                        </option>
                      ))}
                    </SelectControl>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}

function detectDynamicHookSlots(hooks: string[]) {
  const seen = new Set<string>()
  for (const hook of hooks) {
    for (const match of hook.matchAll(dynamicHookSlotPattern)) {
      const slot = (match[1] || match[2] || "").trim()
      if (slot) {
        seen.add(slot)
      }
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}
