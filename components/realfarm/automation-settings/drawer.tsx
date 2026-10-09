"use client"

import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import {
  IconChartBar,
  IconChevronLeft,
  IconHome,
  IconMenu2,
  IconMessage,
  IconLink,
  IconPlayerPlay,
  IconSettings,
  IconTrash,
  IconWand,
  IconX,
} from "@tabler/icons-react"
import { LuCopy } from "react-icons/lu"

import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useDirtyGuard } from "@/components/ui/use-dirty-guard"
import { useAutomationGeneratedVideoExports } from "@/components/realfarm/generated-video-workflow"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import { automationHookItems } from "@/lib/realfarm-automation"
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
import { AutomationOverviewPanel } from "./overview-panel"
import { PromptConfigPanel } from "./prompt-settings"
import { HookAnalyticsPanel } from "./hook-analytics-panel"
import { AutomationFormatPanel } from "./slideshow-format-panel"
import { AutomationSettingsNavButton } from "./settings-nav"
import { TikTokPublicationImportPanel } from "./tiktok-publication-import-panel"
import {
  automationVideoGenerationIssue,
  generateAutomationVideo,
} from "./automation-video-generation"

export function AutomationSettingsDrawer({
  automation,
  initialRunId,
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
  onDuplicate: () => Promise<void>
  onDelete: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<AutomationDrawerTab>("overview")
  const [navOpen, setNavOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(automation.name)
  const [draftConfig, setDraftConfig] = useState(() =>
    cloneAutomationSchema(config)
  )
  const [savingConfig, setSavingConfig] = useState(false)
  const [activeGenerationCount, setActiveGenerationCount] = useState(0)
  const generating = activeGenerationCount > 0
  const [duplicating, setDuplicating] = useState(false)
  const [recentRuns, setRecentRuns] = useState<AutomationRunApiRecord[]>([])
  const [recentRunsError, setRecentRunsError] = useState("")
  const [runLoadRevision, setRunLoadRevision] = useState(0)
  const [loadedRunsAutomationId, setLoadedRunsAutomationId] = useState<
    string | null
  >(null)
  const recentRunsLoading = loadedRunsAutomationId !== automation.id
  const automationKind = draftConfig.automationKind
  const effectiveDraftConfig = {
    ...draftConfig,
    social_integrations: config.social_integrations,
  }
  const configChanged =
    JSON.stringify(effectiveDraftConfig) !== JSON.stringify(config)
  const preflightError =
    automationKind === "video"
      ? automationVideoGenerationIssue(
          effectiveDraftConfig,
          collections,
          demoVideos
        )
      : automationGenerationIssue(effectiveDraftConfig, collections)
  const generateDisabledReason = generating
    ? "A generation is already running."
    : savingConfig
      ? "Wait for the template to finish saving."
      : configChanged
        ? "Save or cancel your template changes before generating."
        : preflightError || ""
  const nameChanged = editingName && draftName.trim() !== automation.name
  const dirtyGuard = useDirtyGuard(configChanged || nameChanged)
  const hookCount = automationHookItems(draftConfig).length
  const [videoExports, setVideoExports, videoExportsLoading] =
    useAutomationGeneratedVideoExports(
      automation.id,
      "Failed to load generated template videos"
    )

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
          `/api/automations/runs?automationId=${encodeURIComponent(automation.id)}&limit=100`,
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
        setLoadedRunsAutomationId(automation.id)
        setRecentRunsError("")
        // While anything is generating (including a run discovered after a
        // page reload), keep polling so the live progress stage updates.
        if (hasInFlight || generating) {
          scheduleRunRefresh(15_000)
        }
      } catch (error) {
        if (active) {
          setLoadedRunsAutomationId(automation.id)
          setRecentRunsError(
            getApiErrorMessage(error, "Failed to load generated slideshows")
          )
        }
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
  }, [automation.id, generating, runLoadRevision])

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
    if (configChanged) {
      toast.error("Save or cancel your settings changes before generating")
      return
    }
    if (preflightError) {
      setActiveTab("overview")
      showGenerationError(preflightError)
      return
    }

    if (automationKind === "video") {
      const loadingStartedAt = Date.now()
      const placeholderId = `pending-video-${crypto.randomUUID()}`
      const videoTemplate = effectiveDraftConfig.video_format?.template
      const placeholderType =
        videoTemplate === "greenscreen_meme"
          ? ("greenscreen" as const)
          : videoTemplate === "ugc_ad"
            ? ("ugc_ad" as const)
            : ("template_video" as const)
      const placeholderCreatedAt = new Date().toISOString()
      setActiveGenerationCount((count) => count + 1)
      setActiveTab("overview")
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
        await persistDraftConfig(automation.id, effectiveDraftConfig)
        await generateAutomationVideo({
          automation,
          config: effectiveDraftConfig,
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
      config: effectiveDraftConfig,
      requestId,
    })
    flushSync(() => {
      setActiveGenerationCount((count) => count + 1)
      setActiveTab("overview")
      setRecentRuns((current) =>
        [
          placeholderRun,
          ...current.filter((item) => item.id !== placeholderRun.id),
        ].slice(0, 6)
      )
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
            ].slice(0, 6)
          : current.filter((item) => item.id !== placeholderRun.id)
      )
      onGenerationRunRemove(placeholderRun.id)
      if (run) onGenerationRunUpdate(run)
    }

    try {
      // Persist the exact editor state first, then let the runner reload the
      // canonical Railway row. Passing a client-side schema override here can
      // resurrect stale prompt/style fields from a long-open drawer.
      await persistDraftConfig(automation.id, effectiveDraftConfig)
      const payload = await fetchJsonWithTimeout<AutomationRunApiPayload>(
        `/api/templates/${encodeURIComponent(automation.id)}/generate`,
        {
          method: "POST",
          timeoutMs: 10 * 60_000,
          toastOnError: false,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
      setActiveTab("overview")
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

  async function saveConfigChanges() {
    if (savingConfig) return
    const nextConfig = cloneAutomationSchema(effectiveDraftConfig)
    setSavingConfig(true)
    try {
      await persistDraftConfig(automation.id, nextConfig)
      onConfigChange(nextConfig)
      setDraftConfig(cloneAutomationSchema(nextConfig))
      setActiveTab("overview")
      toast.success("Template saved")
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to save template"))
    } finally {
      setSavingConfig(false)
    }
  }

  function cancelConfigChanges() {
    setDraftConfig(cloneAutomationSchema(config))
    setActiveTab("overview")
  }

  async function deleteGeneratedSlideshow(run: AutomationRunApiRecord) {
    if (!run.slideshowId) {
      throw new Error("This slideshow does not have a persisted slideshow id.")
    }
    const payload = await fetchJsonWithTimeout<{ deletedRunIds?: string[] }>(
      `/api/slideshows/${encodeURIComponent(run.slideshowId)}`,
      {
        method: "DELETE",
      }
    )
    const deletedRunIds = new Set(payload.deletedRunIds ?? [run.id])
    setRecentRuns((current) =>
      current.filter((item) => !deletedRunIds.has(item.id))
    )
    deletedRunIds.forEach(onGenerationRunRemove)
  }

  function navigate(tab: AutomationDrawerTab) {
    setActiveTab(tab)
    setNavOpen(false)
  }

  const formatTabLabel =
    automationKind === "ugc"
      ? "AI actor format"
      : automationKind === "video"
        ? "Video Format"
        : "Slideshow Format"
  const hooksTabLabel = `Hooks (${hookCount}) & ${
    automationKind === "video" || automationKind === "ugc" ? "Voice" : "Style"
  }`
  const activeTabLabel =
    activeTab === "overview"
      ? "Overview"
      : activeTab === "hooks"
        ? hooksTabLabel
        : activeTab === "analytics"
          ? "Analytics"
          : activeTab === "published-posts"
            ? "Published Posts"
            : activeTab === "settings"
              ? "Settings"
              : formatTabLabel

  const navigation = (
    <>
      <div className="space-y-1">
        <AutomationSettingsNavButton
          label="Overview"
          icon={IconHome}
          active={activeTab === "overview"}
          onClick={() => navigate("overview")}
        />
        <div className="my-2 h-px bg-[#e1e0d8]" />
        <AutomationSettingsNavButton
          label={formatTabLabel}
          icon={IconWand}
          active={activeTab === "format"}
          onClick={() => navigate("format")}
        />
        <AutomationSettingsNavButton
          label={hooksTabLabel}
          icon={IconMessage}
          active={activeTab === "hooks"}
          onClick={() => navigate("hooks")}
        />
        <AutomationSettingsNavButton
          label="Analytics"
          icon={IconChartBar}
          active={activeTab === "analytics"}
          onClick={() => navigate("analytics")}
        />
        <div className="my-2 h-px bg-[#e1e0d8]" />
        {automationKind === "slideshow" && (
          <AutomationSettingsNavButton
            label="Published Posts"
            icon={IconLink}
            active={activeTab === "published-posts"}
            onClick={() => navigate("published-posts")}
          />
        )}
        <AutomationSettingsNavButton
          label="Settings"
          icon={IconSettings}
          active={activeTab === "settings"}
          onClick={() => navigate("settings")}
        />
      </div>
      <div className="mt-auto space-y-4 pt-6 pb-4 pl-3 text-[15px] font-semibold md:pt-0">
        <button
          type="button"
          className="flex items-center gap-2 text-app-text-faint disabled:cursor-not-allowed disabled:opacity-50"
          disabled={duplicating}
          onClick={() => {
            if (duplicating) return
            setDuplicating(true)
            void onDuplicate().finally(() => setDuplicating(false))
          }}
        >
          <LuCopy className="size-4" />
          {duplicating ? "Duplicating..." : "Duplicate"}
        </button>
        <button
          className="flex items-center gap-2 text-[#c54b4b]"
          onClick={onDelete}
        >
          <IconTrash className="size-4" />
          Delete template
        </button>
      </div>
    </>
  )

  const generateButton = (
    <div title={generateDisabledReason || undefined}>
      <Button
        variant="softControl"
        size="appDefault"
        className="h-10 w-full"
        disabled={Boolean(generateDisabledReason)}
        onClick={generateAutomation}
        aria-busy={generating}
        aria-describedby={
          generateDisabledReason
            ? "template-generate-disabled-reason"
            : undefined
        }
        aria-label={
          generateDisabledReason
            ? `Generate unavailable: ${generateDisabledReason}`
            : "Generate"
        }
      >
        <IconPlayerPlay className="size-4" />
        {generating ? "Generating…" : "Generate"}
      </Button>
    </div>
  )

  return (
    <Sheet open={navOpen && activeTab !== "format"} onOpenChange={setNavOpen}>
      <div
        className={cn(
          "grid min-h-[calc(100svh-3.5rem)] overflow-hidden bg-app-surface md:min-h-svh",
          activeTab !== "format" && "md:grid-cols-[246px_1fr]"
        )}
      >
        {activeTab !== "format" && (
          <aside className="hidden min-h-0 flex-col border-r border-app-panel-border bg-app-surface-subtle p-2 md:flex">
            <div className="mb-2 grid">{generateButton}</div>
            {generateDisabledReason ? (
              <p
                id="template-generate-disabled-reason"
                className="mb-3 px-2 text-[11px] leading-4 font-medium text-app-muted-text"
              >
                {generateDisabledReason}
              </p>
            ) : null}
            {navigation}
          </aside>
        )}
        <div className="relative min-h-0 overflow-y-auto bg-app-surface">
          {activeTab !== "format" && (
            <>
              {/* Below md the sidebar became a full-width block of links above
                every panel, so it moves into a sheet behind this bar. */}
              <div className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-app-panel-border bg-app-surface px-3 md:hidden">
                {/* Back leads, matching the format editor's own header bar. */}
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-[#5d5c56]"
                  onClick={() => dirtyGuard.run(onClose)}
                  aria-label="Back to templates"
                >
                  <IconChevronLeft className="size-4" />
                  Back
                </button>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="lc-focus-ring flex h-10 min-w-0 items-center gap-2 rounded-[8px] border border-app-panel-border px-3 text-[13px] font-semibold text-app-text"
                  >
                    <IconMenu2 className="size-4 shrink-0" />
                    <span className="truncate">{activeTabLabel}</span>
                  </button>
                </SheetTrigger>
                <div className="ml-auto shrink-0">{generateButton}</div>
              </div>
              <button
                className="absolute top-4 right-4 z-10 hidden h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] font-semibold text-app-text-soft hover:bg-app-surface-subtle hover:text-app-text md:inline-flex"
                onClick={() => dirtyGuard.run(onClose)}
                aria-label="Back to templates"
              >
                <IconChevronLeft className="size-4" />
                Back
              </button>
            </>
          )}
          {activeTab === "overview" && (
            <AutomationOverviewPanel
              automation={automation}
              initialRunId={initialRunId}
              config={draftConfig}
              editingName={editingName}
              draftName={draftName}
              onDraftNameChange={setDraftName}
              onStartNameEdit={() => setEditingName(true)}
              onSaveName={saveName}
              onCancelNameEdit={() => {
                setDraftName(automation.name)
                setEditingName(false)
              }}
              recentRuns={recentRuns}
              recentRunsLoading={recentRunsLoading}
              recentRunsError={recentRunsError}
              onRetryRecentRuns={() => {
                setLoadedRunsAutomationId(null)
                setRecentRunsError("")
                setRunLoadRevision((revision) => revision + 1)
              }}
              videoExports={videoExports}
              videoExportsLoading={videoExportsLoading}
              onVideoDeleted={(id) =>
                setVideoExports((current) =>
                  current.filter((item) => item.id !== id)
                )
              }
              onDeleteRun={deleteGeneratedSlideshow}
              onRunChanged={(run) => {
                setRecentRuns((current) =>
                  current.map((item) => (item.id === run.id ? run : item))
                )
                onGenerationRunUpdate(run)
              }}
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
          {activeTab === "analytics" && (
            <HookAnalyticsPanel automation={automation} />
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
          {activeTab === "published-posts" && (
            <TikTokPublicationImportPanel
              automationId={automation.id}
              onRunsImported={(runs) => {
                setRecentRuns(runs)
                runs.forEach(onGenerationRunUpdate)
              }}
            />
          )}
        </div>
      </div>
      <SheetContent
        side="bottom"
        className="z-[70] flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[18px] bg-app-surface-subtle p-3 shadow-[0_-16px_40px_rgba(25,18,45,0.18)] md:hidden"
        overlayClassName="z-[70] bg-black/35 md:hidden"
      >
        <div className="mb-2 flex items-center justify-between">
          <SheetTitle className="pl-1 text-[15px] font-semibold text-app-text">
            {automation.name}
          </SheetTitle>
          <SheetClose asChild>
            <button
              type="button"
              aria-label="Close template menu"
              className="lc-focus-ring flex size-10 items-center justify-center rounded-[10px] text-app-text active:bg-app-control-hover"
            >
              <IconX className="size-5" />
            </button>
          </SheetClose>
        </div>
        {navigation}
      </SheetContent>
      {dirtyGuard.confirmation}
    </Sheet>
  )
}

async function loadFailedRunForRequest(
  automationId: string,
  requestId: string
) {
  const payload = await fetchJsonWithTimeout<{
    runs?: AutomationRunApiRecord[]
  }>(
    `/api/automations/runs?automationId=${encodeURIComponent(automationId)}&limit=20`,
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
