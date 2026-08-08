"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import { IconChevronLeft, IconPlus } from "@tabler/icons-react"
import { LuPanelsTopLeft, LuSettings2, LuType } from "react-icons/lu"

import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { useAutomationGeneratedVideoExports } from "@/components/realfarm/generated-video-workflow"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import type { AutomationSchema } from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

import {
  automationGenerationIssue,
  cloneAutomationSchema,
  generationPlaceholderRun,
  reconcileGenerationPlaceholders,
  wait,
} from "./run-helpers"
import type {
  AutomationDrawerTab,
  AutomationRunApiPayload,
  AutomationRunApiRecord,
} from "./types"
import { AutomationGeneralSettingsPanel } from "./general-settings"
import { PromptConfigPanel } from "./prompt-settings"
import { AutomationFormatPanel } from "./slideshow-format-panel"
import { SlideSequencePanel } from "./slide-sequence-panel"
import {
  automationVideoGenerationIssue,
  generateAutomationVideo,
} from "./automation-video-generation"

export function AutomationSettingsDrawer({
  modal = false,
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
  onDuplicate,
  onDelete,
  onClose,
}: {
  modal?: boolean
  automation: Automation
  initialRunId?: string
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
  onDuplicate: () => Promise<void>
  onDelete: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<AutomationDrawerTab>("editor")
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(automation.name)
  const [draftConfig, setDraftConfig] = useState(() =>
    cloneAutomationSchema(config)
  )
  const [savingConfig, setSavingConfig] = useState(false)
  const autosaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const latestDraftConfigJsonRef = useRef("")
  const onConfigChangeRef = useRef(onConfigChange)
  const [activeGenerationCount, setActiveGenerationCount] = useState(0)
  const generating = activeGenerationCount > 0
  const [duplicating, setDuplicating] = useState(false)
  const [, setRecentRuns] = useState<AutomationRunApiRecord[]>([])
  const automationKind = draftConfig.automationKind
  const effectiveDraftConfig = useMemo(
    () => ({
      ...draftConfig,
      social_integrations: [],
      social_publish_as: {},
      posting_mode: "manual" as const,
      tiktok_post_settings: {
        ...draftConfig.tiktok_post_settings,
        auto_post: false,
      },
    }),
    [draftConfig]
  )
  const effectiveDraftConfigJson = JSON.stringify(effectiveDraftConfig)
  const configChanged = effectiveDraftConfigJson !== JSON.stringify(config)
  const [, setVideoExports] = useAutomationGeneratedVideoExports(
    automation.id,
    "Failed to load generated template videos"
  )

  useEffect(() => {
    onConfigChangeRef.current = onConfigChange
  }, [onConfigChange])

  useEffect(() => {
    latestDraftConfigJsonRef.current = effectiveDraftConfigJson
  }, [effectiveDraftConfigJson])

  const queueConfigSave = useCallback(
    (nextConfig: AutomationSchema) => {
      const nextConfigJson = JSON.stringify(nextConfig)
      const save = autosaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await persistDraftConfig(automation.id, nextConfig)
          if (latestDraftConfigJsonRef.current !== nextConfigJson) return

          onConfigChangeRef.current(nextConfig)
          setDraftConfig((current) => {
            const currentJson = JSON.stringify(current)
            return currentJson === nextConfigJson
              ? cloneAutomationSchema(nextConfig)
              : current
          })
        })
      autosaveQueueRef.current = save
      return save
    },
    [automation.id]
  )

  useEffect(() => {
    if (!configChanged) return

    const nextConfig = JSON.parse(effectiveDraftConfigJson) as AutomationSchema
    const timer = window.setTimeout(() => {
      setSavingConfig(true)
      void queueConfigSave(nextConfig)
        .then(() => {
          if (latestDraftConfigJsonRef.current === effectiveDraftConfigJson) {
            setSavingConfig(false)
          }
        })
        .catch((error) => {
          if (latestDraftConfigJsonRef.current === effectiveDraftConfigJson) {
            setSavingConfig(false)
            toast.error(
              getApiErrorMessage(error, "Failed to autosave template settings")
            )
          }
        })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [configChanged, effectiveDraftConfigJson, queueConfigSave])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    function scheduleRunRefresh(delay: number) {
      timer = setTimeout(() => {
        if (!active) return
        if (document.visibilityState === "hidden") {
          scheduleRunRefresh(30_000)
          return
        }
        void loadRuns()
      }, delay)
    }

    async function loadRuns() {
      try {
        const payload = await fetchJsonWithTimeout<{
          runs?: AutomationRunApiRecord[]
        }>(
          `/api/templates/runs?templateId=${encodeURIComponent(automation.id)}&limit=100`,
          {
            toastOnError: false,
          }
        )
        if (!active) {
          return
        }
        const runs = payload.runs ?? []
        const hasInFlight = runs.some((run) => run.status === "running")
        setRecentRuns((current) => {
          return reconcileGenerationPlaceholders({
            current,
            persisted: runs,
            automationId: automation.id,
            generating,
          })
        })
        // While anything is generating (including a run discovered after a
        // page reload), keep polling so the live progress stage updates.
        if (hasInFlight || generating) {
          scheduleRunRefresh(15_000)
        }
      } catch {
        if (active && generating) {
          scheduleRunRefresh(30_000)
        }
      }
    }

    void loadRuns()

    return () => {
      active = false
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [automation.id, generating])

  function saveName() {
    const nextName = draftName.trim()
    if (nextName && nextName !== automation.name) {
      onRename(nextName)
    } else {
      setDraftName(automation.name)
    }
    setEditingName(false)
  }

  async function generateAutomation() {
    const generationConfig = JSON.parse(
      effectiveDraftConfigJson
    ) as AutomationSchema
    if (configChanged || savingConfig) {
      setSavingConfig(true)
      try {
        await queueConfigSave(generationConfig)
      } catch (error) {
        setSavingConfig(false)
        showGenerationError(
          getApiErrorMessage(error, "Failed to save template changes"),
          "Template changes weren’t saved"
        )
        return
      }
      if (latestDraftConfigJsonRef.current === effectiveDraftConfigJson) {
        setSavingConfig(false)
      }
    }
    const preflightError =
      automationKind === "video"
        ? automationVideoGenerationIssue(
            generationConfig,
            collections,
            demoVideos
          )
        : automationGenerationIssue(generationConfig, collections)
    if (preflightError) {
      setActiveTab("editor")
      showGenerationError(preflightError)
      return
    }

    if (automationKind === "video") {
      const loadingStartedAt = Date.now()
      const placeholderId = `pending-video-${crypto.randomUUID()}`
      const videoTemplate = generationConfig.video_format?.template
      const placeholderType =
        videoTemplate === "greenscreen_meme"
          ? ("greenscreen" as const)
          : videoTemplate === "ugc_ad"
            ? ("ugc_ad" as const)
            : ("template_video" as const)
      const placeholderCreatedAt = new Date().toISOString()
      setActiveGenerationCount((count) => count + 1)
      setActiveTab("editor")
      setVideoExports((current) => [
        {
          id: placeholderId,
          type: placeholderType,
          status: "processing",
          createdAt: placeholderCreatedAt,
          updatedAt: placeholderCreatedAt,
          title: automation.name,
          description: "",
          hashtags: [],
          caption: "",
          sourceConfig: {},
        },
        ...current,
      ])
      try {
        await persistDraftConfig(automation.id, generationConfig)
        await generateAutomationVideo({
          automation,
          config: generationConfig,
          collections,
          demoVideos,
          music,
          selectedSound,
          onExportUpdate: (item) =>
            setVideoExports((current) => [
              item,
              ...current.filter(
                (candidate) =>
                  candidate.id !== item.id && candidate.id !== placeholderId
              ),
            ]),
        })
        toast.success("Video generated")
      } catch (error) {
        showGenerationError(
          getApiErrorMessage(error, "Failed to generate video"),
          "Video wasn’t generated"
        )
      } finally {
        setVideoExports((current) =>
          current.filter((item) => item.id !== placeholderId)
        )
        const remainingLoadingMs = 450 - (Date.now() - loadingStartedAt)
        if (remainingLoadingMs > 0) await wait(remainingLoadingMs)
        setActiveGenerationCount((count) => Math.max(0, count - 1))
      }
      return
    }

    const loadingStartedAt = Date.now()
    const requestId = crypto.randomUUID()
    const placeholderRun = generationPlaceholderRun({
      automation,
      config: generationConfig,
      requestId,
    })
    flushSync(() => {
      setActiveGenerationCount((count) => count + 1)
      setActiveTab("editor")
      setRecentRuns((current) => [
        placeholderRun,
        ...current.filter((item) => item.id !== placeholderRun.id),
      ])
    })
    onGenerationRunUpdate(placeholderRun)
    function settleGeneration(run?: AutomationRunApiRecord) {
      setRecentRuns((current) =>
        run
          ? [
              run,
              ...current.filter(
                (item) => item.id !== run.id && item.id !== placeholderRun.id
              ),
            ]
          : current.filter((item) => item.id !== placeholderRun.id)
      )
      onGenerationRunRemove(placeholderRun.id)
      if (run) onGenerationRunUpdate(run)
    }

    try {
      // Persist the exact editor state first, then let the runner reload the
      // canonical Appwrite row. Passing a client-side schema override here can
      // resurrect stale prompt/style fields from a long-open drawer.
      await persistDraftConfig(automation.id, generationConfig)
      const payload = await fetchJsonWithTimeout<AutomationRunApiPayload>(
        "/api/templates/run",
        {
          method: "POST",
          timeoutMs: 10 * 60_000,
          toastOnError: false,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: automation.id,
            force: true,
            now: new Date().toISOString(),
            requestId,
          }),
        }
      )
      const run = payload.created?.[0]
      if (!run || (automationKind !== "ugc" && !run.plan?.slides?.length)) {
        const message =
          run?.error ||
          (payload.skipped?.some((item) => item.reason === "hooks_exhausted")
            ? "No unused hook combinations remain for this template."
            : payload.skipped?.some(
                  (item) => item.reason === "insufficient_unique_images"
                )
              ? "There are not enough distinct slide-and-image combinations to generate this slideshow."
              : payload.skipped?.some((item) => item.reason === "no_images")
                ? "Choose an image collection with at least one image before generating."
                : "No slideshow slides were generated for this template.")
        settleGeneration(run)
        showGenerationError(message)
        return
      }

      settleGeneration(run)
      setActiveTab("editor")
    } catch (error) {
      const failedRun = await loadFailedRunForRequest(
        automation.id,
        requestId
      ).catch(() => undefined)
      settleGeneration(failedRun)
      showGenerationError(
        getApiErrorMessage(error, "Failed to generate slideshow")
      )
    } finally {
      const remainingLoadingMs = 450 - (Date.now() - loadingStartedAt)
      if (remainingLoadingMs > 0) {
        await wait(remainingLoadingMs)
      }
      setActiveGenerationCount((count) => Math.max(0, count - 1))
    }
  }

  async function closeAfterAutosave() {
    if (!configChanged) {
      onClose()
      return
    }

    const nextConfig = JSON.parse(effectiveDraftConfigJson) as AutomationSchema
    setSavingConfig(true)
    try {
      await queueConfigSave(nextConfig)
      onClose()
    } catch (error) {
      setSavingConfig(false)
      toast.error(
        getApiErrorMessage(error, "Failed to autosave template settings")
      )
    }
  }

  const tabs = [
    { id: "editor" as const, label: "Editor", icon: LuPanelsTopLeft },
    { id: "text" as const, label: "Text", icon: LuType },
    { id: "settings" as const, label: "Settings", icon: LuSettings2 },
  ]

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-app-surface",
        modal ? "h-full" : "min-h-[calc(100svh-3.5rem)] md:min-h-svh"
      )}
    >
      <header className="z-30 shrink-0 border-b border-black/15 bg-[#1d1d1c] text-white">
        <div className="flex min-h-14 items-center gap-2 px-3 sm:px-4">
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-white/70 transition hover:text-white"
            onClick={() => void closeAfterAutosave()}
            aria-label="Back to templates"
          >
            <IconChevronLeft className="size-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          {editingName ? (
            <input
              autoFocus
              className="h-9 max-w-56 min-w-0 rounded-md border border-white/20 bg-white/10 px-2 text-[14px] font-bold text-white outline-none focus:border-white/50"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveName()
                if (event.key === "Escape") {
                  setDraftName(automation.name)
                  setEditingName(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="max-w-24 min-w-0 truncate text-left text-[14px] font-bold text-white sm:max-w-56"
              onClick={() => setEditingName(true)}
            >
              {automation.name}
            </button>
          )}

          <nav
            className="ml-1 flex items-center gap-0.5 rounded-md bg-black/20 p-1 sm:ml-3"
            aria-label="Template editor"
          >
            {tabs.map((tab) => {
              const TabIcon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    "lc-focus-ring flex h-8 items-center justify-center gap-1.5 rounded px-2 text-[11px] font-semibold transition sm:px-3",
                    activeTab === tab.id
                      ? "bg-white text-[#20201f] shadow-sm"
                      : "text-white/62 hover:bg-white/10 hover:text-white"
                  )}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                >
                  <TabIcon className="size-4" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-[11px] font-semibold text-white/48 lg:inline">
              {savingConfig || configChanged ? "Saving…" : "Saved"}
            </span>
            <button
              className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#f4c44e] px-2 text-[13px] font-bold text-[#1d1d1c] transition hover:bg-[#ffd467] disabled:cursor-not-allowed disabled:opacity-55 sm:px-3"
              disabled={generating}
              onClick={generateAutomation}
              aria-busy={generating}
              aria-label="Generate template"
            >
              <IconPlus className="size-4" />
              <span className="hidden sm:inline">
                {generating ? "Generating…" : "Generate"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1",
          activeTab === "editor" && automationKind === "slideshow"
            ? "overflow-y-auto lg:overflow-hidden"
            : "overflow-y-auto"
        )}
      >
        {activeTab === "editor" ? (
          automationKind === "slideshow" ? (
            <SlideSequencePanel
              config={draftConfig}
              collections={collections}
              onCreateCollection={onCreateCollection}
              onConfigChange={setDraftConfig}
            />
          ) : (
            <AutomationFormatPanel
              automation={automation}
              config={draftConfig}
              collections={collections}
              selectedSound={selectedSound}
              music={music}
              demoVideos={demoVideos}
              onCreateCollection={onCreateCollection}
              onConfigChange={setDraftConfig}
              onBack={() => void closeAfterAutosave()}
            />
          )
        ) : null}
        {activeTab === "text" ? (
          <PromptConfigPanel
            automation={automation}
            config={draftConfig}
            onConfigChange={setDraftConfig}
            hideFooter
          />
        ) : null}
        {activeTab === "settings" ? (
          <AutomationGeneralSettingsPanel
            config={draftConfig}
            selectedSound={selectedSound}
            music={music}
            onConfigChange={setDraftConfig}
            duplicating={duplicating}
            onDuplicate={() => {
              setDuplicating(true)
              void onDuplicate().finally(() => setDuplicating(false))
            }}
            onDelete={onDelete}
          />
        ) : null}
      </div>
    </div>
  )
}

async function loadFailedRunForRequest(
  automationId: string,
  requestId: string
) {
  const payload = await fetchJsonWithTimeout<{
    runs?: AutomationRunApiRecord[]
  }>(
    `/api/templates/runs?templateId=${encodeURIComponent(automationId)}&limit=20`,
    { timeoutMs: 12_000, toastOnError: false }
  )
  return payload.runs?.find(
    (run) => run.requestId === requestId && run.status === "failed"
  )
}

async function persistDraftConfig(
  automationId: string,
  schema: AutomationSchema
) {
  await fetchJsonWithTimeout("/api/templates", {
    method: "PATCH",
    timeoutMs: 30_000,
    toastOnError: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: automationId, schema }),
  })
}

function showGenerationError(
  message: string,
  title = "Slideshow wasn’t generated"
) {
  toast.error(title, {
    description: message,
    duration: 7_000,
  })
}
