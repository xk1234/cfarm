"use client"

import { useEffect, useMemo, useState } from "react"

import {
  SelectControl,
  SwitchPill,
  SwitchPillButton,
} from "@/components/ui/form-controls"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import {
  aspectRatioLabel,
  automationAspectRatios,
  automationHooks,
  automationSharedSlideStyle,
  automationTonePresetOptions,
  automationToneRawValue,
  automationToneSelection,
  labelToAspectRatio,
  schemaWithAutomationHookSlots,
  schemaWithAutomationHookCase,
  schemaWithAutomationHooks,
  schemaWithAutomationTone,
  schemaWithAutomationSharedSlideStyle,
  type AutomationImageFit,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import {
  applyHookCase,
  detectHookCaseMode,
  hookCaseModes,
  normalizeHookVariables,
  type HookCaseMode,
} from "@/lib/hook-casing"
import type { Automation } from "@/lib/realfarm-data"
import type { WordCollectionRecord } from "@/lib/word-collections"
import { cn } from "@/lib/utils"

import { SettingsFooter, SettingsPage, SettingsRow } from "./settings-layout"
import { HookVariableEditor } from "./hook-variable-editor"

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
  const [activeTab, setActiveTab] = useState<"hooks" | "style" | "slides">(
    "hooks"
  )
  const isVideoAutomation = config.automationKind === "video"
  const tabs = isVideoAutomation
    ? (["hooks", "style"] as const)
    : (["hooks", "style", "slides"] as const)
  // Raw editor text. Normalizing (trim/dedupe empty lines) on every keystroke
  // would rewrite the textarea under the caret — e.g. pressing Enter would be
  // undone instantly — so the editor edits this draft and only the cleaned
  // lines are written to the config.
  const [hooksDraft, setHooksDraft] = useState(() =>
    normalizeHookVariables(hooks.join("\n"))
  )
  const detectedHookCase = detectHookCaseMode(
    hooksDraft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  )
  const selectedHookCase =
    config.prompt_formatting.hook_case ?? detectedHookCase
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
    // Variables are case-insensitive; canonicalize them to uppercase as you
    // type. The transform preserves string length, so the caret never moves.
    const normalized = normalizeHookVariables(value)
    const cased = normalized
      .split("\n")
      .map((line) => applyHookCase(line, selectedHookCase))
      .join("\n")
    setHooksDraft(cased)
    const hooks = cased
      .split("\n")
      .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
      .filter(Boolean)
    onConfigChange(schemaWithAutomationHooks(config, hooks))
  }

  function updateHookCase(mode: HookCaseMode) {
    const nextDraft = hooksDraft
      .split("\n")
      .map((line) => applyHookCase(line, mode))
      .join("\n")
    const nextHooks = nextDraft
      .split("\n")
      .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
      .filter(Boolean)
    setHooksDraft(nextDraft)
    onConfigChange(
      schemaWithAutomationHookCase(
        schemaWithAutomationHooks(config, nextHooks),
        mode
      )
    )
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

  const rawToneValue = automationToneRawValue(config)
  const selectedTone = automationToneSelection(config)
  const sharedSlideStyle = automationSharedSlideStyle(config)

  return (
    <SettingsPage
      title={isVideoAutomation ? "Hooks & Voice" : "Hooks & Style"}
      description={
        isVideoAutomation
          ? `Edit the hooks and writing voice used to generate ${automation.name} videos.`
          : `Edit hooks, voice, and shared slideshow styling for ${automation.name}.`
      }
    >
      <div
        className={cn(
          "mb-6 grid h-11 overflow-hidden rounded-[9px] border border-[#deddd5] bg-[#f6f5f0] text-[13px] font-semibold",
          isVideoAutomation ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "border-r border-[#deddd5] last:border-r-0",
              activeTab === tab
                ? "bg-white text-[#242421] shadow-sm"
                : "text-[#85847d]"
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "hooks"
              ? "Hooks"
              : tab === "style"
                ? "Style"
                : "Slide Settings"}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {activeTab === "hooks" ? (
          <>
            <label className="block">
              <div className="mb-2 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[16px] font-semibold text-[#242421]">
                    Hooks
                  </div>
                  <div className="mt-1 text-[14px] font-medium text-[#77766f]">
                    One hook per line. Variables stay uppercase here and inherit
                    the selected casing when resolved.
                  </div>
                </div>
                <SelectControl
                  className="w-48 shrink-0"
                  aria-label="Hook casing"
                  value={selectedHookCase}
                  onChange={(event) =>
                    updateHookCase(event.target.value as HookCaseMode)
                  }
                >
                  {hookCaseModes
                    .filter(
                      (mode) => mode !== "mixed" || detectedHookCase === "mixed"
                    )
                    .map((mode) => (
                      <option key={mode} value={mode}>
                        {hookCaseLabel(mode)}
                      </option>
                    ))}
                </SelectControl>
              </div>
              <HookVariableEditor
                value={hooksDraft}
                collections={wordCollections}
                hookSlots={config.hook_slots}
                onChange={updateHooks}
              />
            </label>
            <div className="flex items-start justify-between gap-5 rounded-[10px] border border-[#deddd5] bg-[#fafaf7] p-4">
              <div>
                <div className="text-[15px] font-semibold text-[#242421]">
                  No duplicate values per hook
                </div>
                <p className="mt-1 max-w-[560px] text-[13px] leading-5 font-medium text-[#77766f]">
                  Repeated variables draw different values within the same hook.
                </p>
              </div>
              <SwitchPillButton
                enabled={config.hook_no_duplicate_slots === true}
                aria-label="Toggle no duplicate values per hook"
                onClick={() =>
                  onConfigChange({
                    ...config,
                    hook_no_duplicate_slots:
                      config.hook_no_duplicate_slots !== true,
                  })
                }
              />
            </div>
            {dynamicSlots.length > 0 ? (
              <section className="rounded-[10px] border border-[#deddd5] bg-[#fafaf7] p-4">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#242421]">
                      Dynamic tags
                    </h3>
                    <p className="mt-1 text-[14px] font-medium text-[#77766f]">
                      Map each variable to a word collection.
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
                              : "No collection mapped"}
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
                          {wordCollections.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.words.length})
                            </option>
                          ))}
                        </SelectControl>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {activeTab === "style" ? (
          <>
            <SettingsRow
              title="Tone"
              description={
                isVideoAutomation
                  ? "Voice used for generated video copy."
                  : "Voice used for generated slide text."
              }
              control={
                <SelectControl
                  value={selectedTone}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === "Custom")
                      onConfigChange(
                        schemaWithAutomationTone(config, "", "custom")
                      )
                    else updateTone(value)
                  }}
                >
                  {[...automationTonePresetOptions, "Custom"].map((tone) => (
                    <option key={tone} value={tone}>
                      {tone}
                    </option>
                  ))}
                </SelectControl>
              }
            />
            {selectedTone === "Custom" ? (
              <PromptTextarea
                title="Custom tone"
                value={rawToneValue}
                large
                onChange={(value) =>
                  onConfigChange(
                    schemaWithAutomationTone(config, value, "custom")
                  )
                }
              />
            ) : null}
            <PromptTextarea
              title={
                isVideoAutomation
                  ? "Video writing style"
                  : "Slideshow writing style"
              }
              value={config.prompt_formatting.style}
              large
              onChange={(value) =>
                onConfigChange({
                  ...config,
                  prompt_formatting: {
                    ...config.prompt_formatting,
                    style: value,
                  },
                })
              }
            />
          </>
        ) : null}

        {!isVideoAutomation && activeTab === "slides" ? (
          <>
            <div className="rounded-[9px] border border-[#ddd4f3] bg-[#faf8ff] px-4 py-3 text-[13px] font-medium text-[#625879]">
              These settings apply to Hook, Content, and CTA slides together.
            </div>
            <SettingsRow
              title="Aspect ratio"
              description="One frame ratio for the entire carousel"
              control={
                <SelectControl
                  value={aspectRatioLabel(sharedSlideStyle.aspectRatio)}
                  onChange={(event) =>
                    onConfigChange(
                      schemaWithAutomationSharedSlideStyle(config, {
                        aspectRatio: labelToAspectRatio(event.target.value),
                      })
                    )
                  }
                >
                  {automationAspectRatios.map((ratio) => (
                    <option key={ratio} value={aspectRatioLabel(ratio)}>
                      {aspectRatioLabel(ratio)}
                    </option>
                  ))}
                </SelectControl>
              }
            />
            <SettingsRow
              title="Font"
              description="One font family for every text box"
              control={
                <SelectControl
                  value={sharedSlideStyle.font}
                  onChange={(event) =>
                    onConfigChange(
                      schemaWithAutomationSharedSlideStyle(config, {
                        font: event.target.value,
                      })
                    )
                  }
                >
                  {["TikTok Display Medium", "Inter", "Arial"].map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </SelectControl>
              }
            />
            <SettingsRow
              title="Image fitting"
              description="How source images fill the shared frame"
              control={
                <SelectControl
                  value={sharedSlideStyle.imageFit}
                  onChange={(event) =>
                    onConfigChange(
                      schemaWithAutomationSharedSlideStyle(config, {
                        imageFit: event.target.value as AutomationImageFit,
                      })
                    )
                  }
                >
                  <option value="cover">Cover — crop edges</option>
                  <option value="contain">Contain — show full image</option>
                  <option value="fit">Fit — stretch to frame</option>
                </SelectControl>
              }
            />
            <SettingsRow
              title="Dark overlay"
              description="Apply the same readability overlay to every slide"
              control={
                <SwitchPillButton
                  enabled={sharedSlideStyle.overlay}
                  onClick={() =>
                    onConfigChange(
                      schemaWithAutomationSharedSlideStyle(config, {
                        overlay: !sharedSlideStyle.overlay,
                      })
                    )
                  }
                />
              }
            />
          </>
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

function hookCaseLabel(mode: HookCaseMode) {
  if (mode === "lowercase") return "all lowercase"
  if (mode === "uppercase") return "ALL UPPERCASE"
  if (mode === "title") return "Title Case"
  if (mode === "sentence") return "First word uppercase"
  return "Mixed"
}
