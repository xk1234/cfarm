"use client"

import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import { DateTime } from "luxon"
import {
  IconChevronLeft,
  IconChevronRight,
  IconList,
  IconPlus,
  IconRefresh,
  IconWand,
} from "@tabler/icons-react"
import { Expand, Shrink, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import { BuilderStep, SoundSelector } from "@/components/realfarm/creator-ui"
import { CollectionSelector } from "@/components/realfarm/collection-selector"
import {
  AvatarDot,
  PinterestPreviewTile,
} from "@/components/realfarm/shared-media"
import { FormatPickerModal } from "@/components/realfarm/slideshow-format-modal"
import {
  TemplateGeneratedPreview,
  generatedExampleSlides,
  type GeneratedShowcaseRun,
} from "@/components/realfarm/template-showcase-preview"
import {
  DefaultSlideTile,
  ExportedSlideshows,
  HookSelectorModal,
  SlideshowImagePickerModal,
  SlideshowPreviewSlide,
  TextElementToolbar,
  ratioHeightMultiplier,
  readRecentPinterestSearches,
  type ExportedSlideshow,
  type SlideshowLayoutOption,
  type SlideshowPreviewSlideRecord,
  type SlideshowTextElement,
} from "@/components/realfarm/slideshow-preview"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import {
  automationCollectionId,
  automationFormatSection,
  automationStoredHooks,
  mergeAutomationSchema,
  schemaWithAutomationHooks,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation, LocalAsset, RealFarmData } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import type { SlideshowRecord, SlideshowSettings } from "@/lib/slideshows"
import { cn } from "@/lib/utils"

export function EditorView({
  data,
  automations,
  automationConfigs,
  collections,
  recentRunsByAutomationId,
  selectedSound,
  music,
  onSoundSelect,
  onAutomationConfigChange,
  onCreateCollection,
  onCreate,
}: {
  data: RealFarmData
  automations: Automation[]
  automationConfigs: Record<string, AutomationSchema>
  collections: CreatedImageCollection[]
  recentRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  onSoundSelect: (id: string) => void
  onAutomationConfigChange: (
    automation: Automation,
    config: AutomationSchema
  ) => void
  onCreateCollection: (collection: CreatedImageCollection) => void
  onCreate: () => void
}) {
  const initialSelectedAutomation = automations[0] ?? null
  const initialSelectedConfig = initialSelectedAutomation
    ? mergeAutomationSchema(
        initialSelectedAutomation,
        automationConfigs[initialSelectedAutomation.id]
      )
    : null
  const initialSelectedHook = initialSelectedConfig
    ? (automationHookOptions(initialSelectedConfig)[0] ?? "")
    : (data.editor.slides[0]?.text ?? "Select an automation")
  const [selectedAutomation, setSelectedAutomation] =
    useState<Automation | null>(initialSelectedAutomation)
  const [selectedHook, setSelectedHook] = useState(initialSelectedHook)
  const [editorMode, setEditorMode] = useState<"new" | "prompt">("new")
  const [promptText, setPromptText] = useState("")
  const [promptCollectionId, setPromptCollectionId] = useState(
    () => firstSelectableCollection(collections)?.id ?? ""
  )
  const [activeSlide, setActiveSlide] = useState(0)
  const [hookOpen, setHookOpen] = useState(false)
  const [generatingHooks, setGeneratingHooks] = useState(false)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [editingTextSnapshot, setEditingTextSnapshot] =
    useState<SlideshowTextElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [imagePickerTarget, setImagePickerTarget] = useState<
    number | "append" | null
  >(null)
  const [formatPickerOpen, setFormatPickerOpen] = useState(false)
  const [exportSettingsOpen, setExportSettingsOpen] = useState(false)
  const [exportAsVideo, setExportAsVideo] = useState(true)
  const [exportTransition, setExportTransition] = useState("Hard Cut")
  const [generatingSlideshow, setGeneratingSlideshow] = useState(false)
  const [previewSlides, setPreviewSlides] = useState<
    SlideshowPreviewSlideRecord[]
  >(() =>
    initialSelectedConfig
      ? templatePreviewSlides({
          config: initialSelectedConfig,
          collections,
          fallbackImages: data.defaultCollections.backgrounds.images,
          hook: initialSelectedHook,
        })
      : [defaultPlaceholderPreviewSlide(data, initialSelectedHook)]
  )
  const [exportedSlideshows, setExportedSlideshows] = useState<
    ExportedSlideshow[]
  >([])
  const exportedSlideshowItems = exportedSlideshows.filter(
    (item) => item.status === "exported"
  )
  const draftSlideshowItems = exportedSlideshows.filter(
    (item) => item.status === "draft"
  )
  const selectedAutomationConfig = selectedAutomation
    ? mergeAutomationSchema(
        selectedAutomation,
        automationConfigs[selectedAutomation.id]
      )
    : null
  const selectedHookOptions = selectedAutomationConfig
    ? automationHookOptions(selectedAutomationConfig)
    : [selectedHook].filter(Boolean)
  const selectedAutomationExampleSlides = selectedAutomation
    ? generatedExampleSlides(recentRunsByAutomationId[selectedAutomation.id], 4)
    : []
  const promptCollection =
    collections.find((collection) => collection.id === promptCollectionId) ??
    firstSelectableCollection(collections)
  const activeSlideRecord = previewSlides[activeSlide] ?? previewSlides[0]
  const selectedText = selectedTextId
    ? (activeSlideRecord?.textElements.find(
        (element) => element.id === selectedTextId
      ) ?? null)
    : null
  const selectedHookPosition = Math.max(
    0,
    selectedHookOptions.indexOf(selectedHook)
  )
  const previewBaseSlideWidth = 300
  const previewMaxZoom = 2
  const previewSlideWidth = previewBaseSlideWidth * zoom
  const previewSlideGap = 72
  const previewTrackOffset =
    activeSlide * (previewSlideWidth + previewSlideGap) + previewSlideWidth / 2
  const previewMaxSlideHeight = Math.ceil(
    previewBaseSlideWidth *
      previewMaxZoom *
      ratioHeightMultiplier(activeSlideRecord?.aspectRatio ?? "3:4")
  )
  const previewStageMinHeight = previewMaxSlideHeight + 56
  const previewEditorMinHeight = previewStageMinHeight + 220
  const hasDefaultSlides = previewSlides.some((slide) => slide.isPlaceholder)
  const needsAutomationSelection = editorMode === "new" && !selectedAutomation
  const showExportedSlideshows =
    Boolean(selectedAutomation) ||
    editorMode === "prompt" ||
    exportedSlideshows.length > 0

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ slideshows?: SlideshowRecord[] }>(
      "/api/slideshows",
      {
        toastOnError: false,
      }
    )
      .then((payload) => {
        if (active) {
          setExportedSlideshows(
            (payload.slideshows ?? []).map(slideshowRecordToExported)
          )
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedAutomation) {
      return
    }

    if (
      !automations.some((automation) => automation.id === selectedAutomation.id)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reconcile stale selected automation after external automation list updates.
      setSelectedAutomation(null)
    }
  }, [automations, selectedAutomation])

  useEffect(() => {
    if (
      editorMode !== "new" ||
      selectedAutomation ||
      automations.length === 0
    ) {
      return
    }

    applyFormat(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- This intentionally runs only when the source automation list becomes available.
  }, [automations, editorMode, selectedAutomation])

  useEffect(() => {
    if (
      promptCollectionId &&
      collections.some((collection) => collection.id === promptCollectionId)
    ) {
      return
    }
    const nextCollection = firstSelectableCollection(collections)
    if (nextCollection?.id && nextCollection.id !== promptCollectionId) {
      setPromptCollectionId(nextCollection.id)
    }
  }, [collections, promptCollectionId])

  useEffect(() => {
    if (!selectedAutomationConfig) {
      return
    }
    if (!selectedHookOptions.includes(selectedHook)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reconcile stale selected hook after template changes.
      setSelectedHook(selectedHookOptions[0] ?? "")
    }
  }, [selectedAutomationConfig, selectedHook, selectedHookOptions])

  function updateSelectedText(patch: Partial<SlideshowTextElement>) {
    if (!selectedTextId) {
      return
    }
    setPreviewSlides((current) =>
      current.map((slide, slideIndex) =>
        slideIndex === activeSlide
          ? {
              ...slide,
              textElements: slide.textElements.map((element) =>
                element.id === selectedTextId
                  ? { ...element, ...patch }
                  : element
              ),
            }
          : slide
      )
    )
  }

  function beginTextEdit(id: string) {
    const element = previewSlides[activeSlide]?.textElements.find(
      (item) => item.id === id
    )
    setEditingTextSnapshot(element ? { ...element } : null)
    setSelectedTextId(id)
  }

  function cancelTextEdit() {
    if (selectedTextId && editingTextSnapshot) {
      updateSelectedText(editingTextSnapshot)
    }
    setSelectedTextId(null)
    setEditingTextSnapshot(null)
  }

  function saveTextEdit() {
    setSelectedTextId(null)
    setEditingTextSnapshot(null)
  }

  function deleteSelectedText() {
    if (!selectedTextId) {
      return
    }
    setPreviewSlides((current) =>
      current.map((slide, slideIndex) =>
        slideIndex === activeSlide
          ? {
              ...slide,
              textElements: slide.textElements.filter(
                (element) => element.id !== selectedTextId
              ),
            }
          : slide
      )
    )
    setSelectedTextId(null)
  }

  function addPreviewImage(image: PinterestSearchResult) {
    setPreviewSlides((current) => {
      setActiveSlide(current.length)
      return [
        ...current,
        {
          id: `preview-added-${Date.now()}`,
          image,
          text: selectedHook,
          duration: activeSlideRecord?.duration ?? 2,
          aspectRatio: activeSlideRecord?.aspectRatio ?? "3:4",
          layout: activeSlideRecord?.layout ?? "single",
          textElements: [
            {
              id: `text-added-${Date.now()}`,
              text: selectedHook,
              x: 50,
              y: 45,
              font: "Default",
              color: "Yellow Text",
              size: "14px",
            },
          ],
        },
      ]
    })
  }

  function addDefaultSlide() {
    setPreviewSlides((current) => {
      setActiveSlide(current.length)
      setSelectedTextId(null)

      return [
        ...current,
        {
          id: `preview-default-${Date.now()}`,
          image: data.defaultCollections.backgrounds.images[0],
          text: "",
          duration: activeSlideRecord?.duration ?? 2,
          aspectRatio: activeSlideRecord?.aspectRatio ?? "3:4",
          layout: "single" as SlideshowLayoutOption,
          textElements: [],
          isPlaceholder: true,
        },
      ]
    })
  }

  function replacePreviewImage(
    slideIndex: number,
    image: PinterestSearchResult
  ) {
    setPreviewSlides((current) =>
      current.map((slide, index) =>
        index === slideIndex
          ? {
              ...slide,
              image,
              isPlaceholder: false,
            }
          : slide
      )
    )
  }

  function deleteActiveSlide() {
    setPreviewSlides((current) => {
      if (current.length <= 1) {
        return current
      }
      const next = current.filter((_, index) => index !== activeSlide)
      setActiveSlide(Math.max(0, Math.min(activeSlide, next.length - 1)))
      setSelectedTextId(null)
      return next
    })
  }

  function updateActiveSlide(patch: Partial<SlideshowPreviewSlideRecord>) {
    setPreviewSlides((current) =>
      current.map((slide, index) =>
        index === activeSlide ? { ...slide, ...patch } : slide
      )
    )
  }

  function applySelectedHookToPreview(hook: string) {
    setPreviewSlides((current) =>
      current.map((slide, index) =>
        index === 0
          ? {
              ...slide,
              text: hook,
              textElements: slide.textElements.map((element, elementIndex) =>
                elementIndex === 0 ? { ...element, text: hook } : element
              ),
            }
          : slide
      )
    )
  }

  function selectHook(hook: string) {
    setSelectedHook(hook)
    applySelectedHookToPreview(hook)
    setActiveSlide(0)
    setSelectedTextId(null)
    setHookOpen(false)
  }

  function updateSelectedHookText(value: string) {
    setSelectedHook(value)
    applySelectedHookToPreview(value)
    setActiveSlide(0)
    setSelectedTextId(null)

    if (!selectedAutomation || !selectedAutomationConfig) {
      return
    }

    const currentHooks = selectedHookOptions
    const currentIndex = currentHooks.indexOf(selectedHook)
    const targetIndex = currentIndex >= 0 ? currentIndex : 0
    const nextHooks =
      currentHooks.length === 0
        ? value.trim()
          ? [value]
          : []
        : currentHooks
            .map((hook, index) => (index === targetIndex ? value : hook))
            .filter((hook) => hook.trim())

    const nextSchema = schemaWithAutomationHooks(
      selectedAutomationConfig,
      nextHooks
    )
    onAutomationConfigChange(selectedAutomation, nextSchema)
  }

  function moveHook(direction: -1 | 1) {
    const hooks = selectedHookOptions
    if (hooks.length === 0) {
      return
    }
    const currentIndex = Math.max(0, hooks.indexOf(selectedHook))
    const nextHook =
      hooks[(currentIndex + direction + hooks.length) % hooks.length] ??
      selectedHook
    selectHook(nextHook)
  }

  function applyFormat(formatIndex: number) {
    const automation = automations[formatIndex] ?? null
    const config = automation
      ? mergeAutomationSchema(automation, automationConfigs[automation.id])
      : null
    const hook = config
      ? (automationHookOptions(config)[0] ?? "")
      : automation?.name || selectedHook
    setSelectedAutomation(automation)
    setSelectedHook(hook)
    if (config) {
      setPreviewSlides(
        templatePreviewSlides({
          config,
          collections,
          fallbackImages: data.defaultCollections.backgrounds.images,
          hook,
        })
      )
      setActiveSlide(0)
      setSelectedTextId(null)
    }
    setFormatPickerOpen(false)
  }

  async function generateMoreHooks() {
    if (
      !selectedAutomation ||
      generatingHooks ||
      selectedHookOptions.length === 0
    ) {
      return
    }

    setGeneratingHooks(true)
    try {
      const payload = await fetchJsonWithTimeout<{
        hooks?: string[]
        generatedHooks?: string[]
        schema?: AutomationSchema
      }>("/api/automations/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId: selectedAutomation.id }),
      })
      const nextSchema = payload.schema
      const nextHooks = payload.hooks ?? []
      if (!nextSchema || nextHooks.length === 0) {
        toast.error("No new hooks were generated.", {
          position: "bottom-center",
        })
        return
      }

      onAutomationConfigChange(selectedAutomation, nextSchema)
      if (!nextHooks.includes(selectedHook)) {
        selectHook(nextHooks[0] ?? selectedHook)
      }
      toast.success(`${payload.generatedHooks?.length ?? 10} new hooks added`, {
        position: "bottom-center",
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to generate hooks"), {
        position: "bottom-center",
      })
    } finally {
      setGeneratingHooks(false)
    }
  }

  async function generateFromPrompt() {
    const prompt = promptText.trim() || "Test"
    showGenerationStartedToast()
    const images = promptCollection?.images ?? []
    const nextSlides = images.length
      ? images.slice(0, 3).map((image, index) => ({
          id: `prompt-${Date.now()}-${index}`,
          image,
          text: prompt,
          duration: 2,
          aspectRatio: "3:4",
          layout: "single" as SlideshowLayoutOption,
          textElements: [
            {
              id: `prompt-text-${Date.now()}-${index}`,
              text:
                index === 0
                  ? prompt
                  : (data.editor.slides[index]?.text ?? prompt),
              x: 50,
              y: 45,
              font: "Default",
              color: "Outline",
              size: "12px",
            },
          ],
        }))
      : [defaultPlaceholderPreviewSlide(data, prompt)]
    setSelectedHook(prompt)
    setPreviewSlides(nextSlides)
    await persistPreviewSlideshow({
      title: prompt,
      prompt,
      slideshow_type: "educational",
      image_collection: promptCollection?.id ?? "default-placeholder",
      slides: nextSlides,
    })
    setActiveSlide(0)
    setSelectedTextId(null)
    setEditingTextSnapshot(null)
  }

  async function generateSelectedAutomationSlideshow() {
    if (!selectedAutomation || generatingSlideshow) {
      return
    }

    showGenerationStartedToast()
    flushSync(() => {
      setGeneratingSlideshow(true)
    })
    const loadingStartedAt = Date.now()
    try {
      await nextAnimationFrame()
      const payload = await fetchJsonWithTimeout<AutomationRunApiPayload>(
        "/api/automations/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            automationId: selectedAutomation.id,
            schema: selectedAutomationConfig
              ? schemaWithSelectedHook(selectedAutomationConfig, selectedHook)
              : undefined,
            force: true,
            now: new Date().toISOString(),
          }),
        }
      )
      const run = payload.created?.[0]
      const nextSlides = automationRunToPreviewSlides(run)
      if (!run || nextSlides.length === 0) {
        toast.error(
          run?.error ||
            "No slideshow slides were generated for this automation.",
          {
            position: "bottom-center",
          }
        )
        return
      }

      const title =
        run.plan?.hook || run.automationTitle || selectedAutomation.name
      setSelectedHook(title)
      setPreviewSlides(nextSlides)
      if (run.slideshowId) {
        const slideshow = await fetchPersistedSlideshow(run.slideshowId)
        if (slideshow) {
          prependExportedSlideshow(slideshowRecordToExported(slideshow))
        }
      } else {
        prependExportedSlideshow({
          id: run.id || `export-automation-${Date.now()}`,
          title,
          createdAt: run.createdAt ?? DateTime.now().toISO(),
          status: "draft",
          slides: nextSlides,
        })
      }
      setActiveSlide(0)
      setSelectedTextId(null)
      setEditingTextSnapshot(null)
      onCreate()
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to generate slideshow"), {
        position: "bottom-center",
      })
    } finally {
      const remainingLoadingMs = 450 - (Date.now() - loadingStartedAt)
      if (remainingLoadingMs > 0) {
        await wait(remainingLoadingMs)
      }
      setGeneratingSlideshow(false)
    }
  }

  async function exportCurrentSlideshow() {
    if (hasDefaultSlides || !selectedAutomation) {
      return
    }

    await persistPreviewSlideshow({
      title: selectedHook,
      prompt: selectedHook,
      slideshow_type: "automation",
      image_collection: selectedAutomationConfig
        ? automationCollectionId(selectedAutomationConfig, "content")
        : "",
      slides: previewSlides,
      status: "exported",
    })
  }

  async function duplicateDraftSlideshow(item: ExportedSlideshow) {
    await persistPreviewSlideshow({
      title: `${item.title} copy`,
      prompt: item.title,
      slideshow_type: "draft",
      image_collection: selectedAutomationConfig
        ? automationCollectionId(selectedAutomationConfig, "content")
        : "",
      slides: item.slides,
      status: "draft",
    })
  }

  async function persistPreviewSlideshow({
    title,
    prompt,
    slideshow_type,
    image_collection,
    slides,
    status = "draft",
  }: {
    title: string
    prompt: string
    slideshow_type: string
    image_collection: string
    slides: SlideshowPreviewSlideRecord[]
    status?: "draft" | "exported"
  }) {
    try {
      const payload = await fetchJsonWithTimeout<{
        slideshow?: SlideshowRecord
      }>("/api/slideshows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prompt,
          image_collection,
          slideshow_type,
          status,
          settings: currentSlideshowSettings(),
          images: previewSlidesToSlideshowImages(slides),
        }),
      })
      if (payload.slideshow) {
        prependExportedSlideshow(slideshowRecordToExported(payload.slideshow))
      }
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to save slideshow"))
    }
  }

  async function fetchPersistedSlideshow(id: string) {
    const payload = await fetchJsonWithTimeout<{
      slideshows?: SlideshowRecord[]
    }>(`/api/slideshows?id=${encodeURIComponent(id)}`, {
      toastOnError: false,
    })
    return payload.slideshows?.[0] ?? null
  }

  function prependExportedSlideshow(item: ExportedSlideshow) {
    setExportedSlideshows((current) => upsertExportedSlideshow(current, item))
  }

  function currentSlideshowSettings(): SlideshowSettings {
    return {
      duration: activeSlideRecord?.duration ?? 4,
      background_color: "#000000",
      is_bg_overlay_on: false,
      transition_style: exportTransition.toLowerCase().replace(/\s+/g, "_"),
      background_opacity: 40,
      is_bg_overlay_on_hook_image: false,
    }
  }

  return (
    <div className="mx-auto max-w-[1240px]">
      <section
        className={cn(
          "grid overflow-hidden rounded-[13px] border border-[#d9d8d0] bg-[#f1f1ed] shadow-sm",
          expanded ? "lg:grid-cols-[1fr]" : "lg:grid-cols-[320px_1fr]"
        )}
        style={{ minHeight: previewEditorMinHeight }}
      >
        {!expanded && (
          <aside className="border-r border-[#deddd5] bg-[#f8f8f4] p-5">
            <div className="mb-7 flex items-center justify-between">
              <h1 className="text-[20px] font-semibold tracking-normal">
                Generate Slideshows
              </h1>
              <div className="flex rounded-[9px] bg-[#f0f0ec] p-1 text-[12px] font-semibold text-[#77766f]">
                <button
                  className={cn(
                    "rounded-[7px] px-3 py-1.5",
                    editorMode === "new" && "bg-white text-[#242421] shadow-sm"
                  )}
                  onClick={() => setEditorMode("new")}
                >
                  New
                </button>
                <button
                  className={cn(
                    "rounded-[7px] px-3 py-1.5",
                    editorMode === "prompt" &&
                      "bg-white text-[#242421] shadow-sm"
                  )}
                  onClick={() => setEditorMode("prompt")}
                >
                  Via Prompt
                </button>
              </div>
            </div>

            {needsAutomationSelection ? (
              <>
                <BuilderStep title="Automation" labelPrefix="1.">
                  <button
                    className="grid h-[92px] w-full place-items-center rounded-[10px] border border-dashed border-[#cfcfc8] bg-white/35 text-[#56554f] transition hover:bg-white/55"
                    onClick={() => setFormatPickerOpen(true)}
                  >
                    <span className="flex flex-col items-center gap-2 text-[13px] font-semibold">
                      <IconPlus className="size-4 text-[#8f8e87]" />
                      Select automation
                    </span>
                  </button>
                </BuilderStep>

                <Button
                  variant="action"
                  size="largeAction"
                  className="mt-2 w-full"
                  onClick={() => setFormatPickerOpen(true)}
                >
                  <IconWand className="size-4" />
                  <span className="leading-tight">
                    Generate Slideshow
                    <span className="block text-[10px] font-medium text-white/80">
                      0 credits
                    </span>
                  </span>
                </Button>
              </>
            ) : editorMode === "new" ? (
              <>
                <BuilderStep
                  title="Hook"
                  labelPrefix="1."
                  count={
                    selectedHookOptions.length > 0
                      ? `${selectedHookPosition + 1}/${selectedHookOptions.length}`
                      : "0/0"
                  }
                  actions={
                    <button
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#696862]"
                      onClick={() => setHookOpen(true)}
                    >
                      <IconList className="size-3.5" />
                      All Hooks
                    </button>
                  }
                >
                  <div className="flex h-[88px] items-center rounded-[15px] bg-white px-3 text-[14px] leading-5 font-semibold shadow-sm">
                    <button
                      className="grid size-7 shrink-0 place-items-center text-[#a09f98] disabled:opacity-40"
                      onClick={() => moveHook(-1)}
                      disabled={selectedHookOptions.length <= 1}
                      aria-label="Previous hook"
                    >
                      <IconChevronLeft className="size-4" />
                    </button>
                    <textarea
                      className="min-w-0 flex-1 resize-none bg-transparent px-3 text-center text-[14px] leading-5 font-semibold outline-none placeholder:text-[#b8b7af]"
                      value={selectedHook}
                      onFocus={() => setActiveSlide(0)}
                      onChange={(event) =>
                        updateSelectedHookText(event.target.value)
                      }
                      placeholder="Type a hook..."
                      aria-label="Edit selected hook"
                    />
                    <button
                      className="grid size-7 shrink-0 place-items-center text-[#a09f98] disabled:opacity-40"
                      onClick={() => moveHook(1)}
                      disabled={selectedHookOptions.length <= 1}
                      aria-label="Next hook"
                    >
                      <IconChevronRight className="size-4" />
                    </button>
                  </div>
                </BuilderStep>

                <div className="mt-7">
                  <BuilderStep
                    title="Automation"
                    labelPrefix="2."
                    actions={
                      <button
                        className="flex items-center gap-1 text-[11px] text-[#696862]"
                        onClick={() => setFormatPickerOpen(true)}
                      >
                        <IconRefresh className="size-3" />
                        Change automation
                      </button>
                    }
                  >
                    <AutomationSelectorCard
                      automation={selectedAutomation}
                      exampleSlides={selectedAutomationExampleSlides}
                      onClick={() => setFormatPickerOpen(true)}
                    />
                  </BuilderStep>
                </div>

                <Button
                  variant="action"
                  size="largeAction"
                  className="mt-5 w-full"
                  disabled={generatingSlideshow || !selectedAutomation}
                  onClick={generateSelectedAutomationSlideshow}
                  aria-busy={generatingSlideshow}
                >
                  <IconWand className="size-4" />
                  <span className="leading-tight">
                    {generatingSlideshow
                      ? "Generating..."
                      : "Generate Slideshow"}
                    <span className="block text-[10px] font-medium text-white/80">
                      0 credits
                    </span>
                  </span>
                </Button>
              </>
            ) : (
              <ViaPromptPanel
                prompt={promptText}
                promptCollection={promptCollection}
                collections={collections}
                onPromptChange={setPromptText}
                onPromptCollectionChange={setPromptCollectionId}
                onCreateCollection={onCreateCollection}
                onGenerate={generateFromPrompt}
              />
            )}
          </aside>
        )}

        <div
          className="relative min-w-0 bg-[#e9e9e5] p-5"
          style={{ minHeight: previewEditorMinHeight }}
        >
          <label className="absolute top-4 left-5 flex items-start gap-2 text-[11px] font-semibold text-[#8b8a83]">
            <span>1x</span>
            <input
              type="range"
              min="1"
              max="2"
              step="0.1"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-0.5 w-24 accent-[#77766f]"
            />
            <span>2x</span>
            <span className="absolute top-6 left-12">{zoom.toFixed(1)}x</span>
          </label>
          <div className="absolute top-6 left-1/2 -translate-x-1/2 text-[12px] font-semibold text-[#94938b]">
            Preview Editor
          </div>
          <button
            className="absolute top-5 right-5 flex items-center gap-1 text-[11px] font-semibold text-[#94938b]"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Collapse View" : "Expand View"}
            {expanded ? (
              <Shrink className="size-3.5" />
            ) : (
              <Expand className="size-3.5" />
            )}
          </button>

          <div
            className="overflow-x-hidden overflow-y-visible pt-14"
            style={{ minHeight: previewStageMinHeight }}
          >
            <div
              className="flex items-center transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
              style={{
                gap: `${previewSlideGap}px`,
                transform: `translateX(calc(50% - ${previewTrackOffset}px))`,
              }}
            >
              {previewSlides.map((slide, slideIndex) => (
                <div
                  key={slide.id}
                  className={cn(
                    "shrink-0 cursor-pointer transition-opacity duration-300",
                    activeSlide === slideIndex ? "opacity-100" : "opacity-55"
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveSlide(slideIndex)
                    setSelectedTextId(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setActiveSlide(slideIndex)
                      setSelectedTextId(null)
                    }
                  }}
                >
                  <SlideshowPreviewSlide
                    slide={slide}
                    relatedImages={previewSlides.map((item) => item.image)}
                    active={activeSlide === slideIndex}
                    index={slideIndex}
                    zoom={zoom}
                    selectedTextId={selectedTextId}
                    onSelectText={beginTextEdit}
                    onMoveText={(id, position) => {
                      setPreviewSlides((current) =>
                        current.map((currentSlide, currentSlideIndex) =>
                          currentSlideIndex === slideIndex
                            ? {
                                ...currentSlide,
                                textElements: currentSlide.textElements.map(
                                  (element) =>
                                    element.id === id
                                      ? { ...element, ...position }
                                      : element
                                ),
                              }
                            : currentSlide
                        )
                      )
                    }}
                    onAddImage={() => {
                      setImagePickerTarget(slideIndex)
                      setImagePickerOpen(true)
                    }}
                    onDurationChange={(duration) =>
                      updateActiveSlide({ duration })
                    }
                    onAspectRatioChange={(aspectRatio) =>
                      updateActiveSlide({ aspectRatio })
                    }
                    onLayoutChange={(layout) => updateActiveSlide({ layout })}
                    onDeleteSlide={deleteActiveSlide}
                  />
                </div>
              ))}
            </div>
          </div>

          {selectedText && (
            <TextElementToolbar
              element={selectedText}
              activeIndex={Math.min(activeSlide + 1, previewSlides.length)}
              total={previewSlides.length}
              onChange={updateSelectedText}
              onDelete={deleteSelectedText}
            />
          )}

          <div className="absolute right-5 bottom-[92px] left-5 flex justify-center">
            <div className="flex items-center gap-2">
              {previewSlides.map((slide, index) => (
                <button
                  key={slide.id}
                  className={cn(
                    "h-10 w-10 overflow-hidden rounded-[7px] border-2 shadow-sm",
                    activeSlide === index ? "border-app-action" : "border-white"
                  )}
                  onClick={() => {
                    setActiveSlide(index)
                    setSelectedTextId(null)
                  }}
                >
                  {slide.isPlaceholder ? (
                    <DefaultSlideTile className="h-full rounded-none" />
                  ) : (
                    <PinterestPreviewTile
                      image={slide.image}
                      index={index}
                      className="h-full rounded-none"
                    />
                  )}
                </button>
              ))}
              <Button
                variant="softControl"
                size="icon-lg"

                onClick={addDefaultSlide}
                aria-label="Add slide"
              >
                <IconPlus className="size-5" />
              </Button>
            </div>
          </div>
          {selectedText ? (
            <div className="absolute right-5 bottom-5 left-5 grid grid-cols-2 items-center gap-5">
              <Button
                variant="softControl"
                size="dialogAction"
                onClick={cancelTextEdit}
              >
                Cancel edits
              </Button>
              <Button
                variant="action"
                size="dialogAction"
                onClick={saveTextEdit}
              >
                Save
              </Button>
            </div>
          ) : (
            <div className="absolute right-5 bottom-5 left-5 grid grid-cols-[64px_1fr] items-center gap-5">
              <Button
                variant="softControl"
                size="icon-lg"

                aria-label="Slideshow export settings"
                onClick={() => setExportSettingsOpen(true)}
              >
                <SlidersHorizontal className="size-7" />
              </Button>
              <Button
                variant="action"
                size="dialogAction"
                className="disabled:cursor-not-allowed disabled:opacity-45"
                disabled={hasDefaultSlides || !selectedAutomation}
                onClick={exportCurrentSlideshow}
              >
                Export
              </Button>
            </div>
          )}
        </div>
      </section>
      {showExportedSlideshows && (
        <ExportedSlideshows
          items={exportedSlideshowItems}
          draftItems={draftSlideshowItems}
          onDuplicateDraft={(item) => {
            void duplicateDraftSlideshow(item)
          }}
          onDelete={(id) => {
            setExportedSlideshows((current) =>
              current.filter((item) => item.id !== id)
            )
            void fetchJsonWithTimeout(
              `/api/slideshows?id=${encodeURIComponent(id)}`,
              {
                method: "DELETE",
                toastOnError: false,
              }
            ).catch((error) => {
              window.alert(
                getApiErrorMessage(error, "Failed to delete slideshow")
              )
            })
          }}
        />
      )}
      {hookOpen && (
        <HookSelectorModal
          hooks={selectedHookOptions}
          title={selectedAutomation?.name ?? "Automation"}
          selectedHook={selectedHook}
          onSelect={selectHook}
          onGenerate={generateMoreHooks}
          generating={generatingHooks}
          onClose={() => setHookOpen(false)}
        />
      )}
      {imagePickerOpen && (
        <SlideshowImagePickerModal
          collections={collections}
          recentSearches={readRecentPinterestSearches()}
          onClose={() => setImagePickerOpen(false)}
          onSelect={(image) => {
            if (imagePickerTarget === "append") {
              addPreviewImage(image)
            } else if (typeof imagePickerTarget === "number") {
              replacePreviewImage(imagePickerTarget, image)
              setActiveSlide(imagePickerTarget)
            }
            setImagePickerOpen(false)
          }}
        />
      )}
      {formatPickerOpen && (
        <FormatPickerModal
          data={data}
          automations={automations}
          automationConfigs={automationConfigs}
          collections={collections}
          recentRunsByAutomationId={recentRunsByAutomationId}
          onClose={() => setFormatPickerOpen(false)}
          onSelect={applyFormat}
        />
      )}
      {exportSettingsOpen && (
        <ExportSettingsModal
          exportAsVideo={exportAsVideo}
          transition={exportTransition}
          selectedSound={selectedSound}
          music={music}
          onExportAsVideoChange={setExportAsVideo}
          onTransitionChange={setExportTransition}
          onSoundSelect={onSoundSelect}
          onClose={() => setExportSettingsOpen(false)}
        />
      )}
    </div>
  )
}

type AutomationRunApiPayload = {
  created?: AutomationRunApiRecord[]
}

type AutomationRunApiRecord = {
  id?: string
  slideshowId?: string
  automationTitle?: string
  createdAt?: string | null
  error?: string
  plan?: {
    title?: string
    hook?: string
    slides?: AutomationRunApiSlide[]
  }
}

type AutomationRunApiSlide = {
  id?: string
  role?: string
  imageUrl?: string
  imageCaption?: string
  text?: string
  textPlacement?: string
  aspectRatio?: string
  imageGrid?: string
}

function automationRunToPreviewSlides(
  run: AutomationRunApiRecord | undefined
): SlideshowPreviewSlideRecord[] {
  const slides = Array.isArray(run?.plan?.slides) ? run.plan.slides : []
  return slides.flatMap((slide, index) => {
    const imageUrl = slide.imageUrl?.trim()
    if (!imageUrl) {
      return []
    }
    const text =
      slide.text?.trim() ||
      run?.plan?.hook ||
      run?.automationTitle ||
      "Slideshow"
    const textPlacement = slide.textPlacement === "top" ? "top" : "center"

    return [
      {
        id: `automation-${run?.id ?? "run"}-${slide.id || index}`,
        image: {
          id: `automation-image-${run?.id ?? "run"}-${slide.id || index}`,
          title: slide.imageCaption || text,
          description: slide.imageCaption || text,
          imageUrl,
          sourceUrl: imageUrl,
          dominantColor: "#d9d8d0",
        },
        text,
        duration: 2,
        aspectRatio: normalizeAutomationAspectRatio(slide.aspectRatio),
        layout: automationImageGridToLayout(slide.imageGrid),
        textElements: [
          {
            id: `automation-text-${run?.id ?? "run"}-${slide.id || index}`,
            text,
            x: 50,
            y: textPlacement === "top" ? 16 : 45,
            font: "Default",
            color: "Yellow Text",
            size: "14px",
          },
        ],
      },
    ]
  })
}

function slideshowRecordToExported(record: SlideshowRecord): ExportedSlideshow {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.created_at,
    status: record.status,
    slides: record.images.map((slide, index) =>
      slideshowSlideToPreviewSlide(slide, index)
    ),
  }
}

function slideshowSlideToPreviewSlide(
  slide: SlideshowRecord["images"][number],
  index: number
): SlideshowPreviewSlideRecord {
  const firstText = slide.textItems[0]
  const text = firstText?.text || "Slideshow"
  return {
    id: slide.id || `persisted-slide-${index}`,
    image: {
      id: `persisted-image-${slide.id || index}`,
      title: text,
      description: text,
      imageUrl: slide.image_url,
      sourceUrl: slide.image_url,
      dominantColor: "#d9d8d0",
    },
    text,
    duration: Math.max(1, Math.round(slide.time_length_ms / 1000)),
    aspectRatio: slide.aspect_ratio || "9:16",
    layout: "single",
    textElements: slide.textItems.map((item, textIndex) => ({
      id: item.id || `persisted-text-${index}-${textIndex}`,
      text: item.text,
      x: item.textPosition.x,
      y: item.textPosition.y,
      font: item.font,
      color: textStyleToEditorColor(item.textStyle),
      size: item.fontSize,
    })),
  }
}

function previewSlidesToSlideshowImages(
  slides: SlideshowPreviewSlideRecord[]
): SlideshowRecord["images"] {
  return slides
    .filter((slide) => !slide.isPlaceholder)
    .map((slide, index) => ({
      id: slide.id || `slide-${index + 1}`,
      image_url: slide.image.imageUrl,
      aspect_ratio: slide.aspectRatio,
      time_length_ms: Math.max(1, slide.duration) * 1000,
      textItems: slide.textElements.map((element, textIndex) => ({
        id: element.id || `text-${index + 1}-${textIndex + 1}`,
        text: element.text,
        font: element.font || "TikTok Display Medium",
        fontSize: element.size || "10px",
        textSize: {
          width: Math.max(20, Math.min(100, element.text.length * 4)),
          height: 18,
        },
        textStyle: editorColorToTextStyle(element.color),
        textAlign: "center",
        textAnchor: "padded",
        textPosition: {
          x: element.x,
          y: element.y,
        },
      })),
    }))
}

function upsertExportedSlideshow(
  current: ExportedSlideshow[],
  item: ExportedSlideshow
) {
  return [item, ...current.filter((currentItem) => currentItem.id !== item.id)]
}

function editorColorToTextStyle(color: string) {
  switch (color) {
    case "Yellow Text":
      return "yellowText"
    case "Black Text":
      return "blackText"
    case "White Background":
      return "whiteBackground"
    case "Black Background":
      return "blackBackground"
    case "Outline":
      return "outline"
    case "White Text":
    default:
      return "whiteText"
  }
}

function textStyleToEditorColor(style: string) {
  switch (style) {
    case "yellowText":
    case "yellow-text":
      return "Yellow Text"
    case "blackText":
    case "black-text":
      return "Black Text"
    case "whiteBackground":
    case "white-background":
      return "White Background"
    case "blackBackground":
    case "black-background":
      return "Black Background"
    case "outline":
      return "Outline"
    case "whiteText":
    case "white-text":
    default:
      return "White Text"
  }
}

function normalizeAutomationAspectRatio(value: string | undefined) {
  return value && value !== "fit" ? value : "9:16"
}

function automationImageGridToLayout(
  value: string | undefined
): SlideshowLayoutOption {
  switch (value) {
    case "2x2":
      return "2:2"
    case "1x2":
      return "1:2"
    case "1x3":
      return "1:3"
    default:
      return "single"
  }
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function showGenerationStartedToast() {
  toast.success(
    "Sample slideshow generation started! This will take 45-60 seconds.",
    {
      position: "bottom-center",
    }
  )
}

function firstSelectableCollection(collections: CreatedImageCollection[]) {
  return (
    collections.find(
      (collection) => !collection.virtual && collection.images.length > 0
    ) ?? null
  )
}

function defaultPlaceholderPreviewSlide(
  data: RealFarmData,
  text: string
): SlideshowPreviewSlideRecord {
  return {
    id: "preview-default-placeholder",
    image: data.defaultCollections.backgrounds.images[0],
    text,
    duration: 2,
    aspectRatio: "3:4",
    layout: "single",
    textElements: [],
    isPlaceholder: true,
  }
}

function ExportSettingsModal({
  exportAsVideo,
  transition,
  selectedSound,
  music,
  onExportAsVideoChange,
  onTransitionChange,
  onSoundSelect,
  onClose,
}: {
  exportAsVideo: boolean
  transition: string
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  onExportAsVideoChange: (value: boolean) => void
  onTransitionChange: (value: string) => void
  onSoundSelect: (id: string) => void
  onClose: () => void
}) {
  return (
    <AppModal className="bg-[#24251f]/25" onClose={onClose}>
      <AppModalPanel className="max-w-[360px] rounded-[4px] p-3">
        <h2 className="mb-3 border-b border-[#ecebe5] pb-3 text-[18px] font-bold text-[#111]">
          Export Settings
        </h2>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[16px] font-semibold text-[#4b4a45]">
              Export as video
            </div>
            <button
              className={cn(
                "flex h-7 w-12 items-center rounded-full p-1 transition",
                exportAsVideo ? "bg-[#4388f7]" : "bg-[#e6e5df]"
              )}
              onClick={() => onExportAsVideoChange(!exportAsVideo)}
              aria-pressed={exportAsVideo}
              aria-label="Toggle export as video"
            >
              <span
                className={cn(
                  "block size-5 rounded-full bg-white shadow-sm transition",
                  exportAsVideo && "translate-x-5"
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-[16px] font-semibold text-[#4b4a45]">
              Sound
            </div>
            <SoundSelector
              selectedSound={selectedSound}
              music={music}
              onSelect={onSoundSelect}
              compact
              variant="sound"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <label
              className="text-[16px] font-semibold text-[#4b4a45]"
              htmlFor="slideshow-export-transition"
            >
              Transition
            </label>
            <SelectControl
              id="slideshow-export-transition"
              className="w-[132px]"
              value={transition}
              onChange={(event) => onTransitionChange(event.target.value)}
            >
              {["Hard Cut", "Fade", "Slide", "Zoom"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectControl>
          </div>
        </div>

        <Button
          variant="action"
          size="lg"
          className="mt-5 w-full"
          onClick={onClose}
        >
          Close
        </Button>
      </AppModalPanel>
    </AppModal>
  )
}

function linkedCollectionImages(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  role: "hook" | "content" | "cta",
  fallbackImages: PinterestSearchResult[]
) {
  const collectionId = automationCollectionId(config, role)
  const collection = findCollectionByIdOrAlias(collections, collectionId)
  return collection?.images.length ? collection.images : fallbackImages
}

function automationHookOptions(config: AutomationSchema) {
  return automationStoredHooks(config)
}

function templatePreviewSlides({
  config,
  collections,
  fallbackImages,
  hook,
}: {
  config: AutomationSchema
  collections: CreatedImageCollection[]
  fallbackImages: PinterestSearchResult[]
  hook: string
}): SlideshowPreviewSlideRecord[] {
  const content = automationFormatSection(config, "content")
  const count = Math.max(1, content.slideCount)
  const images = linkedCollectionImages(
    config,
    collections,
    "content",
    fallbackImages
  )

  return Array.from({ length: count }).map((_, index) => {
    const image =
      images[index % Math.max(1, images.length)] ?? fallbackImages[0]
    const text = index === 0 ? hook : config.title
    return {
      id: `template-preview-${config.title}-${index}`,
      image,
      text,
      duration: 2,
      aspectRatio: normalizeAutomationAspectRatio(content.aspect_ratio),
      layout: automationImageGridToLayout(content.imageGrid),
      textElements: !content.noText
        ? [
            {
              id: `template-preview-text-${index}`,
              text,
              x: 50,
              y: 16,
              font: "Default",
              color: "Yellow Text",
              size: "14px",
            },
          ]
        : [],
    }
  })
}

function schemaWithSelectedHook(
  config: AutomationSchema,
  selectedHook: string
): AutomationSchema {
  const hooks = [
    selectedHook,
    ...automationStoredHooks(config).filter(
      (hook: string) => hook !== selectedHook
    ),
  ].filter(Boolean)

  return schemaWithAutomationHooks(config, hooks)
}

function AutomationSelectorCard({
  automation,
  exampleSlides,
  onClick,
}: {
  automation: Automation | null
  exampleSlides: ReturnType<typeof generatedExampleSlides>
  onClick: () => void
}) {
  return (
    <button
      className="overflow-hidden rounded-[9px] bg-white text-left shadow-sm"
      onClick={onClick}
    >
      <TemplateGeneratedPreview
        exampleSlides={exampleSlides}
        tileCount={4}
        columns={2}
        className="h-[126px]"
      />
      <div className="flex items-center gap-2 px-3 py-3">
        <AvatarDot
          name={automation?.name ?? "Template"}
          index={1}
          className="size-8"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">
            {automation?.name ?? "Automation"}
          </div>
          <div className="truncate text-[10px] font-medium text-[#77766f]">
            Your automation
          </div>
        </div>
        <IconChevronRight className="size-4 text-[#aaa9a2]" />
      </div>
    </button>
  )
}

function ViaPromptPanel({
  prompt,
  promptCollection,
  collections,
  onPromptChange,
  onPromptCollectionChange,
  onCreateCollection,
  onGenerate,
}: {
  prompt: string
  promptCollection?: CreatedImageCollection | null
  collections: CreatedImageCollection[]
  onPromptChange: (value: string) => void
  onPromptCollectionChange: (collectionId: string) => void
  onCreateCollection: (collection: CreatedImageCollection) => void
  onGenerate: () => void
}) {
  return (
    <div className="space-y-2">
      <section className="rounded-[7px] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between text-[13px] font-semibold">
          <div>
            1. Prompt{" "}
            <button className="ml-2 text-[12px] font-medium text-[#77766f] underline">
              Recent
            </button>
          </div>
          <button className="text-[12px] font-medium text-[#55544f]">
            <span className="text-[#e23e44]">●</span> No Product Context
          </button>
        </div>
        <textarea
          className="h-[286px] w-full resize-none bg-transparent text-[14px] outline-none"
          placeholder="Describe the slideshow..."
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
        <Button variant="softControl" className="w-full">
          <IconWand className="size-4" />
          Start with template
        </Button>
      </section>
      <section className="rounded-[7px] bg-white p-4 shadow-sm">
        <div className="mb-2 text-[13px] font-semibold">2. Images</div>
        <CollectionSelector
          label="Images"
          collection={promptCollection ?? undefined}
          collections={collections}
          onChange={onPromptCollectionChange}
          onCreateCollection={onCreateCollection}
        />
      </section>
      <Button className="w-full" onClick={onGenerate}>
        <IconRefresh className="size-4" />
        Generate
      </Button>
    </div>
  )
}
