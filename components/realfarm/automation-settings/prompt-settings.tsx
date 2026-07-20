"use client"

import { useEffect, useEffectEvent, useState } from "react"
import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  SelectControl,
  SwitchPill,
  SwitchPillButton,
} from "@/components/ui/form-controls"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import {
  aspectRatioLabel,
  automationHookId,
  automationAspectRatios,
  automationHookItems,
  automationSharedSlideStyle,
  automationTonePresetOptions,
  automationToneRawValue,
  automationToneSelection,
  labelToAspectRatio,
  schemaWithAutomationHookSlots,
  schemaWithAutomationHookCase,
  schemaWithAutomationHookItems,
  schemaWithAutomationTone,
  schemaWithAutomationSharedSlideStyle,
  type AutomationSchema,
  type AutomationHookItem,
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
import type { HookUsageState } from "@/lib/hook-publications"
import type { WordCollectionRecord } from "@/lib/word-collections"
import { cn } from "@/lib/utils"

import { SettingsFooter, SettingsPage, SettingsRow } from "./settings-layout"
import { HookRowsEditor } from "./hook-rows-editor"

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
        <span className="text-[15px] font-semibold text-app-text">{title}</span>
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
  hideFooter = false,
}: {
  automation: Automation
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
  onCancel: () => void
  onSave: () => void
  hideFooter?: boolean
}) {
  const initialHooks = automationHookItems(config)
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
  const [hookItemsDraft, setHookItemsDraft] = useState<AutomationHookItem[]>(
    () => (initialHooks.length > 0 ? initialHooks : [emptyHookItem()])
  )
  const [existingHookIds] = useState(() => initialHooks.map((item) => item.id))
  const [hookUsage, setHookUsage] = useState<HookUsageState[]>([])
  const [hookUsageStatus, setHookUsageStatus] = useState<
    "loading" | "ready" | "error"
  >("loading")
  const [hookUsageRevision, setHookUsageRevision] = useState(0)
  const detectedHookCase = detectHookCaseMode(
    hookItemsDraft.map((item) => item.text.trim()).filter(Boolean)
  )
  const selectedHookCase =
    config.prompt_formatting.hook_case ?? detectedHookCase
  const applyLoadedWordCollections = useEffectEvent(
    (collections: WordCollectionRecord[]) => {
      setWordCollections(collections)
      const migration = migrateLegacyHookVariableReferences({
        text: hookItemsDraft.map((item) => item.text).join("\n"),
        hookSlots: config.hook_slots,
        collections,
      })
      if (!migration.changed) return

      const migratedHooks = normalizeHookVariables(migration.text)
        .split("\n")
        .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
        .filter(Boolean)
      const nextItems = migratedHooks.map((text, index) => ({
        ...(hookItemsDraft[index] ?? emptyHookItem()),
        text,
      }))
      setHookItemsDraft(nextItems)
      onConfigChange(
        schemaWithAutomationHookSlots(
          schemaWithAutomationHookItems(config, nextItems),
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

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ hooks?: HookUsageState[] }>(
      `/api/automations/${encodeURIComponent(automation.id)}/hook-analytics`,
      { toastOnError: false }
    )
      .then((payload) => {
        if (active) {
          setHookUsage(payload.hooks ?? [])
          setHookUsageStatus("ready")
        }
      })
      .catch(() => {
        if (active) setHookUsageStatus("error")
      })
    return () => {
      active = false
    }
  }, [automation.id, hookUsageRevision])

  function updateHooks(items: AutomationHookItem[]) {
    const usedIds = new Set(
      hookUsage.filter((item) => item.used).map((item) => item.hookId)
    )
    const savedById = new Map(
      automationHookItems(config).map((item) => [item.id, item])
    )
    const nextItems = items.map((item) => ({
      ...item,
      text:
        usedIds.has(item.id) && savedById.has(item.id)
          ? savedById.get(item.id)!.text
          : applyHookCase(normalizeHookVariables(item.text), selectedHookCase),
    }))
    setHookItemsDraft(nextItems)
    onConfigChange(schemaWithAutomationHookItems(config, nextItems))
  }

  function updateHookCase(mode: HookCaseMode) {
    if (hookUsageStatus !== "ready") {
      toast.error("Hook usage must load before changing existing hooks")
      return
    }
    const usedIds = new Set(
      hookUsage.filter((item) => item.used).map((item) => item.hookId)
    )
    const nextItems = hookItemsDraft.map((item) =>
      usedIds.has(item.id)
        ? item
        : { ...item, text: applyHookCase(item.text, mode) }
    )
    setHookItemsDraft(nextItems)
    onConfigChange(
      schemaWithAutomationHookCase(
        schemaWithAutomationHookItems(config, nextItems),
        mode
      )
    )
  }

  async function copyAllHooks() {
    const text = hooksClipboardText(hookItemsDraft)
    const hookCount = text ? text.split("\n").length : 0
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Copied ${hookCount} ${hookCount === 1 ? "hook" : "hooks"}`)
    } catch {
      toast.error("Hooks could not be copied")
    }
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
            <div className="block">
              <div className="mb-2 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[16px] font-semibold text-app-text">
                    Hooks
                  </div>
                  <div className="mt-1 text-[14px] font-medium text-app-muted-text">
                    Add hooks one at a time or paste a multiline list. Published
                    hooks stay locked but can be disabled.
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="iconControl"
                    size="icon-control-lg"
                    disabled={!hookItemsDraft.some((item) => item.text.trim())}
                    aria-label="Copy all hooks"
                    title="Copy all hooks"
                    onClick={() => void copyAllHooks()}
                  >
                    <IconCopy className="size-4" />
                  </Button>
                  <SelectControl
                    className="w-48 shrink-0"
                    aria-label="Hook casing"
                    value={selectedHookCase}
                    disabled={hookUsageStatus !== "ready"}
                    onChange={(event) =>
                      updateHookCase(event.target.value as HookCaseMode)
                    }
                  >
                    {hookCaseModes
                      .filter(
                        (mode) =>
                          mode !== "mixed" || detectedHookCase === "mixed"
                      )
                      .map((mode) => (
                        <option key={mode} value={mode}>
                          {hookCaseLabel(mode)}
                        </option>
                      ))}
                  </SelectControl>
                </div>
              </div>
              <HookRowsEditor
                items={hookItemsDraft}
                usage={hookUsage}
                safetyLockedIds={
                  hookUsageStatus === "ready" ? [] : existingHookIds
                }
                onChange={updateHooks}
              />
              {hookUsageStatus === "error" ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900">
                  <span>
                    Existing hooks are locked because usage could not be
                    verified.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setHookUsageStatus("loading")
                      setHookUsageRevision((revision) => revision + 1)
                    }}
                  >
                    Try again
                  </Button>
                </div>
              ) : null}
            </div>
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
      {hideFooter ? null : (
        <SettingsFooter onCancel={onCancel} onSave={onSave} />
      )}
    </SettingsPage>
  )
}

export function hooksClipboardText(items: AutomationHookItem[]) {
  return items
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n")
}

function hookCaseLabel(mode: HookCaseMode) {
  if (mode === "lowercase") return "all lowercase"
  if (mode === "uppercase") return "ALL UPPERCASE"
  if (mode === "title") return "Title Case"
  if (mode === "sentence") return "First word uppercase"
  return "Mixed"
}

function emptyHookItem(): AutomationHookItem {
  const createdAt = new Date().toISOString()
  return {
    id: `${automationHookId(createdAt)}_${crypto.randomUUID().slice(0, 6)}`,
    text: "",
    enabled: true,
    createdAt,
  }
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
