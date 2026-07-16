"use client"

import { useEffect, useEffectEvent, useState } from "react"

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
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import {
  applyHookCase,
  detectHookCaseMode,
  hookCaseModes,
  normalizeHookVariables,
  type HookCaseMode,
} from "@/lib/hook-casing"
import {
  migrateLegacyHookVariableReferences,
  runtimeHookVariables,
  runtimeHookVariableValue,
  wordCollectionVariableName,
} from "@/lib/hook-variables"
import type { Automation } from "@/lib/realfarm-data"
import type { WordCollectionRecord } from "@/lib/word-collections"
import { cn } from "@/lib/utils"

import { SettingsFooter, SettingsPage, SettingsRow } from "./settings-layout"
import { HookVariableEditor } from "./hook-variable-editor"

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
        <span className="text-[15px] font-semibold text-app-text">
          {title}
        </span>
        <span className="flex items-center gap-2 text-[13px] font-semibold text-app-text-soft">
          Use prompt <SwitchPill enabled />
        </span>
      </div>
      <textarea
        className={cn(
          "w-full resize-none rounded-[8px] border border-app-panel-border bg-app-surface p-4 text-[14px] leading-6 font-medium outline-none focus:border-[#9f9e96]",
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
  const [wordCollections, setWordCollections] = useState<
    WordCollectionRecord[]
  >([])
  const [runtimePreviewDate] = useState(() => new Date())
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
  const applyLoadedWordCollections = useEffectEvent(
    (collections: WordCollectionRecord[]) => {
      setWordCollections(collections)
      const migration = migrateLegacyHookVariableReferences({
        text: hooksDraft,
        hookSlots: config.hook_slots,
        collections,
      })
      if (!migration.changed) return

      const migratedDraft = normalizeHookVariables(migration.text)
      const migratedHooks = migratedDraft
        .split("\n")
        .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
        .filter(Boolean)
      setHooksDraft(migratedDraft)
      onConfigChange(
        schemaWithAutomationHookSlots(
          schemaWithAutomationHooks(config, migratedHooks),
          migration.hookSlots
        )
      )
    }
  )
  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ collections?: WordCollectionRecord[] }>(
      "/api/word-collections",
      { toastOnError: false }
    )
      .then((payload) => {
        if (active) {
          applyLoadedWordCollections(payload.collections ?? [])
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
          "mb-6 grid h-11 overflow-hidden rounded-[9px] border border-app-panel-border bg-[#f6f5f0] text-[13px] font-semibold",
          isVideoAutomation ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "border-r border-app-panel-border last:border-r-0",
              activeTab === tab
                ? "bg-app-surface text-app-text shadow-sm"
                : "text-app-text-faint"
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
                  <div className="text-[16px] font-semibold text-app-text">
                    Hooks
                  </div>
                  <div className="mt-1 text-[14px] font-medium text-app-muted-text">
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
                timeZone={config.schedule.timezone}
                onChange={updateHooks}
              />
            </label>
            <section className="rounded-[9px] border border-app-panel-border bg-app-surface-subtle px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-[14px] font-semibold text-app-text">
                  Variables
                </h3>
                <p className="text-[12px] font-medium text-app-muted-text">
                  Hover a badge to preview its current or collection value.
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {runtimeHookVariables.map((variable) => (
                  <VariableBadge
                    key={`runtime-${variable.name}`}
                    token={`[[${variable.name.toUpperCase()}]]`}
                    value={
                      runtimeHookVariableValue(variable.name, {
                        now: runtimePreviewDate,
                        timeZone: config.schedule.timezone,
                      }) ?? "Unavailable"
                    }
                    detail={`${variable.label} · ${variable.description}`}
                    kind="runtime"
                  />
                ))}
                {wordCollections.map((collection) => (
                  <VariableBadge
                    key={`collection-${collection.id}`}
                    token={`[[${wordCollectionVariableName(collection).toUpperCase()}]]`}
                    value={collectionValuePreview(collection)}
                    detail={`${collection.words.length} collection ${collection.words.length === 1 ? "value" : "values"}`}
                    kind="dynamic"
                  />
                ))}
              </div>
            </section>
            <div className="flex items-start justify-between gap-5 rounded-[10px] border border-app-panel-border bg-app-surface-subtle p-4">
              <div>
                <div className="text-[15px] font-semibold text-app-text">
                  No duplicate values per hook
                </div>
                <p className="mt-1 max-w-[560px] text-[13px] leading-5 font-medium text-app-muted-text">
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
              description="Images fill the entire frame; overflow is cropped from the center"
              control={
                <SelectControl value="cover" disabled>
                  <option value="cover">Cover — crop edges</option>
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

function hookCaseLabel(mode: HookCaseMode) {
  if (mode === "lowercase") return "all lowercase"
  if (mode === "uppercase") return "ALL UPPERCASE"
  if (mode === "title") return "Title Case"
  if (mode === "sentence") return "First word uppercase"
  return "Mixed"
}

function VariableBadge({
  token,
  value,
  detail,
  kind,
}: {
  token: string
  value: string
  detail: string
  kind: "runtime" | "dynamic"
}) {
  return (
    <span className="group relative inline-flex">
      <span
        className={cn(
          "inline-flex h-7 items-center rounded-full border px-2.5 font-mono text-[11px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#9b7bd7]/35",
          kind === "runtime"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-[#ddd4f3] bg-[#f7f3ff] text-app-action hover:bg-[#eee7ff]"
        )}
        tabIndex={0}
        aria-label={`${token}: ${value}`}
      >
        {token}
      </span>
      <span
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 w-max max-w-[min(360px,calc(100vw-32px))] -translate-x-1/2 rounded-[8px] border border-app-panel-border bg-app-surface px-3 py-2 text-left opacity-0 shadow-[0_10px_28px_rgba(36,36,33,0.16)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        role="tooltip"
      >
        <span className="block text-[10px] leading-4 font-bold tracking-[0.04em] text-app-text-faint uppercase">
          {detail}
        </span>
        <span className="mt-0.5 block text-[12px] leading-5 font-semibold whitespace-normal text-app-text">
          {value}
        </span>
      </span>
    </span>
  )
}

function collectionValuePreview(collection: WordCollectionRecord) {
  if (collection.words.length === 0) return "No values yet"
  const visible = collection.words.slice(0, 8).join(", ")
  const remaining = collection.words.length - 8
  return remaining > 0 ? `${visible} · +${remaining} more` : visible
}
