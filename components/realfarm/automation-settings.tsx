"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { flushSync } from "react-dom"
import {
  IconBrandBluesky,
  IconBrandFacebookFilled,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandPinterest,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutubeFilled,
  IconBug,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconLanguage,
  IconLayoutDashboard,
  IconList,
  IconMessage,
  IconPlus,
  IconTrash,
  IconVideo,
  IconWand,
  IconX,
  type Icon,
} from "@tabler/icons-react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Blend,
  Copy,
  Expand,
  Grid2X2,
  Grid3X3,
  Image,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Type,
} from "lucide-react"

import { GeneratedVideoExports } from "@/components/realfarm/generated-video-exports"
import { renderAndUploadUgcAdVideo } from "@/components/realfarm/generated-video-renderer"
import {
  createGeneratedVideoExportRecord,
  updateGeneratedVideoExportRecord,
  useGeneratedVideoExports,
} from "@/components/realfarm/generated-video-workflow"
import {
  AutomationThumb,
  AvatarDot,
  ControlRow,
  ControlSelect,
  ControlToggle,
  PinterestPreviewTile,
} from "@/components/realfarm/shared-media"
import {
  SocialAccountStatusRow,
  type SocialAccountStatusItem,
} from "@/components/realfarm/social-account-status"
import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { SoundSelector } from "@/components/realfarm/creator-ui"
import { Button } from "@/components/ui/button"
import {
  SelectControl,
  SelectLike,
  SwitchPill,
  SwitchPillButton,
} from "@/components/ui/form-controls"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import {
  alignmentLabel,
  anchorLabel,
  aspectRatioLabel,
  automationAlignments,
  automationAnchors,
  automationAspectRatios,
  automationCollectionId,
  automationFormatSection,
  automationHooks,
  automationProviderPublishAs,
  automationProviderPublishesVideo,
  automationImageGrids,
  automationPublishType,
  automationTone,
  automationWordLengths,
  defaultAutomationTextItem,
  imageGridLabel,
  labelToAlignment,
  labelToAnchor,
  labelToAspectRatio,
  labelToImageGrid,
  labelToWordLength,
  postTextSettingWithValue,
  postTextValue,
  schemaWithAutomationCollectionId,
  schemaWithAutomationHooks,
  schemaWithAutomationTone,
  updateAutomationFormatSection,
  wordLengthLabel,
  type AutomationDay,
  type AutomationAspectRatio,
  type AutomationFormatSection,
  type AutomationImageOverride,
  type AutomationSchema,
  type AutomationSlideOverride,
  type AutomationSocialIntegration,
  type AutomationSocialProvider,
  type AutomationTextItem,
  type TikTokPublishType,
} from "@/lib/realfarm-automation"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  defaultPostFastProviderControls,
  type PostFastProviderControls,
} from "@/lib/postfast-provider-controls"
import type { PostFastSocialProvider } from "@/lib/postfast-client"
import {
  renderedSlideSvg,
  type SlideshowSlide,
  type SlideshowTextItem,
} from "@/lib/slideshow-renderer"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import { previewTextForTextItem } from "@/lib/realfarm-preview-text"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import {
  automationLanguageOptions,
  defaultAutomationLanguage,
  defaultAutomationPublishType,
  defaultSlideshowTransition,
  randomTikTokSoundLabel,
  slideshowDurationOptions,
  slideshowDurationValue,
  slideshowTransitionOptions,
} from "@/lib/slideshow-publishing-config"
import {
  canPublishSlideshowAsVideo,
  isSlideshowSocialProvider,
} from "@/lib/slideshow-social-platforms"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

type AutomationDrawerTab =
  "overview" | "format" | "hooks" | "schedule" | "tiktok" | "settings"

type AutomationRunApiPayload = {
  created?: AutomationRunApiRecord[]
}

type AutomationRunApiRecord = {
  id: string
  automationId: string
  automationTitle: string
  scheduledFor: string
  status: "succeeded" | "failed" | "generating"
  slideshowId?: string
  videoUrl?: string
  thumbnailUrl?: string
  outputImages?: string[]
  outputDir?: string
  socialStatuses?: SocialAccountStatusItem[]
  renderedSlides?: AutomationRunApiSlide[]
  createdAt: string
  error?: string
  plan?: {
    title?: string
    caption?: string
    hashtags?: string
    hook?: string
    hookCandidates?: string[]
    textModel?: string
    publishType?: string
    language?: string
    debug?: {
      selectedHookIndex?: number
      textModelPrompt?: unknown
    }
    slides?: AutomationRunApiSlide[]
  }
}

type AutomationRunApiSlide = {
  id?: string
  role?: "hook" | "content" | "cta"
  imageUrl?: string
  sourceImageUrl?: string
  imageCaption?: string
  text?: string
  durationMs?: number
  aspectRatio?: string
}

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
              label="Hooks (2) & Style"
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

function AutomationOverviewPanel({
  automation,
  editingName,
  draftName,
  recentRuns,
  onDraftNameChange,
  onStartNameEdit,
  onSaveName,
  onCancelNameEdit,
}: {
  automation: Automation
  editingName: boolean
  draftName: string
  recentRuns: AutomationRunApiRecord[]
  onDraftNameChange: (value: string) => void
  onStartNameEdit: () => void
  onSaveName: () => void
  onCancelNameEdit: () => void
}) {
  const [viewerRun, setViewerRun] = useState<AutomationRunApiRecord | null>(
    null
  )
  const [debugRun, setDebugRun] = useState<AutomationRunApiRecord | null>(null)

  return (
    <div className="min-h-full bg-white">
      <div className="h-[106px] bg-gradient-to-r from-[#90464b] via-[#9a707d] to-[#94a1b0]" />
      <div className="px-6 pb-8">
        <div className="-mt-8 flex justify-center">
          <AvatarDot
            name={automation.name}
            index={12}
            className="size-16 border-4 border-white"
          />
        </div>
        <div className="mt-4 flex justify-center">
          {editingName ? (
            <input
              className="h-9 min-w-[260px] rounded-[7px] border border-[#d8d7cf] bg-white px-3 text-center text-[19px] font-semibold ring-2 ring-app-action/20 outline-none"
              value={draftName}
              autoFocus
              onChange={(event) => onDraftNameChange(event.target.value)}
              onBlur={onSaveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSaveName()
                }
                if (event.key === "Escape") {
                  onCancelNameEdit()
                }
              }}
            />
          ) : (
            <div className="flex max-w-full items-center justify-center gap-2">
              <h2 className="truncate text-center text-[19px] font-bold text-[#20201d]">
                {automation.name}
              </h2>
              <button
                className="grid size-6 place-items-center rounded-full text-[#9a9991] hover:bg-[#f1f0eb] hover:text-[#242421]"
                onClick={onStartNameEdit}
                aria-label="Edit automation name"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="mx-auto mt-4 grid max-w-[494px] grid-cols-4 overflow-hidden rounded-[10px] border border-[#e2e1da]">
          {[
            ["0", "Views"],
            ["0", "Likes"],
            ["0", "Bookmarks"],
            ["0.0%", "Engagement"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="border-r border-[#e2e1da] px-4 py-3 text-center last:border-r-0"
            >
              <div className="text-[18px] font-bold text-[#171714]">
                {value}
              </div>
              <div className="mt-1 text-[11px] font-medium text-[#77766f]">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-5 max-w-[494px]">
          <button className="mb-3 flex items-center gap-1 text-[14px] font-bold text-[#242421]">
            Recent
            <IconChevronRight className="size-4 rotate-90" />
          </button>
          {recentRuns.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recentRuns.slice(0, 3).map((run, index) => (
                <AutomationRecentRunCard
                  key={run.id}
                  run={run}
                  theme={automation.theme}
                  index={index}
                  onOpen={() => setViewerRun(run)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed border-[#d8d7cf] bg-[#f8f8f4] px-4 py-6 text-center text-[13px] font-semibold text-[#77766f]">
              No generated slideshows yet.
            </div>
          )}
        </div>
      </div>
      {viewerRun && (
        <AutomationGeneratedSlideshowViewer
          run={viewerRun}
          onClose={() => setViewerRun(null)}
          onDebug={() => setDebugRun(viewerRun)}
        />
      )}
      {debugRun && (
        <AutomationRunDebugModal
          run={debugRun}
          onClose={() => setDebugRun(null)}
        />
      )}
    </div>
  )
}

function AutomationRecentRunCard({
  run,
  theme,
  index,
  onOpen,
}: {
  run: AutomationRunApiRecord
  theme: string
  index: number
  onOpen: () => void
}) {
  const slides = automationRunSlides(run)
  const firstSlide = slides[0]
  const title = slideshowTitle(run)
  const thumbnailUrl = run.thumbnailUrl?.trim() || firstSlide?.imageUrl

  return (
    <article className="w-[150px] shrink-0">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[6px] bg-[#111] shadow-sm">
        <button
          type="button"
          className="absolute inset-0 text-left"
          onClick={onOpen}
          aria-label={`Open generated slideshow ${title}`}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <AutomationThumb theme={theme} index={index} />
          )}
          <span
            className={cn(
              "absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-bold shadow-sm",
              runStatusBadgeClass(run.status)
            )}
          >
            {runStatusLabel(run.status)}
          </span>
          {run.videoUrl ? (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
              Video
            </span>
          ) : null}
        </button>
      </div>
      <SocialAccountStatusRow
        items={run.socialStatuses ?? []}
        size="compact"
        className="mt-2"
        emptyLabel="No accounts"
      />
      <div className="mt-2 truncate text-[11px] font-semibold text-[#77766f]">
        {runScheduleDurationLine(run)}
      </div>
    </article>
  )
}

function AutomationGeneratedSlideshowViewer({
  run,
  onClose,
  onDebug,
}: {
  run: AutomationRunApiRecord
  onClose: () => void
  onDebug: () => void
}) {
  const slides = automationRunSlides(run)
  const [activeSlide, setActiveSlide] = useState(0)
  const activeSlideIndex = Math.min(activeSlide, Math.max(0, slides.length - 1))
  const activeSlideRecord = slides[activeSlideIndex] ?? slides[0]
  const canGoPrev = activeSlideIndex > 0
  const canGoNext = activeSlideIndex < slides.length - 1

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="h-[min(680px,90vh)] max-w-[920px] overflow-hidden rounded-[10px] bg-white">
        <header className="flex h-[60px] items-center justify-between border-b border-[#d7d6d0] bg-white px-3">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-semibold text-[#242421]">
              {slideshowTitle(run)}
            </h2>
            <div className="truncate text-[12px] font-medium text-[#77766f]">
              {runScheduleDurationLine(run)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="grid size-8 place-items-center rounded-[5px] text-[#77766f] hover:bg-[#f1f0eb]"
              onClick={onDebug}
              aria-label="Show generation debug prompt"
            >
              <IconBug className="size-4" />
            </button>
            <button
              className="grid size-8 place-items-center rounded-[5px] text-[#77766f] hover:bg-[#f1f0eb]"
              onClick={onClose}
              aria-label="Close generated slideshow"
            >
              <IconX className="size-5" />
            </button>
          </div>
        </header>
        <main className="grid h-[calc(100%-60px)] gap-5 overflow-y-auto bg-[#f7f7f4] p-5 lg:grid-cols-[280px_1fr]">
          <section className="min-w-0">
            <div
              className="relative overflow-hidden rounded-[9px] bg-black shadow-xl"
              style={{
                aspectRatio: ratioToCss(activeSlideRecord?.aspectRatio),
              }}
            >
              {activeSlideRecord?.imageUrl ? (
                <img
                  src={activeSlideRecord.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <AutomationThumb theme="blue" index={0} />
              )}
              <span
                className={cn(
                  "absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-bold shadow-sm",
                  runStatusBadgeClass(run.status)
                )}
              >
                {runStatusLabel(run.status)}
              </span>
              {slides.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="absolute top-1/2 left-2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/88 text-[#242421] shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() =>
                      setActiveSlide((value) => Math.max(0, value - 1))
                    }
                    disabled={!canGoPrev}
                    aria-label="Previous slide"
                  >
                    <IconChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/88 text-[#242421] shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() =>
                      setActiveSlide((value) =>
                        Math.min(slides.length - 1, value + 1)
                      )
                    }
                    disabled={!canGoNext}
                    aria-label="Next slide"
                  >
                    <IconChevronRight className="size-5" />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 pt-8 pb-2 text-center text-[12px] font-bold text-white">
                    Slide {activeSlideIndex + 1} of {slides.length}
                  </div>
                </>
              ) : null}
            </div>
            <div className="mt-2 text-[12px] font-semibold text-[#6f6e69]">
              {runScheduleDurationLine(run)}
            </div>
            {run.videoUrl ? (
              <div className="mt-4 overflow-hidden rounded-[9px] border border-[#d8d7cf] bg-black">
                <video
                  src={run.videoUrl}
                  poster={run.thumbnailUrl}
                  controls
                  className="block aspect-[4/5] w-full bg-black object-contain"
                  preload="metadata"
                />
              </div>
            ) : null}
          </section>

          <section className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-[10px] border border-[#e1e0d8] bg-white p-4">
              <AutomationRunDetail
                label="Status"
                value={runStatusLabel(run.status)}
              />
              <AutomationRunDetail
                label="Post timing"
                value={formatRunSchedule(run.scheduledFor)}
              />
              <AutomationRunDetail
                label="Duration"
                value={formatRunDuration(runDurationSeconds(run))}
              />
              <AutomationRunDetail label="Slides" value={`${slides.length}`} />
              <AutomationRunDetail
                label="Created"
                value={formatRunDate(run.createdAt)}
              />
              <AutomationRunDetail
                label="Type"
                value={run.plan?.publishType || "slideshow"}
              />
              <AutomationRunDetail
                label="Language"
                value={run.plan?.language || "default"}
              />
              <AutomationRunDetail
                label="Current slide"
                value={slides.length ? `Slide ${activeSlideIndex + 1}` : "None"}
              />
            </div>
            <div className="rounded-[10px] border border-[#e1e0d8] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[12px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                  Account status
                </div>
                <div className="text-[12px] font-semibold text-[#77766f]">
                  {(run.socialStatuses ?? []).length} accounts
                </div>
              </div>
              <SocialAccountStatusRow
                items={run.socialStatuses ?? []}
                showLabels
                emptyLabel="No social accounts selected"
              />
            </div>
            <div className="rounded-[10px] border border-[#e1e0d8] bg-white p-4">
              <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                Title
              </div>
              <p className="text-[14px] leading-6 font-medium text-[#333]">
                {slideshowTitle(run)}
              </p>
            </div>
            <div className="rounded-[10px] border border-[#e1e0d8] bg-white p-4">
              <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                Caption
              </div>
              <p className="text-[14px] leading-6 font-medium text-[#333]">
                {slideshowCaption(run)}
              </p>
            </div>
            {run.plan?.hashtags ? (
              <div className="rounded-[10px] border border-[#e1e0d8] bg-white p-4">
                <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                  Hashtags
                </div>
                <p className="text-[14px] leading-6 font-medium text-[#333]">
                  {run.plan.hashtags}
                </p>
              </div>
            ) : null}
            {run.error ? (
              <div className="rounded-[10px] border border-[#f0c7c7] bg-[#fff6f6] p-4 text-[13px] font-semibold text-[#b73737]">
                {run.error}
              </div>
            ) : null}
          </section>
        </main>
      </AppModalPanel>
    </AppModal>
  )
}

function AutomationRunDetail({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold tracking-[0.08em] text-[#9a9991] uppercase">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold text-[#242421]">
        {value}
      </div>
    </div>
  )
}

function AutomationRunDebugModal({
  run,
  onClose,
}: {
  run: AutomationRunApiRecord
  onClose: () => void
}) {
  const promptDebug = run.plan?.debug?.textModelPrompt
  const promptDebugText = promptDebug
    ? JSON.stringify(promptDebug, null, 2)
    : "No text model prompt was sent."

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="max-w-[720px] rounded-[8px] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-[#242421]">
              Generation debug
            </h2>
            <div className="text-[12px] font-medium text-[#77766f]">
              Model: {run.plan?.textModel || "not run"} · Source hook #
              {(run.plan?.debug?.selectedHookIndex ?? 0) + 1}
            </div>
          </div>
          <button
            className="grid size-8 place-items-center rounded-[5px] text-[#77766f] hover:bg-[#f1f0eb]"
            onClick={onClose}
            aria-label="Close generation debug"
          >
            <IconX className="size-5" />
          </button>
        </div>
        {run.plan?.hookCandidates?.length ? (
          <div className="mb-3 rounded-[6px] bg-[#f7f7f3] p-3 text-[12px] font-medium text-[#555]">
            {run.plan.hookCandidates.join(" | ")}
          </div>
        ) : null}
        <pre className="max-h-[420px] overflow-auto rounded-[6px] bg-[#1f201d] p-3 text-[11px] leading-4 whitespace-pre-wrap text-white">
          {promptDebugText}
        </pre>
      </AppModalPanel>
    </AppModal>
  )
}

function formatRunDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return "Generated"
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatRunSchedule(value: string | undefined) {
  if (!value) {
    return "Not scheduled"
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return "Not scheduled"
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function runStatusLabel(status: AutomationRunApiRecord["status"]) {
  switch (status) {
    case "generating":
      return "Generating"
    case "succeeded":
      return "Succeeded"
    case "failed":
      return "Failed"
    default:
      return "Succeeded"
  }
}

function runStatusBadgeClass(status: AutomationRunApiRecord["status"]) {
  switch (status) {
    case "generating":
      return "bg-[#ff4d2d] text-white"
    case "succeeded":
      return "bg-emerald-600 text-white"
    case "failed":
      return "bg-[#d94444] text-white"
    default:
      return "bg-white/90 text-[#242421]"
  }
}

function runDurationSeconds(run: AutomationRunApiRecord) {
  const slides = automationRunSlides(run)
  const durationMs = slides.reduce(
    (total, slide) => total + Math.max(0, slide.durationMs ?? 0),
    0
  )
  return durationMs > 0 ? durationMs / 1000 : slides.length * 4
}

function formatRunDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`
}

function runScheduleDurationLine(run: AutomationRunApiRecord) {
  return `${formatRunSchedule(run.scheduledFor)} · ${formatRunDuration(
    runDurationSeconds(run)
  )}`
}

function slideshowTitle(run: AutomationRunApiRecord) {
  return (
    run.plan?.title?.trim() ||
    run.plan?.hook?.trim() ||
    automationRunSlides(run)[0]?.text?.trim() ||
    run.automationTitle
  )
}

function slideshowCaption(run: AutomationRunApiRecord) {
  return (
    run.plan?.caption?.trim() ||
    run.plan?.hook?.trim().toLowerCase() ||
    automationRunSlides(run)[0]?.text?.trim().toLowerCase() ||
    "no caption saved."
  )
}

function automationRunSlides(run: AutomationRunApiRecord) {
  return run.renderedSlides?.length
    ? run.renderedSlides
    : (run.plan?.slides ?? [])
}

function generationPlaceholderRun({
  automation,
  config,
  collections,
}: {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
}): AutomationRunApiRecord {
  const now = new Date().toISOString()
  const hook = automationHooks(config)[0] || config.title || automation.name
  const slides = generationPlaceholderSlides(config, collections, hook)

  return {
    id: `generation-placeholder-${automation.id}`,
    automationId: automation.id,
    automationTitle: automation.name,
    scheduledFor: now,
    status: "generating",
    createdAt: now,
    socialStatuses: [],
    renderedSlides: slides,
    plan: {
      title: "Generating slideshow",
      caption: "",
      hashtags: "",
      hook,
      publishType: automationPublishType(config),
      language:
        config.image_collection_ids.language || defaultAutomationLanguage,
      slides,
    },
  }
}

function generationPlaceholderSlides(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  hook: string
): AutomationRunApiSlide[] {
  const hookSection = automationFormatSection(config, "hook")
  const contentSection = automationFormatSection(config, "content")
  const hookImages = formatCollectionImages(config, collections, "hook")
  const contentImages = formatCollectionImages(config, collections, "content")
  const slides = [
    generationPlaceholderSlide({
      id: "placeholder-hook",
      role: "hook",
      image: hookImages[0] ?? contentImages[0],
      text: hook,
      section: hookSection,
    }),
    ...[0, 1].map((index) =>
      generationPlaceholderSlide({
        id: `placeholder-content-${index + 1}`,
        role: "content",
        image:
          contentImages[index % Math.max(1, contentImages.length)] ??
          hookImages[0],
        text: formatPreviewText(config, "content", index),
        section: contentSection,
      })
    ),
  ]

  return slides.filter((slide): slide is AutomationRunApiSlide =>
    Boolean(slide)
  )
}

function generationPlaceholderSlide({
  id,
  role,
  image,
  text,
  section,
}: {
  id: string
  role: "hook" | "content"
  image: PinterestSearchResult | undefined
  text: string
  section: AutomationFormatSection
}): AutomationRunApiSlide | null {
  if (!image?.imageUrl) {
    return null
  }

  return {
    id,
    role,
    imageUrl: image.imageUrl,
    sourceImageUrl: image.sourceUrl,
    imageCaption: image.description ?? image.title ?? "",
    text,
    durationMs: 0,
    aspectRatio: section.aspect_ratio,
  }
}

function ratioToCss(value: string | undefined) {
  switch (value) {
    case "4:5":
      return "4 / 5"
    case "3:4":
      return "3 / 4"
    case "3:2":
      return "3 / 2"
    case "1:1":
      return "1 / 1"
    case "9:16":
    default:
      return "9 / 16"
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function cloneAutomationSchema(config: AutomationSchema): AutomationSchema {
  return structuredClone(config)
}

function AutomationFormatPanel({
  automation,
  config,
  collections,
  selectedSound,
  music,
  demoVideos,
  onCreateCollection,
  onConfigChange,
  onBack,
  onSave,
}: {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  demoVideos: LocalAsset[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onConfigChange: (config: AutomationSchema) => void
  onBack: () => void
  onSave: () => void
}) {
  const [activeTab, setActiveTab] = useState<"Hook" | "Content" | "CTA">("Hook")
  const [activePreview, setActivePreview] = useState(0)
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(
    null
  )
  const activeKey = activeTab.toLowerCase() as "hook" | "content" | "cta"
  const activeSection = automationFormatSection(config, activeKey)
  const activeTextItem =
    activeSection.textItems[selectedTextIndex ?? 0] ??
    defaultAutomationTextItem()
  const activeCollection = formatCollection(config, collections, activeKey)
  const activeOverlayCollection = findCollectionByIdOrAlias(
    collections,
    activeSection.overlayImage?.collectionId ?? ""
  )
  const previewItems = buildFormatPreviewItems(config, collections)
  const previewSlotWidth = 176
  const previewGap = 24
  const activePreviewIndex = Math.min(
    activePreview,
    Math.max(0, previewItems.length - 1)
  )
  const previewTrackOffset =
    activePreviewIndex * (previewSlotWidth + previewGap) + previewSlotWidth / 2

  if (config.automationKind === "video") {
    return (
      <VideoAutomationFormatPanel
        automation={automation}
        config={config}
        collections={collections}
        selectedSound={selectedSound}
        music={music}
        demoVideos={demoVideos}
        onCreateCollection={onCreateCollection}
        onConfigChange={onConfigChange}
        onBack={onBack}
        onSave={onSave}
      />
    )
  }

  function selectTab(tab: "Hook" | "Content" | "CTA") {
    setActiveTab(tab)
    setActivePreview(
      Math.max(
        0,
        previewItems.findIndex((item) => item.tab === tab)
      )
    )
    setSelectedTextIndex(null)
  }

  function updateSchema(
    updater: (current: AutomationSchema) => AutomationSchema
  ) {
    onConfigChange(updater(config))
  }

  function updateFormatSection<K extends "hook" | "content" | "cta">(
    key: K,
    patch: Partial<AutomationFormatSection>
  ) {
    updateSchema((current) =>
      updateAutomationFormatSection(current, key, patch)
    )
  }

  function updateImageCollectionId(
    role: AutomationFormatRole,
    collectionId: string
  ) {
    updateSchema((current) =>
      schemaWithAutomationCollectionId(current, role, collectionId)
    )
  }

  function updateCtaEnabled(enabled: boolean) {
    updateSchema((current) => ({
      ...updateAutomationFormatSection(current, "cta", {
        slideCount: enabled
          ? Math.max(1, automationFormatSection(current, "cta").slideCount || 1)
          : 0,
      }),
      image_collection_ids: {
        ...current.image_collection_ids,
        cta_slide: {
          ...current.image_collection_ids.cta_slide,
          check: enabled,
        },
      },
    }))
  }

  function updateCtaPlacement(value: "last" | "static") {
    updateSchema((current) => ({
      ...updateAutomationFormatSection(current, "cta", { ctaLocation: value }),
      image_collection_ids: {
        ...current.image_collection_ids,
        cta_slide: {
          ...current.image_collection_ids.cta_slide,
          cta_location: value === "last" ? "last_slide" : "static",
        },
      },
    }))
  }

  function updateCtaImageMode(value: "collection" | "single_image") {
    updateSchema((current) => ({
      ...updateAutomationFormatSection(current, "cta", { imageMode: value }),
      image_collection_ids: {
        ...current.image_collection_ids,
        cta_slide: {
          ...current.image_collection_ids.cta_slide,
          cta_collection_check: value === "collection",
        },
      },
    }))
  }

  function updateCtaSingleImage(imageId: string) {
    updateSchema((current) => ({
      ...current,
      image_collection_ids: {
        ...current.image_collection_ids,
        cta_slide: {
          ...current.image_collection_ids.cta_slide,
          image_id: imageId,
        },
      },
    }))
  }

  function updateCtaOverlayImage(enabled: boolean) {
    updateFormatSection("cta", {
      overlayImage: {
        ...(activeSection.overlayImage ?? { padding: 5 }),
        enabled,
      },
    })
  }

  function updateCtaOverlayCollection(collectionId: string) {
    updateFormatSection("cta", {
      overlayImage: {
        ...(activeSection.overlayImage ?? { enabled: true, padding: 5 }),
        enabled: true,
        collectionId,
      },
    })
  }

  function updateSectionOverlayImage(enabled: boolean) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        overlayImage: {
          ...(section.overlayImage ?? { padding: 5 }),
          enabled,
        },
      })
    })
  }

  function updateSectionOverlayCollection(collectionId: string) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        overlayImage: {
          ...(section.overlayImage ?? { enabled: true, padding: 5 }),
          enabled: true,
          collectionId,
        },
      })
    })
  }

  function updateSectionOverlayPadding(padding: number) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        overlayImage: {
          ...(section.overlayImage ?? { enabled: true }),
          enabled: section.overlayImage?.enabled ?? true,
          padding: clampPercent(padding),
        },
      })
    })
  }

  function updateContentSlideOverride(
    index: number,
    patch: Partial<AutomationSlideOverride>
  ) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      const slideOverrides = [...(section.slideOverrides ?? [])]
      const existing = slideOverrides[index] ?? {
        slideIndex: index + 1,
        contentDirection: "",
      }
      slideOverrides[index] = {
        ...existing,
        ...patch,
        slideIndex: clampSlideIndex(patch.slideIndex ?? existing.slideIndex),
        contentDirection:
          patch.contentDirection ?? existing.contentDirection ?? "",
      }
      return updateAutomationFormatSection(current, "content", {
        slideOverrides,
      })
    })
  }

  function addContentSlideOverride() {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      const slideOverrides = [...(section.slideOverrides ?? [])]
      slideOverrides.push({
        slideIndex: slideOverrides.length + 1,
        contentDirection: "",
      })
      return updateAutomationFormatSection(current, "content", {
        slideOverrides,
      })
    })
  }

  function removeContentSlideOverride(index: number) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        slideOverrides: (section.slideOverrides ?? []).filter(
          (_, overrideIndex) => overrideIndex !== index
        ),
      })
    })
  }

  function updateContentImageOverride(
    index: number,
    patch: Partial<AutomationImageOverride>
  ) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      const imageOverrides = [...(section.imageOverrides ?? [])]
      const existing = imageOverrides[index] ?? {
        slideIndex: index + 1,
        collectionId: "",
      }
      imageOverrides[index] = {
        ...existing,
        ...patch,
        slideIndex: clampSlideIndex(patch.slideIndex ?? existing.slideIndex),
        collectionId: patch.collectionId ?? existing.collectionId ?? "",
      }
      return updateAutomationFormatSection(current, "content", {
        imageOverrides,
      })
    })
  }

  function addContentImageOverride() {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      const imageOverrides = [...(section.imageOverrides ?? [])]
      imageOverrides.push({
        slideIndex: imageOverrides.length + 1,
        collectionId: "",
      })
      return updateAutomationFormatSection(current, "content", {
        imageOverrides,
      })
    })
  }

  function removeContentImageOverride(index: number) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        imageOverrides: (section.imageOverrides ?? []).filter(
          (_, overrideIndex) => overrideIndex !== index
        ),
      })
    })
  }

  function updateTextItem(patch: Partial<AutomationTextItem>) {
    updateSchema((current) => {
      const section = automationFormatSection(current, activeKey)
      const textIndex = selectedTextIndex ?? 0
      const textItems =
        section.textItems.length > 0
          ? [...section.textItems]
          : [defaultAutomationTextItem()]
      textItems[textIndex] = {
        ...defaultAutomationTextItem(),
        ...textItems[textIndex],
        ...patch,
      }

      return updateAutomationFormatSection(current, activeKey, { textItems })
    })
  }

  function deleteSelectedTextItem() {
    updateSchema((current) => {
      const section = automationFormatSection(current, activeKey)
      const textIndex = selectedTextIndex ?? 0
      const textItems = section.textItems.filter(
        (_, index) => index !== textIndex
      )
      return updateAutomationFormatSection(current, activeKey, {
        textItems:
          textItems.length > 0 ? textItems : [defaultAutomationTextItem()],
      })
    })
    setSelectedTextIndex(null)
  }

  function addTextItem() {
    updateSchema((current) => {
      const section = automationFormatSection(current, activeKey)
      const textItems =
        section.textItems.length > 0
          ? [...section.textItems, defaultAutomationTextItem()]
          : [defaultAutomationTextItem(), defaultAutomationTextItem()]
      return updateAutomationFormatSection(current, activeKey, { textItems })
    })
    setSelectedTextIndex(activeSection.textItems.length)
  }

  return (
    <div className="grid h-full min-h-0 bg-[#b9b9b6] md:grid-cols-[335px_1fr]">
      <aside className="flex min-h-0 flex-col bg-[#f7f7f4]">
        <div className="flex h-12 items-center justify-between border-b border-[#deddd5] px-3">
          <button
            className="flex items-center gap-2 text-[13px] font-semibold text-[#5d5c56]"
            onClick={onBack}
          >
            <IconChevronLeft className="size-4" />
            Back
          </button>
          <div className="flex gap-2 text-[#8c8b84]">
            <IconList className="size-4" />
            <Grid2X2 className="size-4" />
          </div>
        </div>

        <div className="grid h-11 grid-cols-3 border-b border-[#deddd5] text-center text-[13px] font-semibold">
          {(["Hook", "Content", "CTA"] as const).map((tab) => (
            <button
              key={tab}
              className={cn(
                activeTab === tab
                  ? "border-b-2 border-[#242421] text-[#242421]"
                  : "text-[#9a9991]"
              )}
              onClick={() => selectTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {activeTab === "CTA" ? (
            <AutomationCtaFormatEditor
              config={config}
              section={activeSection}
              collection={activeCollection}
              collections={collections}
              onCreateCollection={onCreateCollection}
              onEnabledChange={updateCtaEnabled}
              onPlacementChange={updateCtaPlacement}
              onImageModeChange={updateCtaImageMode}
              onCollectionChange={(collectionId) =>
                updateImageCollectionId("cta", collectionId)
              }
              onSingleImageChange={updateCtaSingleImage}
              onSectionChange={(patch) => updateFormatSection("cta", patch)}
              onOverlayImageChange={updateCtaOverlayImage}
              onOverlayCollectionChange={updateCtaOverlayCollection}
            />
          ) : (
            <>
              <CollectionSelector
                label={activeTab}
                collection={activeCollection}
                collections={collections}
                onChange={(collectionId) =>
                  updateImageCollectionId(activeKey, collectionId)
                }
                onCreateCollection={onCreateCollection}
              />

              {activeTab === "Content" && (
                <div className="mb-3 grid grid-cols-[1fr_72px] gap-2">
                  <SelectLike
                    value="Static"
                    options={["Static"]}
                    placement="bottom"
                    onChange={() => undefined}
                  />
                  <input
                    className="h-8 rounded-[7px] border border-[#ebeae3] bg-white px-2 text-center text-[12px] font-semibold outline-none"
                    value={activeSection.slideCount}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 1
                      updateSchema((current) => ({
                        ...updateAutomationFormatSection(current, "content", {
                          slideCount: value,
                        }),
                        prompt_formatting: {
                          ...current.prompt_formatting,
                          num_of_slides: Math.max(
                            1,
                            value +
                              automationFormatSection(current, "hook")
                                .slideCount
                          ),
                        },
                      }))
                    }}
                    aria-label="Slide count"
                  />
                </div>
              )}

              <ControlSelect
                label="Aspect Ratio"
                value={aspectRatioLabel(activeSection.aspect_ratio)}
                options={automationAspectRatios.map(aspectRatioLabel)}
                onChange={(value) =>
                  updateFormatSection(activeKey, {
                    aspect_ratio: labelToAspectRatio(value),
                  })
                }
              />
              <ControlSelect
                label="Image Grid"
                value={imageGridLabel(activeSection.imageGrid)}
                options={automationImageGrids.map(imageGridLabel)}
                onChange={(value) =>
                  updateFormatSection(activeKey, {
                    imageGrid: labelToImageGrid(value),
                  })
                }
              />
              <ControlToggle
                label="Overlay"
                enabled={activeSection.overlay}
                onClick={() =>
                  updateFormatSection(activeKey, {
                    overlay: !activeSection.overlay,
                  })
                }
              />
              {activeTab === "Content" ? (
                <AutomationContentFormatEditor
                  section={activeSection}
                  overlayCollection={activeOverlayCollection}
                  collections={collections}
                  onCreateCollection={onCreateCollection}
                  onOverlayImageChange={updateSectionOverlayImage}
                  onOverlayCollectionChange={updateSectionOverlayCollection}
                  onOverlayPaddingChange={updateSectionOverlayPadding}
                  onDisplayTextChange={(enabled) =>
                    updateFormatSection("content", { noText: !enabled })
                  }
                  onSlideOverrideAdd={addContentSlideOverride}
                  onSlideOverrideChange={updateContentSlideOverride}
                  onSlideOverrideRemove={removeContentSlideOverride}
                  onImageOverrideAdd={addContentImageOverride}
                  onImageOverrideChange={updateContentImageOverride}
                  onImageOverrideRemove={removeContentImageOverride}
                />
              ) : (
                <ControlToggle
                  label="Display text"
                  enabled={!activeSection.noText}
                  onClick={() =>
                    updateFormatSection(activeKey, {
                      noText: !activeSection.noText,
                    })
                  }
                />
              )}
            </>
          )}
        </div>

        <div className="border-t border-[#deddd5] p-3">
          <Button
            variant="action"
            size="appDefault"
            className="w-full"
            onClick={onSave}
          >
            Save Changes
          </Button>
        </div>
      </aside>

      <main className="relative min-h-0 overflow-hidden bg-[#b9b9b6]">
        <div
          className={cn(
            "overflow-hidden",
            selectedTextIndex !== null
              ? "h-[315px] pt-[92px]"
              : "h-full pt-[168px]"
          )}
        >
          <div
            className="flex items-start transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
            style={{
              gap: `${previewGap}px`,
              transform: `translateX(calc(50% - ${previewTrackOffset}px))`,
            }}
          >
            {previewItems.map((item, index) => (
              <AutomationFormatPreviewCard
                key={item.id}
                item={item}
                index={index}
                active={activePreviewIndex === index}
                slotWidth={previewSlotWidth}
                selectedText={
                  selectedTextIndex !== null && activePreviewIndex === index
                }
                onSelect={() => {
                  setActivePreview(index)
                  setActiveTab(item.tab)
                  setSelectedTextIndex(null)
                }}
                onSelectText={() => {
                  setActivePreview(index)
                  setActiveTab(item.tab)
                  setSelectedTextIndex(0)
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-1.5">
            {previewItems.map((item, index) => (
              <button
                key={item.id}
                className={cn(
                  "size-2 rounded-full",
                  index === activePreviewIndex ? "bg-white" : "bg-white/55"
                )}
                onClick={() => {
                  setActivePreview(index)
                  setActiveTab(item.tab)
                  setSelectedTextIndex(null)
                }}
                aria-label={`Select preview ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {selectedTextIndex !== null && (
          <AutomationFormatTextToolbar
            mode={activeTab}
            textItem={activeTextItem}
            updateTextItem={updateTextItem}
            onDelete={deleteSelectedTextItem}
            onAdd={addTextItem}
          />
        )}
      </main>
    </div>
  )
}

function VideoAutomationFormatPanel({
  automation,
  config,
  collections,
  selectedSound,
  music,
  demoVideos,
  onCreateCollection,
  onConfigChange,
  onBack,
  onSave,
}: {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  demoVideos: LocalAsset[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onConfigChange: (config: AutomationSchema) => void
  onBack: () => void
  onSave: () => void
}) {
  const [exports, setExports] = useGeneratedVideoExports(
    "ugc_ad",
    "Failed to load AI UGC automation exports"
  )
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [selectedVideoTextIndex, setSelectedVideoTextIndex] = useState(0)
  const hooks = automationHooks(config)
  const selectedAvatarCollectionId = automationCollectionId(config, "content")
  const selectedAvatarCollection = findCollectionByIdOrAlias(
    collections,
    selectedAvatarCollectionId
  )
  const selectedDemoVideoId = config.image_collection_ids.video_demo_asset_id
  const activeDemoVideo =
    demoVideos.find((video) => video.id === selectedDemoVideoId) ??
    demoVideos[0] ??
    null
  const selectedAutomationSound =
    music.find(
      (sound) => sound.id === config.tiktok_post_settings.slideshow_sound_id
    ) ??
    (selectedSound?.id === config.tiktok_post_settings.slideshow_sound_id
      ? selectedSound
      : null)
  const previewVideo = selectedAvatarCollection?.images[0]
  const hookSection = automationFormatSection(config, "hook")
  const hookTextItems =
    hookSection.textItems.length > 0
      ? hookSection.textItems
      : [
          defaultAutomationTextItem({
            contentDirection: "hook overlay text for the generated video",
            fontSize: "8px",
            textItemWidth: "70%",
          }),
        ]
  const hookTextItem = hookTextItems[selectedVideoTextIndex] ?? hookTextItems[0]

  function updateDemoVideo(videoId: string) {
    onConfigChange({
      ...config,
      image_collection_ids: {
        ...config.image_collection_ids,
        video_demo_asset_id: videoId,
      },
    })
  }

  function updateAvatarCollection(collectionId: string) {
    onConfigChange(
      schemaWithAutomationCollectionId(config, "content", collectionId)
    )
  }

  function patchTikTokSettings(
    patch: Partial<AutomationSchema["tiktok_post_settings"]>
  ) {
    onConfigChange({
      ...config,
      tiktok_post_settings: {
        ...config.tiktok_post_settings,
        ...patch,
        publish_type: "video",
      },
    })
  }

  function updateSelectedSound(id: string, sound?: LocalAsset | null) {
    const selected = sound ?? music.find((item) => item.id === id) ?? null
    patchTikTokSettings({
      slideshow_sound_id: selected?.id ?? "",
      slideshow_sound_name: selected?.name ?? "",
      slideshow_sound_url: selected?.url ?? "",
    })
  }

  function updateVideoTextItem(patch: Partial<AutomationTextItem>) {
    const textIndex = selectedVideoTextIndex
    onConfigChange(
      updateAutomationFormatSection(config, "hook", {
        noText: false,
        textItems: hookTextItems.map((item, index) =>
          index === textIndex ? { ...item, ...patch } : item
        ),
      })
    )
  }

  function addVideoTextItem() {
    const nextTextItem = defaultAutomationTextItem({
      fontSize: "8px",
      textStyle: "whiteText",
      textItemWidth: "70%",
      contentDirection: "additional hook overlay text",
      textPosition: "center",
    })
    onConfigChange(
      updateAutomationFormatSection(config, "hook", {
        noText: false,
        textItems: [...hookTextItems, nextTextItem],
      })
    )
    setSelectedVideoTextIndex(hookTextItems.length)
  }

  function deleteSelectedVideoTextItem() {
    const nextTextItems = hookTextItems.filter(
      (_, index) => index !== selectedVideoTextIndex
    )
    onConfigChange(
      updateAutomationFormatSection(config, "hook", {
        textItems:
          nextTextItems.length > 0
            ? nextTextItems
            : [defaultAutomationTextItem()],
      })
    )
    setSelectedVideoTextIndex((index) => Math.max(0, index - 1))
  }

  async function createUgcAdAutomationExport() {
    const avatarVideoUrl = selectedAvatarCollection?.images[0]?.imageUrl ?? null
    if (!avatarVideoUrl) {
      setCreateError("Select an avatar video collection before creating an ad.")
      return
    }

    const hook = pickRandomHook(hooks, config.title || automation.name)
    const demoVideoUrl = activeDemoVideo?.url ?? null
    const textPlacement = textPlacementFromItem(hookTextItem)
    setCreating(true)
    setCreateError("")
    let exportRecord: GeneratedVideoExport | null = null

    try {
      exportRecord = await createGeneratedVideoExportRecord(
        {
          type: "ugc_ad",
          status: "processing",
          title: hook,
          caption: hook,
          sourceConfig: {
            automationId: automation.id,
            automationName: automation.name,
            hook,
            avatarCollectionId: selectedAvatarCollection?.id,
            avatarVideoUrl,
            demoVideoId: activeDemoVideo?.id,
            demoVideoUrl,
            sound: selectedAutomationSound,
            textPlacement,
            hookTextItems,
          },
        },
        "Failed to create AI UGC ad export"
      )
      setExports((current) => [
        exportRecord!,
        ...current.filter((item) => item.id !== exportRecord!.id),
      ])

      const renderedVideo = await renderAndUploadUgcAdVideo({
        hook,
        avatarVideoUrl,
        demoVideoUrl,
        soundUrl: selectedAutomationSound?.url,
        textPlacement,
        textItems: hookTextItems,
      })
      const updatedExport = await updateGeneratedVideoExportRecord(
        exportRecord.id,
        {
          status: "ready",
          previewUrl: renderedVideo.thumbnailUrl,
          videoUrl: renderedVideo.videoUrl,
        },
        "Failed to update AI UGC ad export"
      )
      setExports((current) =>
        current.map((item) =>
          item.id === updatedExport.id ? updatedExport : item
        )
      )
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to create AI UGC ad")
      setCreateError(message)
      if (exportRecord) {
        const failedExport = await updateGeneratedVideoExportRecord(
          exportRecord.id,
          {
            status: "failed",
            error: message,
          },
          "Failed to update AI UGC ad export"
        ).catch(() => null)

        if (failedExport) {
          setExports((current) =>
            current.map((item) =>
              item.id === failedExport.id ? failedExport : item
            )
          )
        }
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="grid min-h-svh bg-white md:grid-cols-[360px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-[#deddd5] bg-[#f7f7f3]">
        <div className="flex h-12 items-center justify-between border-b border-[#deddd5] px-3">
          <button
            className="inline-flex items-center gap-2 rounded-[6px] px-2 py-1 text-[13px] font-semibold text-[#56554f] hover:bg-white"
            onClick={onBack}
          >
            <IconChevronLeft className="size-4" />
            Back
          </button>
          <div className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#242421]">
            <IconVideo className="size-4" />
            Video automation
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <section className="rounded-[10px] border border-[#e3e2db] bg-white p-3 shadow-sm">
              <div className="mb-2 text-[14px] font-bold text-[#242421]">
                Avatar video collection
              </div>
              <CollectionSelector
                label="Avatar video collection"
                collection={selectedAvatarCollection}
                collections={collections.filter(
                  (collection) => collection.mediaType === "video"
                )}
                onChange={updateAvatarCollection}
                onCreateCollection={onCreateCollection}
              />
              <p className="mt-2 text-[12px] leading-4 font-medium text-[#77766f]">
                The runner picks an avatar/source video from this collection.
              </p>
            </section>

            <section className="rounded-[10px] border border-[#e3e2db] bg-white p-3 shadow-sm">
              <div className="mb-2 text-[14px] font-bold text-[#242421]">
                Demo video
              </div>
              <SelectControl
                value={activeDemoVideo?.id ?? ""}
                onChange={(event) => updateDemoVideo(event.target.value)}
              >
                {demoVideos.length === 0 ? (
                  <option value="">No demo videos in data/assets/demos</option>
                ) : (
                  demoVideos.map((video) => (
                    <option key={video.id} value={video.id}>
                      {video.name}
                    </option>
                  ))
                )}
              </SelectControl>
              <p className="mt-2 text-[12px] leading-4 font-medium text-[#77766f]">
                Pulled only from the demo videos folder. If selected, the
                rendered ad continues into this demo clip after the avatar
                intro.
              </p>
            </section>

            <section className="rounded-[10px] border border-[#e3e2db] bg-white p-3 shadow-sm">
              <div className="mb-2 text-[14px] font-bold text-[#242421]">
                Hook source
              </div>
              <div className="rounded-[8px] bg-[#f4f4ef] px-3 py-2 text-[13px] font-semibold text-[#3b3a36]">
                Random hook from Hooks tab
              </div>
              <p className="mt-2 text-[12px] leading-4 font-medium text-[#77766f]">
                {hooks.length > 0
                  ? `${hooks.length} hooks available.`
                  : "No hooks available yet."}
              </p>
            </section>

            <section className="rounded-[10px] border border-[#e3e2db] bg-white p-3 shadow-sm">
              <div className="mb-2 text-[14px] font-bold text-[#242421]">
                Music
              </div>
              <SoundSelector
                selectedSound={selectedAutomationSound}
                music={music}
                onSelect={updateSelectedSound}
                variant="settingsSound"
                emptyLabel={randomTikTokSoundLabel}
              />
              <p className="mt-2 text-[12px] leading-4 font-medium text-[#77766f]">
                Leave blank to use a random sound from the music list.
              </p>
            </section>

            <section className="rounded-[10px] border border-[#e3e2db] bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[14px] font-bold text-[#242421]">
                  Hook text elements
                </div>
                <span className="text-[12px] font-semibold text-[#77766f]">
                  {hookTextItems.length} total
                </span>
              </div>
              <div className="relative mx-auto mb-3 aspect-[9/16] max-h-[320px] overflow-hidden rounded-[14px] bg-[#20201e] shadow-sm ring-1 ring-black/15">
                {previewVideo ? (
                  <PinterestPreviewTile
                    image={previewVideo}
                    index={0}
                    className="h-full w-full"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-8 text-center text-[14px] font-semibold text-white/70">
                    Select an avatar video collection
                  </div>
                )}
                {hookTextItems.map((textItem, index) => (
                  <VideoAutomationPreviewText
                    key={textItem.id || index}
                    textItem={textItem}
                    text={
                      index === 0
                        ? hooks[0] || "random hook"
                        : textItem.contentDirection
                    }
                    active={selectedVideoTextIndex === index}
                    onClick={() => setSelectedVideoTextIndex(index)}
                  />
                ))}
              </div>
              <div className="relative">
                <AutomationFormatTextToolbar
                  mode="Hook"
                  textItem={hookTextItem}
                  updateTextItem={updateVideoTextItem}
                  onDelete={deleteSelectedVideoTextItem}
                  onAdd={addVideoTextItem}
                  layout="inline"
                />
              </div>
            </section>
          </div>
        </div>
        <div className="border-t border-[#deddd5] p-3">
          <Button
            variant="action"
            size="appDefault"
            className="w-full"
            onClick={onSave}
          >
            Save Changes
          </Button>
        </div>
      </aside>

      <main className="grid min-h-0 place-items-center overflow-y-auto bg-[#b9b9b6] p-8">
        <div className="w-full max-w-[360px]">
          <div className="mb-3 flex items-center justify-between text-[13px] font-bold text-[#55544f]">
            <span>{automation.name}</span>
            <span>{hooks.length} hooks</span>
          </div>
          <div className="relative mx-auto aspect-[9/16] max-h-[72vh] overflow-hidden rounded-[18px] bg-[#20201e] shadow-2xl ring-1 ring-black/20">
            {previewVideo ? (
              <PinterestPreviewTile
                image={previewVideo}
                index={0}
                className="h-full w-full"
              />
            ) : (
              <div className="grid h-full place-items-center px-8 text-center text-[14px] font-semibold text-white/70">
                Select an avatar video collection
              </div>
            )}
            {hookTextItems.map((textItem, index) => (
              <VideoAutomationPreviewText
                key={textItem.id || index}
                textItem={textItem}
                text={
                  index === 0
                    ? hooks[0] || "random hook"
                    : textItem.contentDirection
                }
                active={false}
              />
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <Button
              variant="action"
              size="appDefault"
              className="flex-1 justify-center"
              onClick={() => void createUgcAdAutomationExport()}
              disabled={creating || !previewVideo}
            >
              {creating ? "Creating..." : "Create UGC ad"}
            </Button>
          </div>
          {createError ? (
            <p className="mt-2 text-[12px] font-semibold text-[#d94444]">
              {createError}
            </p>
          ) : null}
          <GeneratedVideoExports
            title="Generated Videos"
            exports={exports}
            emptyMessage="No AI UGC ad exports yet."
            onDeleted={(id) =>
              setExports((current) => current.filter((item) => item.id !== id))
            }
          />
        </div>
      </main>
    </div>
  )
}

function textPlacementFromItem(
  textItem: Pick<AutomationTextItem, "textPosition">
): "top" | "middle" | "bottom" {
  if (textItem.textPosition === "top") {
    return "top"
  }
  if (textItem.textPosition === "bottom") {
    return "bottom"
  }
  return "middle"
}

function pickRandomHook(hooks: string[], fallback: string) {
  if (hooks.length === 0) {
    return fallback
  }
  return hooks[Math.floor(Math.random() * hooks.length)]
}

function VideoAutomationPreviewText({
  textItem,
  text,
  active,
  onClick,
}: {
  textItem: AutomationTextItem
  text: string
  active: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "absolute z-[2] rounded-[6px] px-2 py-1 text-center font-black text-white drop-shadow-[0_2px_1px_rgba(0,0,0,0.8)]",
        active && "outline outline-2 outline-[#4f91ff]"
      )}
      style={videoAutomationPreviewTextStyle(textItem)}
      onClick={onClick}
    >
      {text || "text element"}
    </button>
  )
}

function videoAutomationPreviewTextStyle(textItem: AutomationTextItem) {
  const top =
    textItem.textPosition === "bottom"
      ? "78%"
      : textItem.textPosition === "center"
        ? "46%"
        : "10%"
  const textAlign = textItem.textAlign || "center"
  const width = textItem.textItemWidth || "70%"
  const left =
    textAlign === "left" ? "10%" : textAlign === "right" ? "90%" : "50%"
  const transform =
    textAlign === "left"
      ? "translateY(-50%)"
      : textAlign === "right"
        ? "translate(-100%, -50%)"
        : "translate(-50%, -50%)"

  return {
    top,
    left,
    width,
    transform,
    fontSize: textItem.fontSize || "14px",
    textAlign,
    color: textItem.textStyle === "yellowText" ? "#fff176" : "#ffffff",
    backgroundColor:
      textItem.textStyle === "background" ? "#00000099" : "transparent",
    WebkitTextStroke:
      textItem.textStyle === "blackText" ? undefined : "0.5px rgba(0,0,0,0.85)",
  } satisfies CSSProperties
}

function AutomationContentFormatEditor({
  section,
  overlayCollection,
  collections,
  onCreateCollection,
  onOverlayImageChange,
  onOverlayCollectionChange,
  onOverlayPaddingChange,
  onDisplayTextChange,
  onSlideOverrideAdd,
  onSlideOverrideChange,
  onSlideOverrideRemove,
  onImageOverrideAdd,
  onImageOverrideChange,
  onImageOverrideRemove,
}: {
  section: AutomationFormatSection
  overlayCollection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onOverlayImageChange: (enabled: boolean) => void
  onOverlayCollectionChange: (collectionId: string) => void
  onOverlayPaddingChange: (padding: number) => void
  onDisplayTextChange: (enabled: boolean) => void
  onSlideOverrideAdd: () => void
  onSlideOverrideChange: (
    index: number,
    patch: Partial<AutomationSlideOverride>
  ) => void
  onSlideOverrideRemove: (index: number) => void
  onImageOverrideAdd: () => void
  onImageOverrideChange: (
    index: number,
    patch: Partial<AutomationImageOverride>
  ) => void
  onImageOverrideRemove: (index: number) => void
}) {
  const slideOverrides = section.slideOverrides ?? []
  const imageOverrides = section.imageOverrides ?? []

  return (
    <div className="space-y-3">
      <CtaDivider />
      <ContentOverlayImagePicker
        section={section}
        overlayCollection={overlayCollection}
        collections={collections}
        onCreateCollection={onCreateCollection}
        onOverlayImageChange={onOverlayImageChange}
        onOverlayCollectionChange={onOverlayCollectionChange}
      />
      {section.overlayImage?.enabled ? (
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-[#242421]">Padding</label>
          <label className="flex h-8 w-[74px] items-center rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#242421] shadow-sm">
            <input
              className="min-w-0 flex-1 bg-transparent text-right outline-none"
              type="number"
              min={0}
              max={100}
              value={section.overlayImage?.padding ?? 5}
              onChange={(event) =>
                onOverlayPaddingChange(Number(event.target.value) || 0)
              }
              aria-label="Overlay image padding"
            />
            <span className="ml-1 text-[#77766f]">%</span>
          </label>
        </div>
      ) : null}
      <CtaDivider />
      <CtaToggleRow
        icon={<Type className="size-3.5 text-[#999]" />}
        label="Display text"
        enabled={!section.noText}
        onClick={() => onDisplayTextChange(section.noText)}
      />
      <CtaDivider />
      <ContentOverrideHeader
        title="Slide overrides"
        onAdd={onSlideOverrideAdd}
      />
      <p className="text-[11px] leading-4 font-medium text-[#77766f]">
        Override content direction for a specific slide (e.g. soft-sell a
        product on slide 3).
      </p>
      {slideOverrides.map((override, index) => (
        <div
          key={`slide-override-${index}`}
          className="space-y-2 rounded-lg border border-[#ebeae3] bg-white p-2"
        >
          <div className="flex items-center gap-2">
            <label className="flex h-8 w-[76px] items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-2 text-[12px] font-semibold text-[#242421]">
              <span>#</span>
              <input
                className="min-w-0 flex-1 bg-transparent outline-none"
                type="number"
                min={1}
                value={override.slideIndex}
                onChange={(event) =>
                  onSlideOverrideChange(index, {
                    slideIndex: Number(event.target.value) || 1,
                  })
                }
                aria-label={`Slide override ${index + 1} slide index`}
              />
            </label>
            <button
              type="button"
              className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold text-[#e65656] hover:bg-red-50"
              onClick={() => onSlideOverrideRemove(index)}
            >
              Remove
            </button>
          </div>
          <textarea
            className="h-16 w-full resize-none rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-2.5 py-2 text-[12px] font-medium outline-none placeholder:text-[#AAA] focus:border-[#999]"
            value={override.contentDirection}
            onChange={(event) =>
              onSlideOverrideChange(index, {
                contentDirection: event.target.value,
              })
            }
            placeholder="e.g. soft-sell a product on this slide..."
          />
        </div>
      ))}
      <CtaDivider />
      <ContentOverrideHeader
        title="Image overrides"
        onAdd={onImageOverrideAdd}
      />
      <p className="text-[11px] leading-4 font-medium text-[#77766f]">
        Override the image collection for a specific slide (e.g. always use a
        specific image on slide 3).
      </p>
      {imageOverrides.map((override, index) => (
        <div
          key={`image-override-${index}`}
          className="space-y-2 rounded-lg border border-[#ebeae3] bg-white p-2"
        >
          <div className="flex items-center gap-2">
            <label className="flex h-8 w-[76px] items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-2 text-[12px] font-semibold text-[#242421]">
              <span>#</span>
              <input
                className="min-w-0 flex-1 bg-transparent outline-none"
                type="number"
                min={1}
                value={override.slideIndex}
                onChange={(event) =>
                  onImageOverrideChange(index, {
                    slideIndex: Number(event.target.value) || 1,
                  })
                }
                aria-label={`Image override ${index + 1} slide index`}
              />
            </label>
            <button
              type="button"
              className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold text-[#e65656] hover:bg-red-50"
              onClick={() => onImageOverrideRemove(index)}
            >
              Remove
            </button>
          </div>
          <CollectionSelector
            label="Override collection"
            collection={findCollectionByIdOrAlias(
              collections,
              override.collectionId
            )}
            collections={collections}
            showPictures={false}
            onChange={(collectionId) =>
              onImageOverrideChange(index, { collectionId })
            }
            onCreateCollection={onCreateCollection}
          />
        </div>
      ))}
    </div>
  )
}

function ContentOverlayImagePicker({
  section,
  overlayCollection,
  collections,
  onCreateCollection,
  onOverlayImageChange,
  onOverlayCollectionChange,
}: {
  section: AutomationFormatSection
  overlayCollection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onOverlayImageChange: (enabled: boolean) => void
  onOverlayCollectionChange: (collectionId: string) => void
}) {
  return (
    <div className="space-y-2">
      <CtaToggleRow
        icon={<Image className="size-3.5 text-[#999]" />}
        label="Overlay Image"
        enabled={Boolean(section.overlayImage?.enabled)}
        onClick={() => onOverlayImageChange(!section.overlayImage?.enabled)}
      />
      {section.overlayImage?.enabled ? (
        <CollectionSelector
          label="Overlay image"
          collection={overlayCollection}
          collections={collections}
          onChange={onOverlayCollectionChange}
          onCreateCollection={onCreateCollection}
        />
      ) : null}
    </div>
  )
}

function ContentOverrideHeader({
  title,
  onAdd,
}: {
  title: string
  onAdd: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[13px] font-semibold text-[#242421]">{title}</div>
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-blue-500 hover:bg-blue-50"
        onClick={onAdd}
      >
        <Plus className="size-3" />
        Add
      </button>
    </div>
  )
}

function AutomationCtaFormatEditor({
  config,
  section,
  collection,
  collections,
  onCreateCollection,
  onEnabledChange,
  onPlacementChange,
  onImageModeChange,
  onCollectionChange,
  onSingleImageChange,
  onSectionChange,
  onOverlayImageChange,
  onOverlayCollectionChange,
}: {
  config: AutomationSchema
  section: AutomationFormatSection
  collection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onEnabledChange: (enabled: boolean) => void
  onPlacementChange: (placement: "last" | "static") => void
  onImageModeChange: (mode: "collection" | "single_image") => void
  onCollectionChange: (collectionId: string) => void
  onSingleImageChange: (imageId: string) => void
  onSectionChange: (patch: Partial<AutomationFormatSection>) => void
  onOverlayImageChange: (enabled: boolean) => void
  onOverlayCollectionChange: (collectionId: string) => void
}) {
  const enabled = ctaEnabled(config, section)
  const imageMode =
    section.imageMode === "single_image" ? "single_image" : "collection"
  const placement =
    section.ctaLocation === "static" ||
    config.image_collection_ids.cta_slide.cta_location === "static"
      ? "static"
      : "last"
  const selectedImageId = config.image_collection_ids.cta_slide.image_id ?? ""
  const overlayCollection = findCollectionByIdOrAlias(
    collections,
    section.overlayImage?.collectionId ?? ""
  )

  return (
    <div className="space-y-3">
      <CtaToggleRow
        label="Enable CTA"
        enabled={enabled}
        onClick={() => onEnabledChange(!enabled)}
      />
      <CtaSelectRow
        icon={<MapPin className="size-3.5 text-[#999]" />}
        label="Slide Placement"
        value={placement === "last" ? "Last Slide" : "Static Position"}
        options={["Last Slide", "Static Position"]}
        onChange={(value) =>
          onPlacementChange(value === "Last Slide" ? "last" : "static")
        }
      />
      <CtaSelectRow
        icon={<Image className="size-3.5 text-[#999]" />}
        label="Collection or Image"
        value={imageMode === "single_image" ? "Single image" : "Collection"}
        options={["Collection", "Single image"]}
        onChange={(value) =>
          onImageModeChange(
            value === "Single image" ? "single_image" : "collection"
          )
        }
      />

      <div className="pt-1">
        {imageMode === "single_image" ? (
          <CtaSingleImagePicker
            collection={collection}
            collections={collections}
            selectedImageId={selectedImageId}
            onCollectionChange={onCollectionChange}
            onCreateCollection={onCreateCollection}
            onImageChange={onSingleImageChange}
          />
        ) : (
          <CollectionSelector
            label="CTA collection"
            collection={collection}
            collections={collections}
            onChange={onCollectionChange}
            onCreateCollection={onCreateCollection}
          />
        )}
      </div>

      <div className="space-y-2">
        <CtaSelectRow
          icon={<Expand className="size-3.5 text-[#999]" />}
          label="Aspect Ratio"
          value={aspectRatioLabel(section.aspect_ratio)}
          options={automationAspectRatios.map(aspectRatioLabel)}
          onChange={(value) =>
            onSectionChange({ aspect_ratio: labelToAspectRatio(value) })
          }
        />
        <CtaSelectRow
          icon={<Grid3X3 className="size-3.5 text-[#999]" />}
          label="Image Grid"
          value={imageGridLabel(section.imageGrid)}
          options={automationImageGrids.map(imageGridLabel)}
          onChange={(value) =>
            onSectionChange({ imageGrid: labelToImageGrid(value) })
          }
        />
      </div>

      <CtaDivider />
      <CtaToggleRow
        icon={<Blend className="size-3.5 text-[#999]" />}
        label="Overlay"
        enabled={section.overlay}
        onClick={() => onSectionChange({ overlay: !section.overlay })}
      />
      <CtaDivider />
      <CtaToggleRow
        icon={<Image className="size-3.5 text-[#999]" />}
        label="Overlay Image"
        enabled={Boolean(section.overlayImage?.enabled)}
        onClick={() => onOverlayImageChange(!section.overlayImage?.enabled)}
      />
      {section.overlayImage?.enabled ? (
        <CollectionSelector
          label="Overlay image"
          collection={overlayCollection}
          collections={collections}
          onChange={onOverlayCollectionChange}
          onCreateCollection={onCreateCollection}
        />
      ) : null}
      <CtaDivider />
      <CtaToggleRow
        icon={<Type className="size-3.5 text-[#999]" />}
        label="Display text"
        enabled={!section.noText}
        onClick={() => onSectionChange({ noText: !section.noText })}
      />
    </div>
  )
}

function CtaSelectRow({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: ReactNode
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </label>
      <SelectLike
        value={value}
        options={options}
        placement="bottom"
        onChange={onChange}
      />
    </div>
  )
}

function CtaToggleRow({
  icon,
  label,
  enabled,
  onClick,
}: {
  icon?: ReactNode
  label: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={cn(
          "inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent p-0.5 shadow-sm transition-colors",
          enabled ? "bg-[#388EFF]" : "bg-[#e5e7eb]"
        )}
        onClick={onClick}
      >
        <span
          className={cn(
            "block size-4 rounded-full bg-white shadow transition-transform",
            enabled && "translate-x-4"
          )}
        />
      </button>
    </div>
  )
}

function CtaSingleImagePicker({
  collection,
  collections,
  selectedImageId,
  onCollectionChange,
  onCreateCollection,
  onImageChange,
}: {
  collection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  selectedImageId: string
  onCollectionChange: (collectionId: string) => void
  onCreateCollection: (collection: CreatedImageCollection) => void
  onImageChange: (imageId: string) => void
}) {
  const images = collection?.images ?? []

  return (
    <div className="space-y-3">
      <CollectionSelector
        label="CTA image source"
        collection={collection}
        collections={collections}
        onChange={onCollectionChange}
        onCreateCollection={onCreateCollection}
      />
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {images.slice(0, 9).map((image, index) => (
            <button
              key={image.id || image.imageUrl}
              type="button"
              className={cn(
                "aspect-square overflow-hidden rounded-lg bg-[#deddd8] ring-offset-2",
                selectedImageId === image.id
                  ? "ring-2 ring-app-action"
                  : "ring-1 ring-[#e1e0d8]"
              )}
              onClick={() => onImageChange(image.id || image.imageUrl)}
              aria-label={`Select CTA image ${index + 1}`}
            >
              <PinterestPreviewTile
                image={image}
                index={index}
                className="h-full rounded-none"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="w-full rounded-xl border border-dashed border-[#CCC] bg-[#FAFAFA] px-3 py-5 text-center text-[12px] font-medium text-[#999]">
          <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-lg bg-[#EEE]">
            <Layers className="size-4" />
          </div>
          Select CTA collection
        </div>
      )}
    </div>
  )
}

function CtaDivider() {
  return <hr className="border-t border-[#E5E7EB]" />
}

function AutomationFormatPreviewCard({
  item,
  index,
  active,
  slotWidth,
  selectedText,
  onSelect,
  onSelectText,
}: {
  item: AutomationFormatPreviewItem
  index: number
  active: boolean
  slotWidth: number
  selectedText: boolean
  onSelect: () => void
  onSelectText: () => void
}) {
  const size = formatPreviewCardSize(item.section.aspect_ratio, item.image)
  const slide = previewSlideshowSlide(item, index)
  const overlayUrl = slide.overlayImage?.image_url
  const previewSvg = item.image
    ? renderedSlideSvg(slide, item.image.imageUrl, overlayUrl)
    : ""

  return (
    <div
      className={cn(
        "shrink-0 cursor-pointer transition-opacity duration-300",
        active ? "opacity-100" : "opacity-65"
      )}
      style={{ width: slotWidth }}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onSelect()
        }
      }}
    >
      <div className="mb-2 text-left text-[12px] font-bold text-[#77766f]">
        {item.label}
      </div>
      <div
        className="relative mx-auto overflow-hidden rounded-[2px] bg-black shadow-sm transition-[width,height]"
        style={{
          width: size.width,
          height: size.height,
          aspectRatio: formatAspectRatioCss(
            item.section.aspect_ratio,
            item.image
          ),
        }}
      >
        {item.image ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: previewSvg }}
          />
        ) : (
          <FormatEmptyCollectionTile />
        )}
        {!item.section.noText && item.text && (
          <button
            className={cn(
              "absolute inset-0 cursor-text bg-transparent text-transparent",
              selectedText && "outline outline-2 outline-[#4f91ff]"
            )}
            onClick={(event) => {
              event.stopPropagation()
              onSelectText()
            }}
            aria-label="Edit text element"
          />
        )}
        {selectedText && (
          <div className="absolute top-[58%] left-1/2 -translate-x-1/2 rounded-[4px] bg-white px-2 py-1 text-[11px] font-semibold text-[#242421] shadow-sm">
            Editing Text
          </div>
        )}
      </div>
    </div>
  )
}

function previewSlideshowSlide(
  item: AutomationFormatPreviewItem,
  index: number
): SlideshowSlide {
  const overlayImage =
    item.section.overlayImage?.enabled && item.overlayImages.length > 0
      ? item.overlayImages[index % item.overlayImages.length]
      : undefined

  return {
    id: item.id,
    image_url: item.image?.imageUrl ?? "",
    overlayImage: overlayImage
      ? {
          image_url: overlayImage.imageUrl,
          padding: item.section.overlayImage?.padding ?? 5,
        }
      : undefined,
    aspect_ratio: item.section.aspect_ratio || "9:16",
    time_length_ms: 3000,
    textItems: previewSlideshowTextItems(item),
  }
}

function previewSlideshowTextItems(
  item: AutomationFormatPreviewItem
): SlideshowTextItem[] {
  if (item.section.noText || !item.text) {
    return []
  }

  return [
    {
      id: item.textItem.id || `${item.id}-text`,
      text: item.text,
      font: item.textItem.font || "TikTok Display Medium",
      fontSize: item.textItem.fontSize || "10px",
      textSize: {
        width: previewTextItemWidth(item.textItem.textItemWidth, item.text),
        height: 18,
      },
      textStyle: item.textItem.textStyle || "outline",
      textAlign: item.textItem.textAlign || "center",
      textAnchor: item.textItem.textAnchor || "padded",
      textPosition: previewTextItemPosition(
        item.textItem,
        item.role === "hook"
      ),
    },
  ]
}

function previewTextItemPosition(
  textItem: AutomationTextItem | undefined,
  preferTop: boolean
) {
  const y =
    textItem?.textPosition === "bottom"
      ? 82
      : textItem?.textPosition === "center" && !preferTop
        ? 45
        : 16
  const x =
    textItem?.textAlign === "left"
      ? 28
      : textItem?.textAlign === "right"
        ? 72
        : 50
  return { x, y }
}

function previewTextItemWidth(value: string | undefined, text: string) {
  const parsed = Number(value?.replace("%", ""))
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return Math.max(20, Math.min(100, text.length * 4))
}

type AutomationFormatRole = "hook" | "content" | "cta"

type AutomationFormatPreviewItem = {
  id: string
  role: AutomationFormatRole
  tab: "Hook" | "Content" | "CTA"
  label: string
  section: AutomationFormatSection
  image?: PinterestSearchResult
  images: PinterestSearchResult[]
  overlayImages: PinterestSearchResult[]
  text: string
  textItem: AutomationTextItem
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
}

function clampSlideIndex(value: number) {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1))
}

function ctaEnabled(
  config: AutomationSchema,
  section: AutomationFormatSection
) {
  return (
    Boolean(config.image_collection_ids.cta_slide.check) ||
    section.slideCount > 0
  )
}

function buildFormatPreviewItems(
  config: AutomationSchema,
  collections: CreatedImageCollection[]
): AutomationFormatPreviewItem[] {
  const hookImages = formatCollectionImages(config, collections, "hook")
  const contentImages = formatCollectionImages(config, collections, "content")
  const ctaImages = formatCollectionImages(config, collections, "cta")
  const content = automationFormatSection(config, "content")
  const cta = automationFormatSection(config, "cta")
  const contentOverlayImages = formatOverlayCollectionImages(
    content,
    collections
  )
  const ctaOverlayImages = formatOverlayCollectionImages(cta, collections)
  const contentCount = content.slideCount
  const items: AutomationFormatPreviewItem[] = [
    formatPreviewItem({
      config,
      role: "hook",
      tab: "Hook",
      label: "Hook",
      index: 0,
      images: hookImages,
      overlayImages: [],
    }),
  ]

  for (
    let index = 0;
    index < Math.max(1, Math.min(20, contentCount));
    index += 1
  ) {
    const slideImages =
      formatContentImageOverrideImages(content, collections, index + 1) ??
      contentImages
    items.push(
      formatPreviewItem({
        config,
        role: "content",
        tab: "Content",
        label: `Content ${index + 1}`,
        index,
        images: slideImages,
        overlayImages: contentOverlayImages,
      })
    )
  }

  if (ctaEnabled(config, cta)) {
    items.push(
      formatPreviewItem({
        config,
        role: "cta",
        tab: "CTA",
        label: "CTA",
        index: 0,
        images: ctaImages,
        overlayImages: ctaOverlayImages,
      })
    )
  }

  return items
}

function formatPreviewItem({
  config,
  role,
  tab,
  label,
  index,
  images,
  overlayImages,
}: {
  config: AutomationSchema
  role: AutomationFormatRole
  tab: "Hook" | "Content" | "CTA"
  label: string
  index: number
  images: PinterestSearchResult[]
  overlayImages: PinterestSearchResult[]
}): AutomationFormatPreviewItem {
  const section = automationFormatSection(config, role)
  const textItems =
    section.textItems.length > 0
      ? section.textItems
      : [defaultAutomationTextItem()]
  const textItem =
    textItems[index % textItems.length] ?? defaultAutomationTextItem()
  const image = images[index % Math.max(1, images.length)]

  return {
    id: `${role}-${index}-${section.aspect_ratio}-${section.imageGrid}-${section.overlay}-${section.overlayImage?.enabled}-${section.noText}`,
    role,
    tab,
    label,
    section,
    image,
    images,
    overlayImages,
    text: formatPreviewText(config, role, index),
    textItem,
  }
}

function FormatEmptyCollectionTile() {
  return (
    <div className="grid h-full place-items-center bg-[#deddd8] px-2 text-center text-[10px] font-semibold tracking-[0.04em] text-[#77766f] uppercase">
      Select collection
    </div>
  )
}

function formatPreviewCardSize(
  aspectRatio: AutomationAspectRatio,
  image?: PinterestSearchResult
) {
  const [widthRatio, heightRatio] = formatAspectRatioNumbers(aspectRatio, image)
  const ratio = widthRatio / heightRatio
  const maxWidth = 148
  const maxHeight = 250

  if (ratio >= 1) {
    return {
      width: maxWidth,
      height: Math.round(maxWidth / ratio),
    }
  }

  return {
    width: Math.max(92, Math.round(maxHeight * ratio)),
    height: maxHeight,
  }
}

function formatAspectRatioCss(
  aspectRatio: AutomationAspectRatio,
  image?: PinterestSearchResult
) {
  const [width, height] = formatAspectRatioNumbers(aspectRatio, image)
  return `${width} / ${height}`
}

function formatAspectRatioNumbers(
  aspectRatio: AutomationAspectRatio,
  image?: PinterestSearchResult
): [number, number] {
  if (aspectRatio === "fit") {
    return image?.width && image?.height ? [image.width, image.height] : [3, 4]
  }

  const [width, height] = aspectRatio.split(":").map(Number)
  return width && height ? [width, height] : [3, 4]
}

function formatCollection(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  role: "hook" | "content" | "cta"
) {
  const collectionId = automationCollectionId(config, role)
  return findCollectionByIdOrAlias(collections, collectionId)
}

function formatCollectionImages(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  role: "hook" | "content" | "cta"
) {
  const collectionImages =
    formatCollection(config, collections, role)?.images ?? []
  if (role !== "cta") {
    return collectionImages
  }

  const cta = automationFormatSection(config, "cta")
  const selectedImageId = config.image_collection_ids.cta_slide.image_id
  if (cta.imageMode !== "single_image" || !selectedImageId) {
    return collectionImages
  }

  const selectedImage = collectionImages.find(
    (image) =>
      image.id === selectedImageId || image.imageUrl === selectedImageId
  )
  return selectedImage ? [selectedImage] : collectionImages
}

function formatContentImageOverrideImages(
  section: AutomationFormatSection,
  collections: CreatedImageCollection[],
  slideIndex: number
) {
  const override = section.imageOverrides?.find(
    (item) => item.slideIndex === slideIndex
  )
  if (!override?.collectionId) {
    return null
  }
  const images =
    findCollectionByIdOrAlias(collections, override.collectionId)?.images ?? []
  return images.length > 0 ? images : null
}

function formatOverlayCollectionImages(
  section: AutomationFormatSection,
  collections: CreatedImageCollection[]
) {
  return section.overlayImage?.enabled
    ? (findCollectionByIdOrAlias(
        collections,
        section.overlayImage.collectionId ?? ""
      )?.images ?? [])
    : []
}

function formatPreviewText(
  config: AutomationSchema,
  role: "hook" | "content" | "cta",
  index: number
) {
  const section = automationFormatSection(config, role)
  const textItems =
    section.textItems.length > 0
      ? section.textItems
      : [defaultAutomationTextItem()]
  const textItem = textItems[index % textItems.length]

  return previewTextForTextItem(textItem)
}

function AutomationFormatTextToolbar({
  mode,
  textItem,
  updateTextItem,
  onDelete,
  onAdd,
  layout = "floating",
}: {
  mode: "Hook" | "Content" | "CTA"
  textItem: AutomationTextItem
  updateTextItem: (patch: Partial<AutomationTextItem>) => void
  onDelete: () => void
  onAdd: () => void
  layout?: "floating" | "inline"
}) {
  return (
    <div
      className={cn(
        "flex-shrink-0 space-y-2.5 rounded-xl border-t border-[#E5E7EB] bg-[#F5F5F5] px-4 py-3 shadow-lg",
        layout === "floating"
          ? "absolute right-0 bottom-0 left-0 mx-4 mb-4"
          : "relative shadow-sm"
      )}
    >
      <div className="space-y-2.5">
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <CompactTextSelect
              label="Font"
              value={fontLabel(textItem.font)}
              options={automationFontLabels}
              onChange={(value) => updateTextItem({ font: labelToFont(value) })}
            />
            <CompactTextSelect
              label="Style"
              value={textStyleLabel(textItem.textStyle)}
              options={automationTextStyleLabels}
              onChange={(value) =>
                updateTextItem({ textStyle: labelToTextStyle(value) })
              }
            />
            <CompactTextSelect
              label="Size"
              value={textItem.fontSize || "8px"}
              options={automationFontSizes}
              onChange={(value) => updateTextItem({ fontSize: value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CompactTextSelect
              label="Position"
              value={textPositionLabel(textItem.textPosition)}
              options={automationTextPositionLabels}
              icon={<MapPin className="size-3.5" />}
              onChange={(value) =>
                updateTextItem({ textPosition: labelToTextPosition(value) })
              }
            />
            <CompactTextSelect
              label="Width"
              value={textItem.textItemWidth || "60%"}
              options={automationTextWidths}
              onChange={(value) => updateTextItem({ textItemWidth: value })}
            />
          </div>
          <div className="flex items-start gap-2">
            <CompactTextSelect
              label="Word length"
              value={wordLengthLabel(textItem.wordLengthMin)}
              options={automationWordLengths.map(wordLengthLabel)}
              onChange={(value) =>
                updateTextItem({ wordLengthMin: labelToWordLength(value) })
              }
            />
            <CompactTextSelect
              label="Alignment"
              value={alignmentLabel(textItem.textAlign)}
              options={automationAlignments.map(alignmentLabel)}
              icon={alignmentIcon(textItem.textAlign)}
              onChange={(value) =>
                updateTextItem({ textAlign: labelToAlignment(value) })
              }
            />
          </div>
          <div className="flex gap-2">
            <CompactTextSelect
              label="Top/Bottom Padding"
              value={anchorLabel(textItem.textAnchor ?? "padded")}
              options={automationAnchors.map(anchorLabel)}
              icon={<MapPin className="size-3.5" />}
              onChange={(value) =>
                updateTextItem({ textAnchor: labelToAnchor(value) })
              }
            />
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[#242421]">
              Content direction
            </span>
            <textarea
              rows={2}
              className="w-full resize-none rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-medium outline-none placeholder:text-[#CCC] focus:border-[#999]"
              value={textItem.contentDirection ?? ""}
              onChange={(event) =>
                updateTextItem({ contentDirection: event.target.value })
              }
              placeholder={
                mode === "CTA"
                  ? "e.g. a short call to action..."
                  : "e.g. A bold hook about..."
              }
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <button
            className="flex items-center gap-1 rounded-md p-1.5 text-xs font-medium text-blue-500 transition-colors hover:bg-blue-50"
            onClick={onAdd}
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            Add text
          </button>
          <button
            className="rounded-md p-1.5 text-xs font-medium text-[#e65656] transition-colors hover:bg-red-50"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

const automationFontLabels = [
  "Default",
  "TikTok Display Medium",
  "Inter",
  "Arial",
]
const automationFontSizes = ["8px", "10px", "12px", "14px", "16px", "18px"]
const automationTextStyleOptions = [
  { label: "White Text", value: "whiteText" },
  { label: "Yellow Text", value: "yellowText" },
  { label: "Black Text", value: "blackText" },
  { label: "Background", value: "background" },
  { label: "Outline", value: "outline" },
]
const automationTextStyleLabels = automationTextStyleOptions.map(
  (option) => option.label
)
const automationTextPositions: AutomationTextItem["textPosition"][] = [
  "top",
  "center",
  "bottom",
]
const automationTextPositionLabels =
  automationTextPositions.map(textPositionLabel)
const automationTextWidths = ["40%", "50%", "60%", "70%", "80%", "90%", "100%"]

function fontLabel(value: string) {
  return value && value !== "TikTok Display Medium" ? value : "Default"
}

function labelToFont(value: string) {
  return value === "Default" ? "TikTok Display Medium" : value
}

function textStyleLabel(value: string) {
  return (
    automationTextStyleOptions.find((option) => option.value === value)
      ?.label ?? "White Text"
  )
}

function labelToTextStyle(value: string) {
  return (
    automationTextStyleOptions.find((option) => option.label === value)
      ?.value ?? "whiteText"
  )
}

function textPositionLabel(value: AutomationTextItem["textPosition"]) {
  return value[0].toUpperCase() + value.slice(1)
}

function labelToTextPosition(
  value: string
): AutomationTextItem["textPosition"] {
  const normalized = value.toLowerCase()
  return normalized === "top" || normalized === "bottom" ? normalized : "center"
}

function CompactTextSelect({
  label,
  value,
  options,
  icon,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  icon?: ReactNode
  onChange: (value: string) => void
}) {
  return (
    <label className="flex-1 space-y-1">
      <span className="block text-xs font-medium text-[#242421]">{label}</span>
      <span className="flex items-center gap-2">
        {icon && <span className="shrink-0 text-[#242421]">{icon}</span>}
        <span className="min-w-0 flex-1">
          <SelectLike
            value={value}
            options={options}
            onChange={onChange}
            placement="bottom"
          />
        </span>
      </span>
    </label>
  )
}

function alignmentIcon(alignment: AutomationTextItem["textAlign"]) {
  switch (alignment) {
    case "left":
      return <AlignLeft className="size-3.5" />
    case "right":
      return <AlignRight className="size-3.5" />
    default:
      return <AlignCenter className="size-3.5" />
  }
}

const socialMediaSettingTabs: {
  provider: PostFastSocialProvider
  label: string
  icon: Icon
  summary: string
}[] = [
  {
    provider: "tiktok",
    label: "TikTok",
    icon: IconBrandTiktok,
    summary: "Video or photo slideshow posts.",
  },
  {
    provider: "youtube",
    label: "YouTube",
    icon: IconBrandYoutubeFilled,
    summary: "Exported slideshow videos. Shorts is always enabled.",
  },
  {
    provider: "instagram",
    label: "Instagram",
    icon: IconBrandInstagram,
    summary: "Timeline for slideshows, Reels for exported videos.",
  },
  {
    provider: "facebook",
    label: "Facebook",
    icon: IconBrandFacebookFilled,
    summary: "Feed posts for slideshows, Reels for exported videos.",
  },
  {
    provider: "x",
    label: "X",
    icon: IconBrandX,
    summary: "Text, image, carousel, and video posts.",
  },
  {
    provider: "linkedin",
    label: "LinkedIn",
    icon: IconBrandLinkedin,
    summary: "Text, image carousel, and video posts.",
  },
  {
    provider: "pinterest",
    label: "Pinterest",
    icon: IconBrandPinterest,
    summary: "Image, carousel, and video pins.",
  },
  {
    provider: "threads",
    label: "Threads",
    icon: IconBrandThreads,
    summary: "Text, image carousel, and video posts.",
  },
  {
    provider: "telegram",
    label: "Telegram",
    icon: IconBrandTelegram,
    summary: "Text, images, videos, and mixed media groups.",
  },
  {
    provider: "bluesky",
    label: "Bluesky",
    icon: IconBrandBluesky,
    summary: "Text and image posts.",
  },
]

function SocialMediaSettingsPanel({
  config,
  onEditSocialAccounts,
  onConfigChange,
  onCancel,
  onSave,
}: {
  config: AutomationSchema
  onEditSocialAccounts: () => void
  onConfigChange: (config: AutomationSchema) => void
  onCancel: () => void
  onSave: () => void
}) {
  const [activeProvider, setActiveProvider] =
    useState<PostFastSocialProvider>("tiktok")
  const activeTab =
    socialMediaSettingTabs.find((tab) => tab.provider === activeProvider) ??
    socialMediaSettingTabs[0]
  const ActiveIcon = activeTab.icon
  const activeSettings = socialSettingsForProvider(config, activeProvider)

  function updateTikTokPostSettings(
    patch: Partial<AutomationSchema["tiktok_post_settings"]>
  ) {
    const nextTikTokSettings = {
      ...config.tiktok_post_settings,
      ...patch,
    }
    onConfigChange({
      ...config,
      tiktok_post_settings: nextTikTokSettings,
      social_post_settings: {
        ...config.social_post_settings,
        tiktok: defaultPostFastProviderControls("tiktok", {
          ...socialSettingsForProvider(config, "tiktok"),
          ...tiktokControlsFromPostSettings(nextTikTokSettings),
        }),
      },
    })
  }

  function updateSocialSettings(
    provider: PostFastSocialProvider,
    patch: PostFastProviderControls
  ) {
    onConfigChange({
      ...config,
      social_post_settings: {
        ...config.social_post_settings,
        [provider]: defaultPostFastProviderControls(provider, {
          ...socialSettingsForProvider(config, provider),
          ...patch,
          ...fixedSocialSettingsForProvider(config, provider),
        }),
      },
    })
  }

  function updateProviderPublishAs(
    provider: AutomationSocialProvider,
    publishAs: TikTokPublishType
  ) {
    const nextPublishAs = {
      ...config.social_publish_as,
      [provider]: publishAs,
    }
    onConfigChange({
      ...config,
      social_publish_as: nextPublishAs,
      social_post_settings: {
        ...config.social_post_settings,
        [provider]: defaultPostFastProviderControls(provider, {
          ...socialSettingsForProvider(config, provider),
          ...fixedSocialSettingsForProvider(
            { ...config, social_publish_as: nextPublishAs },
            provider
          ),
        }),
      },
    })
  }

  const selectedProviderCount = config.social_integrations.filter(
    (integration) => socialProviderMatches(activeProvider, integration.provider)
  ).length
  const slideshowSocialIntegrations = config.social_integrations.filter(
    (integration) => isSlideshowSocialProvider(integration.provider)
  )

  return (
    <SettingsPage
      title="Social Media Settings"
      description="Configure platform-specific PostFast options for this automation."
    >
      <div className="space-y-5">
        <div className="rounded-[8px] border border-app-panel-border bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-bold text-[#242421]">
                Social destinations
              </div>
              <div className="mt-1 text-[13px] font-semibold text-app-muted-text">
                {slideshowSocialIntegrations.length > 0
                  ? `${slideshowSocialIntegrations.length} account${slideshowSocialIntegrations.length === 1 ? "" : "s"} selected`
                  : "No social accounts selected"}
              </div>
            </div>
            <Button
              type="button"
              variant="softControl"
              size="appDefault"
              onClick={onEditSocialAccounts}
            >
              {slideshowSocialIntegrations.length > 0
                ? "Edit accounts"
                : "Add accounts"}
            </Button>
          </div>
        </div>

        <SettingsRow
          title="Auto-post automation"
          description="Publish automatically when a scheduled slideshow is ready."
          control={
            <SwitchPillButton
              enabled={config.tiktok_post_settings.auto_post}
              onClick={() =>
                updateTikTokPostSettings({
                  auto_post: !config.tiktok_post_settings.auto_post,
                })
              }
            />
          }
        />

        <div className="rounded-[10px] border border-[#ecebe4] bg-[#f7f7f3] p-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            {socialMediaSettingTabs.map((tab) => {
              const Icon = tab.icon
              const selected = tab.provider === activeProvider
              return (
                <button
                  key={tab.provider}
                  type="button"
                  title={tab.label}
                  aria-label={tab.label}
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-full border transition",
                    selected
                      ? "border-[#242421] bg-white text-[#242421] shadow-sm"
                      : "border-transparent bg-[#ecebe4] text-[#77766f] hover:bg-white"
                  )}
                  onClick={() => setActiveProvider(tab.provider)}
                  aria-pressed={selected}
                >
                  <Icon className="size-5" />
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-[8px] border border-app-panel-border bg-white p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[17px] font-bold text-[#242421]">
                <ActiveIcon className="size-5" />
                {activeTab.label}
              </div>
              <p className="mt-1 text-[13px] leading-5 font-semibold text-app-muted-text">
                {activeTab.summary}
              </p>
            </div>
            <span className="rounded-full bg-[#f1f0eb] px-3 py-1 text-[12px] font-bold text-[#62615b]">
              {selectedProviderCount} selected
            </span>
          </div>
          <SocialPlatformSettingsFields
            provider={activeProvider}
            settings={activeSettings}
            config={config}
            selectedIntegrations={config.social_integrations.filter(
              (integration) =>
                socialProviderMatches(activeProvider, integration.provider)
            )}
            onTikTokPostSettingsChange={updateTikTokPostSettings}
            onSocialSettingsChange={(patch) =>
              updateSocialSettings(activeProvider, patch)
            }
            onPublishAsChange={(publishAs) =>
              updateProviderPublishAs(activeProvider, publishAs)
            }
          />
        </div>
      </div>
      <SettingsFooter
        saveLabel="Save Settings"
        onCancel={onCancel}
        onSave={onSave}
      />
    </SettingsPage>
  )
}

function SocialPlatformSettingsFields({
  provider,
  settings,
  config,
  selectedIntegrations,
  onTikTokPostSettingsChange,
  onSocialSettingsChange,
  onPublishAsChange,
}: {
  provider: PostFastSocialProvider
  settings: PostFastProviderControls
  config: AutomationSchema
  selectedIntegrations: AutomationSocialIntegration[]
  onTikTokPostSettingsChange: (
    patch: Partial<AutomationSchema["tiktok_post_settings"]>
  ) => void
  onSocialSettingsChange: (patch: PostFastProviderControls) => void
  onPublishAsChange: (publishAs: TikTokPublishType) => void
}) {
  const publishAsControl = (
    <PublishAsSettingsRow
      provider={provider}
      config={config}
      onChange={onPublishAsChange}
    />
  )

  if (provider === "tiktok") {
    return (
      <div className="space-y-5">
        {publishAsControl}
        <SettingsRow
          title="Post as draft"
          description="Send to TikTok as a draft so you can publish from the TikTok app."
          control={
            <SwitchPillButton
              enabled={config.tiktok_post_settings.post_mode === "MEDIA_UPLOAD"}
              onClick={() => {
                onTikTokPostSettingsChange({
                  post_mode:
                    config.tiktok_post_settings.post_mode === "MEDIA_UPLOAD"
                      ? "DIRECT_POST"
                      : "MEDIA_UPLOAD",
                })
              }}
            />
          }
        />
        <SettingsRow
          title="Auto-music"
          description="Let TikTok pick music for the post."
          control={
            <SwitchPillButton
              enabled={config.tiktok_post_settings.auto_music}
              onClick={() =>
                onTikTokPostSettingsChange({
                  auto_music: !config.tiktok_post_settings.auto_music,
                })
              }
            />
          }
        />
        <div className="grid gap-4 md:grid-cols-2">
          <SettingsToggle
            title="Allow comments"
            enabled={config.tiktok_post_settings.allow_comments}
            onClick={() =>
              onTikTokPostSettingsChange({
                allow_comments: !config.tiktok_post_settings.allow_comments,
              })
            }
          />
          <SettingsToggle
            title="Allow duet"
            enabled={config.tiktok_post_settings.allow_duet}
            onClick={() =>
              onTikTokPostSettingsChange({
                allow_duet: !config.tiktok_post_settings.allow_duet,
              })
            }
          />
          <SettingsToggle
            title="Allow stitch"
            enabled={config.tiktok_post_settings.allow_stitch}
            onClick={() =>
              onTikTokPostSettingsChange({
                allow_stitch: !config.tiktok_post_settings.allow_stitch,
              })
            }
          />
          <SettingsToggle
            title="AI-generated content"
            enabled={config.tiktok_post_settings.disclose_video_content}
            onClick={() =>
              onTikTokPostSettingsChange({
                disclose_video_content:
                  !config.tiktok_post_settings.disclose_video_content,
              })
            }
          />
          <SettingsSelect
            title="Brand disclosure"
            value={brandDisclosureLabel(
              brandDisclosureValue(config.tiktok_post_settings)
            )}
            options={["None", "Brand organic", "Branded content"]}
            onChange={(value) =>
              onTikTokPostSettingsChange(
                brandDisclosurePatch(brandDisclosureValueFromLabel(value))
              )
            }
          />
        </div>
      </div>
    )
  }

  if (provider === "youtube") {
    return (
      <div className="space-y-5">
        <SettingsSelect
          title="Privacy"
          value={settingString(settings.youtubePrivacy, "PUBLIC")}
          options={["PUBLIC", "UNLISTED", "PRIVATE"]}
          onChange={(value) =>
            onSocialSettingsChange({
              youtubePrivacy: youtubePrivacyValue(value),
            })
          }
        />
        <SettingsTextInput
          title="Tags"
          description="Separate tags with commas."
          value={settingStringArray(settings.youtubeTags).join(", ")}
          placeholder="ugc, slideshow, shorts"
          onChange={(value) =>
            onSocialSettingsChange({
              youtubeTags: value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    )
  }

  if (provider === "linkedin") {
    return (
      <div className="space-y-5">
        {publishAsControl}
        <SettingsSelect
          title="Visibility"
          value={settingString(settings.linkedinVisibility, "PUBLIC")}
          options={["PUBLIC", "CONNECTIONS"]}
          onChange={(value) =>
            onSocialSettingsChange({
              linkedinVisibility: linkedinVisibilityValue(value),
            })
          }
        />
      </div>
    )
  }

  if (provider === "pinterest") {
    return (
      <div className="space-y-5">
        {publishAsControl}
        <SettingsTextInput
          title="Board ID"
          value={settingString(settings.pinterestBoardId)}
          placeholder="Required Pinterest board id"
          onChange={(value) =>
            onSocialSettingsChange({ pinterestBoardId: value })
          }
        />
        <SettingsTextInput
          title="Destination link"
          value={settingString(settings.pinterestLink)}
          placeholder="https://example.com"
          onChange={(value) => onSocialSettingsChange({ pinterestLink: value })}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {publishAsControl}
      <SelectedPlatformAccounts integrations={selectedIntegrations} />
    </div>
  )
}

function PublishAsSettingsRow({
  provider,
  config,
  onChange,
}: {
  provider: PostFastSocialProvider
  config: AutomationSchema
  onChange: (publishAs: TikTokPublishType) => void
}) {
  if (!canPublishSlideshowAsVideo(provider)) {
    return null
  }

  const exportAsVideo = automationPublishType(config) === "video"
  const publishAs = exportAsVideo
    ? automationProviderPublishAs(config, provider)
    : "slideshow"

  return (
    <SettingsRow
      title="Publish as"
      description={
        exportAsVideo
          ? "Slideshow is the default. Choose video only when this platform should use the exported video."
          : 'Enable "Export as video" in Settings to publish as video'
      }
      control={
        <SelectControl
          value={publishAs}
          onChange={(event) =>
            onChange(
              event.target.value === "video" && exportAsVideo
                ? "video"
                : "slideshow"
            )
          }
        >
          <option value="slideshow">Slideshow</option>
          <option value="video" disabled={!exportAsVideo}>
            Video
          </option>
        </SelectControl>
      }
    />
  )
}

function SelectedPlatformAccounts({
  integrations,
}: {
  integrations: AutomationSocialIntegration[]
}) {
  return (
    <div className="rounded-[8px] border border-dashed border-[#d8d7cf] bg-[#fbfbf7] p-5">
      <div className="text-[14px] font-bold text-[#242421]">
        Selected accounts
      </div>
      {integrations.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {integrations.map((integration) => (
            <div
              key={`${integration.provider}:${integration.integration_id}`}
              className="flex items-center justify-between gap-3 rounded-[8px] border border-[#e4e2d8] bg-white px-3 py-2"
            >
              <span className="truncate text-[13px] font-semibold text-[#242421]">
                {integration.name}
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-[#77766f]">
                {integration.profile
                  ? `@${integration.profile.replace(/^@/, "")}`
                  : "connected"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[13px] font-semibold text-[#77766f]">
          No accounts added for this platform.
        </div>
      )}
    </div>
  )
}

function socialProviderMatches(
  activeProvider: PostFastSocialProvider,
  integrationProvider: PostFastSocialProvider
) {
  if (activeProvider === "x") {
    return integrationProvider === "x" || integrationProvider === "twitter"
  }
  return integrationProvider === activeProvider
}

function SettingsToggle({
  title,
  description,
  enabled,
  onClick,
}: {
  title: string
  description?: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <SettingsRow
      title={title}
      description={description}
      control={<SwitchPillButton enabled={enabled} onClick={onClick} />}
    />
  )
}

function SettingsSelect({
  title,
  value,
  options,
  onChange,
}: {
  title: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <SettingsRow
      title={title}
      control={
        <SelectControl
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectControl>
      }
    />
  )
}

function SettingsTextInput({
  title,
  description,
  value,
  placeholder,
  onChange,
}: {
  title: string
  description?: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <SettingsRow
      title={title}
      description={description}
      control={
        <input
          className="h-11 min-w-[240px] rounded-[8px] border border-[#d8d7cf] bg-white px-3 text-[14px] font-semibold text-[#242421] outline-none focus:border-[#9f9e96]"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      }
    />
  )
}

function socialSettingsForProvider(
  config: AutomationSchema,
  provider: PostFastSocialProvider
) {
  return defaultPostFastProviderControls(provider, {
    ...(provider === "tiktok"
      ? tiktokControlsFromPostSettings(config.tiktok_post_settings)
      : {}),
    ...(config.social_post_settings?.[provider] ?? {}),
    ...fixedSocialSettingsForProvider(config, provider),
  })
}

function fixedSocialSettingsForProvider(
  config: AutomationSchema,
  provider: PostFastSocialProvider
): PostFastProviderControls {
  const publishAsVideo = automationProviderPublishesVideo(config, provider)

  switch (provider) {
    case "instagram":
      return {
        instagramPublishType: publishAsVideo ? "REEL" : "TIMELINE",
        instagramPostToGrid: true,
      }
    case "facebook":
      return {
        facebookContentType: publishAsVideo ? "REEL" : "POST",
      }
    case "youtube":
      return {
        youtubeTitle: tiktokControlsFromPostSettings(
          config.tiktok_post_settings
        ).tiktokTitle,
        youtubeIsShort: true,
        youtubeMadeForKids: false,
      }
    case "x":
    case "twitter":
      return {
        xRetweetUrl: "",
      }
    case "linkedin":
      return {
        linkedinAttachmentKey: "",
      }
    default:
      return {}
  }
}

function tiktokControlsFromPostSettings(
  settings: AutomationSchema["tiktok_post_settings"]
) {
  return {
    tiktokTitle: postTextValue(settings.description),
    tiktokIsDraft: settings.post_mode === "MEDIA_UPLOAD",
    tiktokAllowComments: settings.allow_comments,
    tiktokAllowDuet: settings.allow_duet,
    tiktokAllowStitch: settings.allow_stitch,
    tiktokBrandOrganic: settings.disclose_brand_organic,
    tiktokBrandContent: settings.disclose_branded_content,
    tiktokAutoAddMusic: settings.auto_music,
    tiktokIsAigc: settings.disclose_video_content,
  }
}

type BrandDisclosureValue = "none" | "organic" | "branded"

function brandDisclosureValue(
  settings: AutomationSchema["tiktok_post_settings"]
): BrandDisclosureValue {
  if (settings.disclose_branded_content) {
    return "branded"
  }
  if (settings.disclose_brand_organic) {
    return "organic"
  }
  return "none"
}

function brandDisclosureValueFromLabel(value: string): BrandDisclosureValue {
  if (value === "Brand organic") {
    return "organic"
  }
  if (value === "Branded content") {
    return "branded"
  }
  return "none"
}

function brandDisclosureLabel(value: BrandDisclosureValue) {
  switch (value) {
    case "organic":
      return "Brand organic"
    case "branded":
      return "Branded content"
    default:
      return "None"
  }
}

function brandDisclosurePatch(value: BrandDisclosureValue) {
  return {
    disclose_brand_organic: value === "organic",
    disclose_branded_content: value === "branded",
  }
}

function youtubePrivacyValue(value: string) {
  return value === "UNLISTED" || value === "PRIVATE" ? value : "PUBLIC"
}

function linkedinVisibilityValue(value: string) {
  return value === "CONNECTIONS" ? value : "PUBLIC"
}

function settingString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function settingBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function settingStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function PromptTextarea({
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

function PromptConfigPanel({
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
  function updateHooks(value: string) {
    const hooks = value
      .split("\n")
      .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
      .filter(Boolean)
    onConfigChange(schemaWithAutomationHooks(config, hooks))
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
            value={automationHooks(config).join("\n")}
            onChange={(event) => updateHooks(event.target.value)}
          />
        </label>
      </div>
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}

function SchedulePanel({
  config,
  onConfigChange,
  onCancel,
  onSave,
}: {
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
  onCancel: () => void
  onSave: () => void
}) {
  const postingTimes = schedulePostingTimes(config)
  const weeklyPostCount = postingTimes.reduce(
    (total, postingTime) => total + postingTime.days.length,
    0
  )

  function updatePostingTimes(
    nextPostingTimes: AutomationSchema["schedule"]["posting_times"]
  ) {
    onConfigChange({
      ...config,
      schedule: {
        ...config.schedule,
        posting_times: nextPostingTimes.slice(0, 5),
      },
    })
  }

  function updateTime(index: number, time: string) {
    updatePostingTimes(
      postingTimes.map((postingTime, postingIndex) =>
        postingIndex === index ? { ...postingTime, time } : postingTime
      )
    )
  }

  function toggleDay(index: number, day: AutomationDay) {
    updatePostingTimes(
      postingTimes.map((postingTime, postingIndex) => {
        if (postingIndex !== index) {
          return postingTime
        }
        const hasDay = postingTime.days.includes(day)
        const days = hasDay
          ? postingTime.days.filter((item) => item !== day)
          : [...postingTime.days, day].sort(
              (first, second) =>
                automationDays.indexOf(first) - automationDays.indexOf(second)
            )

        return {
          ...postingTime,
          days: days.length > 0 ? days : [day],
        }
      })
    )
  }

  function addPostingTime() {
    if (postingTimes.length >= 5) {
      return
    }
    updatePostingTimes([...postingTimes, defaultPostingTime()])
  }

  function removePostingTime(index: number) {
    updatePostingTimes(
      postingTimes.filter((_, postingIndex) => postingIndex !== index)
    )
  }

  return (
    <SettingsPage
      title="Posting times"
      action={
        <span className="rounded-full bg-[#333] px-4 py-2 text-[14px] font-semibold text-white">
          {timezoneLabel(config.schedule.timezone)}
        </span>
      }
    >
      <div className="flex items-center justify-between border-b border-[#ecebe4] py-4">
        <div className="text-[16px] font-semibold text-[#333]">
          {scheduleFrequencyLabel(postingTimes)}
        </div>
        <div className="text-[16px] font-semibold text-[#333]">
          {weeklyPostCount}/week
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {postingTimes.map((postingTime, index) => (
          <div
            key={`${postingTime.time}-${index}`}
            className="grid items-center gap-3 md:grid-cols-[132px_1fr_58px]"
          >
            <input
              className="h-12 rounded-[8px] border border-[#d8d7cf] bg-white px-3 text-[17px] font-semibold text-[#111] outline-none focus:border-[#9f9e96]"
              type="time"
              value={timeInputValue(postingTime.time)}
              onChange={(event) =>
                updateTime(index, displayTimeFromInput(event.target.value))
              }
              aria-label={`Posting time ${index + 1}`}
            />
            <div className="flex flex-wrap gap-2">
              {automationDays.map((day) => (
                <button
                  key={day}
                  className={cn(
                    "h-11 min-w-11 rounded-[8px] border px-3 text-[15px] font-semibold shadow-sm transition",
                    postingTime.days.includes(day)
                      ? "border-[#4d4c47] bg-white text-[#111]"
                      : "border-[#deddd5] bg-[#f7f7f3] text-[#9a9991]"
                  )}
                  onClick={() => toggleDay(index, day)}
                  aria-pressed={postingTime.days.includes(day)}
                >
                  {day.slice(0, 2)}
                </button>
              ))}
            </div>
            {index > 0 ? (
              <button
                className="grid h-12 w-12 place-items-center rounded-[8px] bg-[#fff1f1] text-[20px] font-bold text-[#e34b55]"
                onClick={() => removePostingTime(index)}
                aria-label={`Remove posting time ${index + 1}`}
              >
                -
              </button>
            ) : (
              <span className="hidden md:block" />
            )}
          </div>
        ))}
      </div>
      <Button
        variant="softControl"
        size="appDefault"
        className="mt-6 w-full justify-center"
        onClick={addPostingTime}
        disabled={postingTimes.length >= 5}
      >
        Add posting time
      </Button>
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}

function AutomationGeneralSettingsPanel({
  config,
  selectedSound,
  music,
  onConfigChange,
  onCancel,
  onSave,
}: {
  config: AutomationSchema
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  onConfigChange: (config: AutomationSchema) => void
  onCancel: () => void
  onSave: () => void
}) {
  const [newSlideEditor, setNewSlideEditor] = useState(true)
  const language =
    config.image_collection_ids.language || defaultAutomationLanguage
  const exportAsVideo = automationPublishType(config) === "video"
  const slideDuration = slideshowDurationValue(
    config.tiktok_post_settings.slideshow_slide_duration
  )
  const selectedAutomationSound =
    music.find(
      (sound) => sound.id === config.tiktok_post_settings.slideshow_sound_id
    ) ??
    (selectedSound?.id === config.tiktok_post_settings.slideshow_sound_id
      ? selectedSound
      : null)

  function updateLanguage(nextLanguage: string) {
    onConfigChange({
      ...config,
      image_collection_ids: {
        ...config.image_collection_ids,
        language: nextLanguage,
      },
    })
  }

  function updatePublishType(video: boolean) {
    onConfigChange({
      ...config,
      social_publish_as: video ? config.social_publish_as : {},
      tiktok_post_settings: {
        ...config.tiktok_post_settings,
        publish_type: video ? "video" : defaultAutomationPublishType,
      },
    })
  }

  function updateTransitionStyle(nextTransition: string) {
    patchTikTokSettings({
      slideshow_transition_style: nextTransition,
    })
  }

  function updateSlideDuration(nextDuration: string) {
    patchTikTokSettings({
      slideshow_slide_duration: slideshowDurationValue(nextDuration),
    })
  }

  function updateSelectedSound(id: string, sound?: LocalAsset | null) {
    const selected = sound ?? music.find((item) => item.id === id) ?? null
    patchTikTokSettings({
      slideshow_sound_id: selected?.id ?? "",
      slideshow_sound_name: selected?.name ?? "",
      slideshow_sound_url: selected?.url ?? "",
    })
  }

  function patchTikTokSettings(
    patch: Partial<AutomationSchema["tiktok_post_settings"]>
  ) {
    onConfigChange({
      ...config,
      tiktok_post_settings: {
        ...config.tiktok_post_settings,
        ...patch,
      },
    })
  }

  return (
    <SettingsPage title="Settings">
      <SettingsRow
        title="New Slide Editor"
        description="Use the new formatting editor for this automation"
        control={
          <SwitchPillButton
            enabled={newSlideEditor}
            onClick={() => setNewSlideEditor((current) => !current)}
          />
        }
      />
      <SettingsRow
        title="Language"
        description="Language for generated text on slides"
        control={
          <div className="flex items-center gap-2">
            <IconLanguage className="size-5 text-[#242421]" />
            <SelectControl
              value={language}
              onChange={(event) => updateLanguage(event.target.value)}
            >
              {automationLanguageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectControl>
          </div>
        }
      />
      <SettingsRow
        title="Export as video"
        description="Generate a video file from slides with transitions and audio"
        control={
          <SwitchPillButton
            enabled={exportAsVideo}
            onClick={() => updatePublishType(!exportAsVideo)}
          />
        }
      />
      <SettingsRow
        muted={!exportAsVideo}
        title="Transition Style"
        description="How slides transition when exported as video"
        control={
          <SelectControl
            disabled={!exportAsVideo}
            value={
              config.tiktok_post_settings.slideshow_transition_style ||
              defaultSlideshowTransition
            }
            onChange={(event) => updateTransitionStyle(event.target.value)}
          >
            {slideshowTransitionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        }
      />
      <SettingsRow
        muted={!exportAsVideo}
        title="Slide Duration"
        description="How long each slide is displayed (in seconds)"
        control={
          <SelectControl
            disabled={!exportAsVideo}
            value={String(slideDuration)}
            onChange={(event) => updateSlideDuration(event.target.value)}
          >
            {slideshowDurationOptions.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </SelectControl>
        }
      />
      <div className={cn("mt-6", !exportAsVideo && "opacity-50")}>
        <SoundSelector
          selectedSound={selectedAutomationSound}
          music={music}
          onSelect={updateSelectedSound}
          variant="settingsSound"
          emptyLabel={randomTikTokSoundLabel}
        />
      </div>
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}

function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-full px-9 py-8 pr-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] leading-tight font-bold text-[#111]">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-[15px] leading-6 font-medium text-[#77766f]">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-8 border-t border-[#ecebe4]">{children}</div>
    </div>
  )
}

function SettingsFooter({
  saveLabel = "Save Changes",
  onCancel,
  onSave,
}: {
  saveLabel?: string
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="mt-8 flex justify-end gap-3 border-t border-[#ecebe4] pt-5">
      <Button type="button" variant="softControl" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" variant="action" onClick={onSave}>
        {saveLabel}
      </Button>
    </div>
  )
}

function SettingsRow({
  title,
  description,
  control,
  muted,
}: {
  title: string
  description?: string
  control: React.ReactNode
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-h-[88px] items-center justify-between gap-5 border-b border-[#ecebe4] py-5",
        muted && "opacity-45"
      )}
    >
      <div className="min-w-0">
        <div className="text-[18px] leading-6 font-semibold text-[#111]">
          {title}
        </div>
        {description && (
          <div className="mt-1 text-[15px] leading-5 font-medium text-[#77766f]">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

const automationDays: AutomationDay[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
]
const allPostingDays: AutomationDay[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
]

function schedulePostingTimes(
  config: AutomationSchema
): AutomationSchema["schedule"]["posting_times"] {
  return config.schedule.posting_times.length > 0
    ? config.schedule.posting_times
    : [defaultPostingTime()]
}

function defaultPostingTime() {
  return {
    time: "11:00 AM",
    days: allPostingDays,
  }
}

function timeInputValue(value: string) {
  const minutes = minutesFromTimeLabel(value)
  if (minutes === null) {
    return "11:00"
  }
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function displayTimeFromInput(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) {
    return "11:00 AM"
  }
  const hour24 = Math.min(23, Math.max(0, Number(match[1])))
  const minute = Math.min(59, Math.max(0, Number(match[2])))
  const period = hour24 >= 12 ? "PM" : "AM"
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

function timezoneLabel(timezone: string) {
  const label = timezone.split("/").at(-1) || timezone || "Local"
  return label.replace(/_/g, " ")
}

function minutesFromTimeLabel(value: string) {
  const normalized = value.trim().toUpperCase()
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/.exec(normalized)
  if (!match) {
    return null
  }
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const period = match[3]
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) {
    return null
  }
  if (period === "PM" && hour < 12) {
    hour += 12
  }
  if (period === "AM" && hour === 12) {
    hour = 0
  }
  if (!period && hour === 24) {
    hour = 0
  }
  if (hour < 0 || hour > 23) {
    return null
  }
  return hour * 60 + minute
}

function scheduleFrequencyLabel(
  postingTimes: AutomationSchema["schedule"]["posting_times"]
) {
  const everyDay = postingTimes.every(
    (postingTime) => postingTime.days.length === 7
  )
  if (everyDay) {
    return `${postingTimes.length}x every day`
  }
  return `${postingTimes.length} posting ${postingTimes.length === 1 ? "time" : "times"}`
}
