"use client"

import { useEffect, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconLanguage,
  IconLayoutDashboard,
  IconList,
  IconMusic,
  IconMessage,
  IconPlus,
  IconTrash,
  IconWand,
  IconX,
} from "@tabler/icons-react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Blend,
  ChevronUp,
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

import {
  AutomationThumb,
  AvatarDot,
  ControlRow,
  ControlSelect,
  ControlToggle,
  PinterestPreviewTile,
} from "@/components/realfarm/shared-media"
import { CollectionSelector } from "@/components/realfarm/collection-selector"
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
  type AutomationSchema,
  type AutomationTextItem,
} from "@/lib/realfarm-automation"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import type { Automation } from "@/lib/realfarm-data"
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
  status: "scheduled" | "draft" | "failed"
  createdAt: string
  error?: string
  plan?: {
    title?: string
    hook?: string
    slides?: AutomationRunApiSlide[]
  }
}

type AutomationRunApiSlide = {
  id?: string
  role?: "hook" | "content" | "cta"
  imageUrl?: string
  imageCaption?: string
  text?: string
}

export function AutomationSettingsDrawer({
  automation,
  config,
  collections,
  onCreateCollection,
  onRename,
  onConfigChange,
  onDelete,
  onClose,
}: {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onRename: (name: string) => void
  onConfigChange: (config: AutomationSchema) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<AutomationDrawerTab>("overview")
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(automation.name)
  const [generating, setGenerating] = useState(false)
  const [recentRuns, setRecentRuns] = useState<AutomationRunApiRecord[]>([])

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
    flushSync(() => {
      setGenerating(true)
    })
    try {
      const payload = await fetchJsonWithTimeout<AutomationRunApiPayload>(
        "/api/automations/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            automationId: automation.id,
            schema: config,
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
        [run, ...current.filter((item) => item.id !== run.id)].slice(0, 6)
      )
      setActiveTab("overview")
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to generate slideshow"))
    } finally {
      const remainingLoadingMs = 450 - (Date.now() - loadingStartedAt)
      if (remainingLoadingMs > 0) {
        await wait(remainingLoadingMs)
      }
      setGenerating(false)
    }
  }

  return (
    <AppModal className="bg-[#24251f]/42 p-5" onClose={onClose}>
      <AppModalPanel
        className={cn(
          "grid overflow-hidden rounded-[5px] bg-white shadow-2xl",
          activeTab === "format"
            ? "h-[min(544px,90vh)] w-[min(792px,calc(100vw-40px))]"
            : "h-[min(720px,90vh)] w-[min(1000px,calc(100vw-40px))] md:grid-cols-[246px_1fr]"
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
                label="Slideshow Format"
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
                label="TikTok Settings"
                icon={IconWand}
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
              className="absolute top-4 right-4 z-10 text-[#62615b]"
              onClick={onClose}
              aria-label="Close automation settings"
            >
              <IconX className="size-5" />
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
              config={config}
              collections={collections}
              onCreateCollection={onCreateCollection}
              onConfigChange={onConfigChange}
              onBack={() => setActiveTab("overview")}
            />
          )}
          {activeTab === "hooks" && (
            <PromptConfigPanel
              automation={automation}
              config={config}
              onConfigChange={onConfigChange}
            />
          )}
          {activeTab === "tiktok" && (
            <TikTokSettingsPanel
              config={config}
              onConfigChange={onConfigChange}
            />
          )}
          {activeTab === "settings" && (
            <AutomationGeneralSettingsPanel
              config={config}
              onConfigChange={onConfigChange}
            />
          )}
          {activeTab === "schedule" && (
            <SchedulePanel config={config} onConfigChange={onConfigChange} />
          )}
        </div>
      </AppModalPanel>
    </AppModal>
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
    </div>
  )
}

function AutomationRecentRunCard({
  run,
  theme,
  index,
}: {
  run: AutomationRunApiRecord
  theme: string
  index: number
}) {
  const firstSlide = run.plan?.slides?.[0]
  const title = run.plan?.hook || firstSlide?.text || run.automationTitle
  const createdLabel = formatRunDate(run.createdAt)

  return (
    <article className="w-[158px] shrink-0 overflow-hidden rounded-[6px] bg-[#111] shadow-sm">
      <div className="relative h-[200px]">
        {firstSlide?.imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${firstSlide.imageUrl})` }}
          />
        ) : (
          <AutomationThumb theme={theme} index={index} />
        )}
        <div className="absolute inset-0 bg-black/25" />
        <div className="absolute inset-x-4 top-[28%] text-center font-tiktok text-[10px] leading-tight font-bold text-white drop-shadow">
          {title}
        </div>
        <div className="absolute inset-x-0 bottom-2 text-center text-[11px] font-medium text-white/90">
          {run.status === "failed" ? "Failed" : createdLabel}
        </div>
      </div>
    </article>
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

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function AutomationFormatPanel({
  automation,
  config,
  collections,
  onCreateCollection,
  onConfigChange,
  onBack,
}: {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onConfigChange: (config: AutomationSchema) => void
  onBack: () => void
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
  const previewItems = buildFormatPreviewItems(config, collections)
  const previewSlotWidth = 176
  const previewGap = 24
  const previewTrackOffset =
    activePreview * (previewSlotWidth + previewGap) + previewSlotWidth / 2

  useEffect(() => {
    if (activePreview <= previewItems.length - 1) {
      return
    }
    setActivePreview(Math.max(0, previewItems.length - 1))
    setSelectedTextIndex(null)
  }, [activePreview, previewItems.length])

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
              <ControlToggle
                label="Display text"
                enabled={!activeSection.noText}
                onClick={() =>
                  updateFormatSection(activeKey, {
                    noText: !activeSection.noText,
                  })
                }
              />
            </>
          )}
        </div>

        <div className="border-t border-[#deddd5] p-3">
          <Button
            variant="action"
            size="appDefault"
            className="w-full"
            onClick={onBack}
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
                active={activePreview === index}
                slotWidth={previewSlotWidth}
                selectedText={
                  selectedTextIndex !== null && activePreview === index
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
                  index === activePreview ? "bg-white" : "bg-white/55"
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
            onTextItemChange={updateTextItem}
            onDelete={deleteSelectedTextItem}
          />
        )}
      </main>
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
  const textPosition = formatTextPosition(item.textItem)
  const contentSection = item.role === "content" ? item.section : null

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
        <AutomationFormatImageLayout item={item} index={index} />
        {item.section.overlay && (
          <div className="absolute inset-0 bg-black/25" />
        )}
        {item.section.overlayImage?.enabled &&
          item.overlayImages.length > 0 && (
            <div
              className="absolute top-1/2 left-1/2 z-[1] overflow-hidden rounded-[4px] bg-black shadow-md"
              style={{
                width: "78%",
                aspectRatio: "16 / 9",
                transform: "translate(-50%, -42%)",
              }}
            >
              <PinterestPreviewTile
                image={item.overlayImages[index % item.overlayImages.length]}
                index={index}
                fit="cover"
                className="h-full rounded-none"
              />
            </div>
          )}
        {contentSection && false}
        {!item.section.noText && (
          <button
            className={cn(
              "absolute left-1/2 w-[74%] -translate-x-1/2 rounded-[3px] px-2 py-1 font-tiktok text-[11px] leading-tight font-bold text-yellow-100 drop-shadow transition-[top]",
              selectedText && "outline outline-2 outline-[#4f91ff]"
            )}
            style={textPosition}
            onClick={(event) => {
              event.stopPropagation()
              onSelectText()
            }}
            aria-label="Edit text element"
          >
            {item.text}
          </button>
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
    items.push(
      formatPreviewItem({
        config,
        role: "content",
        tab: "Content",
        label: `Content ${index + 1}`,
        index,
        images: contentImages,
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

function AutomationFormatImageLayout({
  item,
  index,
  compact,
}: {
  item: AutomationFormatPreviewItem
  index: number
  compact?: boolean
}) {
  const images = [
    item.image,
    ...item.images.filter((image) => image.id !== item.image?.id),
  ]
  const tile = (image: PinterestSearchResult | undefined, tileIndex: number) =>
    image ? (
      <PinterestPreviewTile
        image={image}
        index={index + tileIndex}
        fit="cover"
        className="h-full rounded-none"
      />
    ) : (
      <FormatEmptyCollectionTile />
    )

  if (compact || item.section.imageGrid === "none") {
    return <div className="h-full">{tile(images[0], 0)}</div>
  }

  if (item.section.imageGrid === "1x2") {
    return (
      <div className="grid h-full grid-rows-2">
        {[0, 1].map((tileIndex) => (
          <div key={tileIndex} className="overflow-hidden">
            {tile(images[tileIndex], tileIndex)}
          </div>
        ))}
      </div>
    )
  }

  if (item.section.imageGrid === "1x3") {
    return (
      <div className="grid h-full grid-rows-3">
        {[0, 1, 2].map((tileIndex) => (
          <div key={tileIndex} className="overflow-hidden">
            {tile(images[tileIndex], tileIndex)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-2 grid-rows-2">
      {[0, 1, 2, 3].map((tileIndex) => (
        <div key={tileIndex} className="overflow-hidden">
          {tile(images[tileIndex], tileIndex)}
        </div>
      ))}
    </div>
  )
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

function formatTextPosition(textItem: AutomationTextItem) {
  return {
    top:
      textItem.textPosition === "top" || textItem.textAnchor === "flush"
        ? "14%"
        : textItem.textPosition === "bottom"
          ? "72%"
          : "42%",
    textAlign: textItem.textAlign,
  } as const
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
  if (role === "cta") {
    const hooks = automationHooks(config)
    return hooks[index % Math.max(1, hooks.length)] || config.title
  }

  const section = automationFormatSection(config, role)
  const textItems =
    section.textItems.length > 0
      ? section.textItems
      : [defaultAutomationTextItem()]
  const textItem = textItems[index % textItems.length]
  const hooks = automationHooks(config)
  return (
    textItem.contentDirection?.trim() ||
    hooks[index % Math.max(1, hooks.length)] ||
    config.title
  )
}

function AutomationFormatTextToolbar({
  mode,
  textItem,
  onTextItemChange,
  onDelete,
}: {
  mode: "Hook" | "Content" | "CTA"
  textItem: AutomationTextItem
  onTextItemChange: (patch: Partial<AutomationTextItem>) => void
  onDelete: () => void
}) {
  return (
    <div className="absolute right-0 bottom-0 left-0 mx-4 mb-4 flex-shrink-0 space-y-2.5 rounded-xl border-t border-[#E5E7EB] bg-[#F5F5F5] px-4 py-3 shadow-lg">
      <div className="space-y-2.5">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <CompactTextSelect
              label="Word length"
              value={wordLengthLabel(textItem.wordLengthMin)}
              options={automationWordLengths.map(wordLengthLabel)}
              onChange={(value) =>
                onTextItemChange({ wordLengthMin: labelToWordLength(value) })
              }
            />
            <CompactTextSelect
              label="Alignment"
              value={alignmentLabel(textItem.textAlign)}
              options={automationAlignments.map(alignmentLabel)}
              icon={alignmentIcon(textItem.textAlign)}
              onChange={(value) =>
                onTextItemChange({ textAlign: labelToAlignment(value) })
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
                onTextItemChange({ textAnchor: labelToAnchor(value) })
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
                onTextItemChange({ contentDirection: event.target.value })
              }
              placeholder={
                mode === "CTA"
                  ? "e.g. a short call to action..."
                  : "e.g. A bold hook about..."
              }
            />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <button className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-[#777] transition-colors hover:bg-[#E5E5E5]">
            Advanced
            <ChevronUp className="size-3" />
          </button>
          <div className="flex items-center gap-1.5">
            <button className="flex items-center gap-1 rounded-md p-1.5 text-xs font-medium text-blue-500 transition-colors hover:bg-blue-50">
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
    </div>
  )
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

function TikTokSettingsPanel({
  config,
  onConfigChange,
}: {
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
}) {
  function updatePostSettings(
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
    <SettingsPage title="TikTok Settings">
      <div className="space-y-5">
        <SettingsRow
          title="Auto-post to TikTok"
          description="Publish automatically when a scheduled slideshow is ready."
          control={
            <SwitchPillButton
              enabled={config.tiktok_post_settings.auto_post}
              onClick={() =>
                updatePostSettings({
                  auto_post: !config.tiktok_post_settings.auto_post,
                })
              }
            />
          }
        />
        <div className="rounded-[8px] border border-[#f0d8d8] bg-[#fff8f8] px-4 py-3 text-[13px] leading-5 font-semibold text-[#a8464f]">
          No TikTok page is assigned to this automation. Add a TikTok page
          before enabling direct posting.
        </div>
        <PromptTextarea
          title="Title"
          value={postTextValue(config.tiktok_post_settings.description)}
          onChange={(value) =>
            updatePostSettings({
              description: postTextSettingWithValue(
                config.tiktok_post_settings.description,
                value
              ),
            })
          }
        />
        <PromptTextarea
          title="Caption"
          large
          value={postTextValue(config.tiktok_post_settings.caption)}
          onChange={(value) =>
            updatePostSettings({
              caption: postTextSettingWithValue(
                config.tiktok_post_settings.caption,
                value
              ),
            })
          }
        />
        <SettingsRow
          title="Post as draft"
          description="Send to TikTok as a draft so you can publish from the TikTok app."
          control={
            <SwitchPillButton
              enabled={config.tiktok_post_settings.post_mode === "MEDIA_UPLOAD"}
              onClick={() =>
                updatePostSettings({
                  post_mode:
                    config.tiktok_post_settings.post_mode === "MEDIA_UPLOAD"
                      ? "DIRECT_POST"
                      : "MEDIA_UPLOAD",
                })
              }
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
                updatePostSettings({
                  auto_music: !config.tiktok_post_settings.auto_music,
                })
              }
            />
          }
        />
      </div>
      <div className="mt-8 flex justify-end gap-3 border-t border-[#ecebe4] pt-5">
        <Button variant="softControl">Cancel</Button>
        <Button variant="action">Save Settings</Button>
      </div>
    </SettingsPage>
  )
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
}: {
  automation: Automation
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
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
              value={automationTone(config)}
              onChange={(event) => updateTone(event.target.value)}
            >
              {[
                "Conversational & Relatable",
                "Motivational & Empowering",
                "Educational & Informative",
                "Bold & Provocative",
                "Calm & Reflective",
                "Witty & Humorous",
              ].map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </SelectControl>
          }
        />
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
            value={automationHooks(config)
              .map((hook, index) => `${index + 1}. ${hook}`)
              .join("\n")}
            onChange={(event) => updateHooks(event.target.value)}
          />
        </label>
      </div>
    </SettingsPage>
  )
}

function SchedulePanel({
  config,
  onConfigChange,
}: {
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
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
            className="grid items-center gap-3 md:grid-cols-[150px_1fr_58px]"
          >
            <input
              className="h-12 rounded-[8px] border border-[#d8d7cf] bg-white px-4 text-[18px] font-semibold text-[#111] outline-none focus:border-[#9f9e96]"
              type="text"
              value={postingTime.time}
              onChange={(event) => updateTime(index, event.target.value)}
              aria-label={`Posting time ${index + 1}`}
              placeholder="11:00 AM"
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
      <div className="mt-8 flex justify-end gap-3 border-t border-[#ecebe4] pt-5">
        <Button variant="softControl">Cancel</Button>
        <Button variant="action">Save Changes</Button>
      </div>
    </SettingsPage>
  )
}

function AutomationGeneralSettingsPanel({
  config,
  onConfigChange,
}: {
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
}) {
  const [newSlideEditor, setNewSlideEditor] = useState(true)
  const language = config.image_collection_ids.language || "English"
  const languageOptions = ["English", "Chinese", "Malay", "Indian", "Spanish"]
  const exportAsVideo = automationPublishType(config) === "video"

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
      tiktok_post_settings: {
        ...config.tiktok_post_settings,
        publish_type: video ? "video" : "slideshow",
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
              {languageOptions.map((option) => (
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
            value="Hard Cut"
            onChange={() => undefined}
          >
            <option>Hard Cut</option>
            <option>Fade</option>
            <option>Slide</option>
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
            value="4 seconds"
            onChange={() => undefined}
          >
            <option>2 seconds</option>
            <option>3 seconds</option>
            <option>4 seconds</option>
            <option>5 seconds</option>
          </SelectControl>
        }
      />
      <button className="mt-6 flex w-full items-center justify-between rounded-[8px] border border-[#ecebe4] bg-white p-5 text-left transition hover:bg-[#fbfbf8]">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-[8px] bg-[#ffa092] text-white">
            <IconMusic className="size-8" />
          </span>
          <span className="min-w-0">
            <span className="block text-[16px] font-semibold text-[#85847d]">
              TikTok Sounds
            </span>
            <span className="mt-1 block truncate text-[14px] font-medium text-[#aaa9a2]">
              All sounds - a random song will be selected
            </span>
          </span>
        </div>
        <IconChevronRight className="size-5 shrink-0 text-[#b0afa8]" />
      </button>
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

function timezoneLabel(timezone: string) {
  const label = timezone.split("/").at(-1) || timezone || "Local"
  return label.replace(/_/g, " ")
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
