"use client"

import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import {
  IconBrandTiktok,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconLayoutDashboard,
  IconMessage,
  IconPlus,
  IconTrash,
  IconWand,
} from "@tabler/icons-react"
import { Copy } from "lucide-react"

import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import { automationHooks } from "@/lib/realfarm-automation"
import type { AutomationSchema } from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

import {
  cloneAutomationSchema,
  generationPlaceholderRun,
  wait,
} from "./run-helpers"
import type {
  AutomationDrawerTab,
  AutomationRunApiPayload,
  AutomationRunApiRecord,
} from "./types"
import { AutomationGeneralSettingsPanel } from "./general-settings"
import { AutomationOverviewPanel } from "./overview-panel"
import { PromptConfigPanel } from "./prompt-settings"
import { SchedulePanel } from "./schedule-settings"
import { AutomationFormatPanel } from "./slideshow-format-panel"
import { SocialMediaSettingsPanel } from "./social-settings"

export function AutomationSettingsDrawer({
  automation,
  config,
  collections,
  selectedSound,
  music,
  demoVideos,
  onCreateCollection,
  onRename,
  onConfigChange,
  onGenerationRunUpdate,
  onGenerationRunRemove,
  onEditSocialAccounts,
  onDelete,
  onClose,
}: {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  demoVideos: LocalAsset[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onRename: (name: string) => void
  onConfigChange: (config: AutomationSchema) => void
  onGenerationRunUpdate: (run: AutomationRunApiRecord) => void
  onGenerationRunRemove: (runId: string) => void
  onEditSocialAccounts: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<AutomationDrawerTab>("overview")
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(automation.name)
  const [draftConfig, setDraftConfig] = useState(() =>
    cloneAutomationSchema(config)
  )
  const [generating, setGenerating] = useState(false)
  const [recentRuns, setRecentRuns] = useState<AutomationRunApiRecord[]>([])
  const automationKind =
    draftConfig.automationKind === "video" ? "video" : "slideshow"
  const hookCount = automationHooks(draftConfig).length

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ runs?: AutomationRunApiRecord[] }>(
      `/api/automations/runs?automationId=${encodeURIComponent(automation.id)}&limit=6`,
      {
        toastOnError: false,
      }
    )
      .then((payload) => {
        if (active) {
          setRecentRuns(payload.runs ?? [])
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [automation.id])

  function saveName() {
    const nextName = draftName.trim()
    if (nextName && nextName !== automation.name) {
      setDraftConfig((current) => ({ ...current, title: nextName }))
      onRename(nextName)
    } else {
      setDraftName(automation.name)
    }
    setEditingName(false)
  }

  async function generateAutomation() {
    if (generating) {
      return
    }

    const loadingStartedAt = Date.now()
    const placeholderRun = generationPlaceholderRun({
      automation,
      config: draftConfig,
      collections,
    })
    flushSync(() => {
      setGenerating(true)
      setActiveTab("overview")
      setRecentRuns((current) =>
        [
          placeholderRun,
          ...current.filter((item) => item.id !== placeholderRun.id),
        ].slice(0, 6)
      )
    })
    onGenerationRunUpdate(placeholderRun)
    try {
      const payload = await fetchJsonWithTimeout<AutomationRunApiPayload>(
        "/api/automations/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            automationId: automation.id,
            schema: draftConfig,
            force: true,
            now: new Date().toISOString(),
          }),
        }
      )
      const run = payload.created?.[0]
      if (!run || !run.plan?.slides?.length) {
        window.alert(
          run?.error ||
            "No slideshow slides were generated for this automation."
        )
        return
      }

      setRecentRuns((current) =>
        [
          run,
          ...current.filter(
            (item) => item.id !== run.id && item.id !== placeholderRun.id
          ),
        ].slice(0, 6)
      )
      onGenerationRunRemove(placeholderRun.id)
      onGenerationRunUpdate(run)
      setActiveTab("overview")
    } catch (error) {
      setRecentRuns((current) =>
        current.filter((item) => item.id !== placeholderRun.id)
      )
      onGenerationRunRemove(placeholderRun.id)
      window.alert(getApiErrorMessage(error, "Failed to generate slideshow"))
    } finally {
      const remainingLoadingMs = 450 - (Date.now() - loadingStartedAt)
      if (remainingLoadingMs > 0) {
        await wait(remainingLoadingMs)
      }
      setGenerating(false)
    }
  }

  function saveConfigChanges() {
    onConfigChange(
      cloneAutomationSchema({
        ...draftConfig,
        social_integrations: config.social_integrations,
      })
    )
    setActiveTab("overview")
  }

  function cancelConfigChanges() {
    setDraftConfig(cloneAutomationSchema(config))
    setActiveTab("overview")
  }

  return (
    <div
      className={cn(
        "grid min-h-svh overflow-hidden bg-white",
        activeTab !== "format" && "md:grid-cols-[246px_1fr]"
      )}
    >
      {activeTab !== "format" && (
        <aside className="flex min-h-0 flex-col border-r border-[#e1e0d8] bg-[#f7f7f3] p-2">
          <button
            className="mb-2 flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#d8d7cf] bg-white px-3 text-[14px] font-semibold text-[#242421] shadow-sm disabled:cursor-not-allowed disabled:opacity-55"
            onClick={generateAutomation}
            disabled={generating}
            aria-busy={generating}
          >
            <IconPlus className="size-4" />
            {generating ? "Generating..." : "Generate"}
          </button>
          <div className="space-y-1">
            <DrawerNavButton
              label="Overview"
              icon={IconHome}
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
            />
            <div className="my-2 h-px bg-[#e1e0d8]" />
            <DrawerNavButton
              label={
                automationKind === "video" ? "Video Format" : "Slideshow Format"
              }
              icon={IconWand}
              onClick={() => setActiveTab("format")}
            />
            <DrawerNavButton
              label={`Hooks (${hookCount}) & Style`}
              icon={IconMessage}
              active={activeTab === "hooks"}
              onClick={() => setActiveTab("hooks")}
            />
            <div className="my-2 h-px bg-[#e1e0d8]" />
            <DrawerNavButton
              label="Schedule"
              icon={IconCalendar}
              active={activeTab === "schedule"}
              onClick={() => setActiveTab("schedule")}
            />
            <DrawerNavButton
              label="Social Media Settings"
              icon={IconBrandTiktok}
              active={activeTab === "tiktok"}
              onClick={() => setActiveTab("tiktok")}
            />
            <DrawerNavButton
              label="Settings"
              icon={IconLayoutDashboard}
              active={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
            />
          </div>
          <div className="mt-auto space-y-4 pb-4 pl-3 text-[15px] font-semibold">
            <button className="flex items-center gap-2 text-[#85847d]">
              <Copy className="size-4" />
              Duplicate
            </button>
            <button
              className="flex items-center gap-2 text-[#c54b4b]"
              onClick={onDelete}
            >
              <IconTrash className="size-4" />
              Delete automation
            </button>
          </div>
        </aside>
      )}
      <div className="relative min-h-0 overflow-y-auto bg-white">
        {activeTab !== "format" && (
          <button
            className="absolute top-4 right-4 z-10 inline-flex h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] font-semibold text-[#62615b] hover:bg-[#f1f0eb] hover:text-[#242421]"
            onClick={onClose}
            aria-label="Back to automations"
          >
            <IconChevronLeft className="size-4" />
            Back
          </button>
        )}
        {activeTab === "overview" && (
          <AutomationOverviewPanel
            automation={automation}
            editingName={editingName}
            draftName={draftName}
            generating={generating}
            onDraftNameChange={setDraftName}
            onStartNameEdit={() => setEditingName(true)}
            onSaveName={saveName}
            onCancelNameEdit={() => {
              setDraftName(automation.name)
              setEditingName(false)
            }}
            recentRuns={recentRuns}
          />
        )}
        {activeTab === "format" && (
          <AutomationFormatPanel
            automation={automation}
            config={draftConfig}
            collections={collections}
            selectedSound={selectedSound}
            music={music}
            demoVideos={demoVideos}
            onCreateCollection={onCreateCollection}
            onConfigChange={setDraftConfig}
            onBack={() => setActiveTab("overview")}
            onSave={saveConfigChanges}
          />
        )}
        {activeTab === "hooks" && (
          <PromptConfigPanel
            automation={automation}
            config={draftConfig}
            onConfigChange={setDraftConfig}
            onCancel={cancelConfigChanges}
            onSave={saveConfigChanges}
          />
        )}
        {activeTab === "tiktok" && (
          <SocialMediaSettingsPanel
            config={draftConfig}
            onEditSocialAccounts={onEditSocialAccounts}
            onConfigChange={setDraftConfig}
            onCancel={cancelConfigChanges}
            onSave={saveConfigChanges}
          />
        )}
        {activeTab === "settings" && (
          <AutomationGeneralSettingsPanel
            config={draftConfig}
            selectedSound={selectedSound}
            music={music}
            onConfigChange={setDraftConfig}
            onCancel={cancelConfigChanges}
            onSave={saveConfigChanges}
          />
        )}
        {activeTab === "schedule" && (
          <SchedulePanel
            config={draftConfig}
            onConfigChange={setDraftConfig}
            onCancel={cancelConfigChanges}
            onSave={saveConfigChanges}
          />
        )}
      </div>
    </div>
  )
}

function DrawerNavButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-[6px] border border-transparent px-3 text-left text-[14px] font-semibold",
        active
          ? "border-[#92918a] bg-white text-[#242421]"
          : "text-[#7b7a73] hover:bg-white/70",
        disabled && "cursor-not-allowed opacity-35 hover:bg-transparent"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-4" />
      {label}
      {active && <IconChevronRight className="ml-auto size-4" />}
    </button>
  )
}
