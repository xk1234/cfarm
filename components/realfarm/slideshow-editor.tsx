"use client"

import { useState } from "react"
import { DateTime } from "luxon"
import { IconChevronLeft, IconChevronRight, IconList, IconPlus, IconRefresh, IconWand } from "@tabler/icons-react"
import { Expand, Shrink, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BuilderStep, SoundSelector } from "@/components/realfarm/creator-ui"
import { AvatarDot, PinterestPreviewTile } from "@/components/realfarm/shared-media"
import { FormatPickerModal } from "@/components/realfarm/slideshow-format-modal"
import {
  DefaultSlideTile,
  ExportedSlideshows,
  HookSelectorModal,
  QuickPublishModal,
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
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { LocalAsset, RealFarmData } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function EditorView({
  data,
  collections,
  selectedSound,
  music,
  onSoundSelect,
  onCreate,
}: {
  data: RealFarmData
  collections: CreatedImageCollection[]
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  onSoundSelect: (id: string) => void
  onCreate: () => void
}) {
  const hookOptions = [
    "ways i learned to be okay with where i'm at right now",
    "how i made my brain stop spiraling every time something goes wrong",
    "things i stopped forcing myself to do that made life easier.",
    "stuff i do now when i'm bored that doesn't make me feel empty after",
    "how i got comfortable being quiet without feeling awkward",
    "things i realized were making me feel worse that i thought were helping",
    "6 small lies i stopped telling myself that changed everything",
  ]
  const [selectedHook, setSelectedHook] = useState(hookOptions[6])
  const [editorMode, setEditorMode] = useState<"new" | "prompt">("new")
  const [promptText, setPromptText] = useState("")
  const [activeSlide, setActiveSlide] = useState(0)
  const [hookOpen, setHookOpen] = useState(false)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [editingTextSnapshot, setEditingTextSnapshot] = useState<SlideshowTextElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [imagePickerTarget, setImagePickerTarget] = useState<number | "append" | null>(null)
  const [formatPickerOpen, setFormatPickerOpen] = useState(false)
  const [formatOffset, setFormatOffset] = useState(0)
  const [exportSettingsOpen, setExportSettingsOpen] = useState(false)
  const [exportAsVideo, setExportAsVideo] = useState(true)
  const [exportTransition, setExportTransition] = useState("Hard Cut")
  const [previewSlides, setPreviewSlides] = useState<SlideshowPreviewSlideRecord[]>(() =>
    data.defaultCollections.backgrounds.images.slice(0, 3).map((image, index) => ({
      id: `preview-${image.id}`,
      image,
      text: index === 0 ? hookOptions[6] : data.editor.slides[index]?.text ?? hookOptions[6],
      duration: 2,
      aspectRatio: "3:4",
      layout: "single" as SlideshowLayoutOption,
      textElements: [
        {
          id: `text-${index}`,
          text: index === 0 ? hookOptions[6] : data.editor.slides[index]?.text ?? hookOptions[6],
          x: 50,
          y: 45,
          font: "Default",
          color: "Yellow Text",
          size: "14px",
        },
      ],
    }))
  )
  const [quickPublishOpen, setQuickPublishOpen] = useState(false)
  const [exportedSlideshows, setExportedSlideshows] = useState<ExportedSlideshow[]>([])
  const formatImages = data.defaultCollections.backgrounds.images.slice(formatOffset, formatOffset + 4)
  const activeSlideRecord = previewSlides[activeSlide] ?? previewSlides[0]
  const selectedText = selectedTextId ? activeSlideRecord?.textElements.find((element) => element.id === selectedTextId) ?? null : null
  const selectedHookPosition = Math.max(0, hookOptions.indexOf(selectedHook))
  const previewBaseSlideWidth = 300
  const previewMaxZoom = 2
  const previewSlideWidth = previewBaseSlideWidth * zoom
  const previewSlideGap = 72
  const previewTrackOffset = activeSlide * (previewSlideWidth + previewSlideGap) + previewSlideWidth / 2
  const previewMaxSlideHeight = Math.ceil(previewBaseSlideWidth * previewMaxZoom * ratioHeightMultiplier(activeSlideRecord?.aspectRatio ?? "3:4"))
  const previewStageMinHeight = previewMaxSlideHeight + 56
  const previewEditorMinHeight = previewStageMinHeight + 220
  const hasDefaultSlides = previewSlides.some((slide) => slide.isPlaceholder)

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
                element.id === selectedTextId ? { ...element, ...patch } : element
              ),
            }
          : slide
      )
    )
  }

  function beginTextEdit(id: string) {
    const element = previewSlides[activeSlide]?.textElements.find((item) => item.id === id)
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
              textElements: slide.textElements.filter((element) => element.id !== selectedTextId),
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

  function replacePreviewImage(slideIndex: number, image: PinterestSearchResult) {
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
      current.map((slide, index) => index === activeSlide ? { ...slide, ...patch } : slide)
    )
  }

  function selectHook(hook: string) {
    setSelectedHook(hook)
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
    setActiveSlide(0)
    setSelectedTextId(null)
    setHookOpen(false)
  }

  function applyFormat(formatIndex: number) {
    const nextOffset = (formatIndex * 3) % Math.max(1, data.defaultCollections.backgrounds.images.length - 3)
    const nextImages = data.defaultCollections.backgrounds.images.slice(nextOffset, nextOffset + Math.max(3, previewSlides.length))
    setFormatOffset(nextOffset)
    setPreviewSlides((current) =>
      current.map((slide, index) => ({
        ...slide,
        image: nextImages[index % nextImages.length] ?? slide.image,
        layout: formatIndex % 3 === 0 ? "single" : formatIndex % 3 === 1 ? "2:2" : "1:2",
        aspectRatio: formatIndex % 2 === 0 ? "3:4" : "9:16",
      }))
    )
    setFormatPickerOpen(false)
  }

  function generateFromPrompt() {
    const prompt = promptText.trim() || "Test"
    const images = data.defaultCollections.backgrounds.images.slice(0, 4)
    const nextSlides = images.slice(0, 3).map((image, index) => ({
      id: `prompt-${Date.now()}-${index}`,
      image,
      text: prompt,
      duration: 2,
      aspectRatio: "3:4",
      layout: "single" as SlideshowLayoutOption,
      textElements: [
        {
          id: `prompt-text-${Date.now()}-${index}`,
          text: index === 0 ? prompt : data.editor.slides[index]?.text ?? prompt,
          x: 50,
          y: 45,
          font: "Default",
          color: "Outline",
          size: "12px",
        },
      ],
    }))
    setSelectedHook(prompt)
    setPreviewSlides(nextSlides)
    setExportedSlideshows((current) => [
      {
        id: `export-prompt-${Date.now()}`,
        title: prompt,
        createdAt: DateTime.now().toISO(),
        slides: nextSlides,
      },
      ...current,
    ])
    setActiveSlide(0)
    setSelectedTextId(null)
    setEditingTextSnapshot(null)
  }

  function exportCurrentSlideshow() {
    if (hasDefaultSlides) {
      return
    }

    setExportedSlideshows((current) => [
      {
        id: `export-${Date.now()}`,
        title: selectedHook,
        createdAt: DateTime.now().toISO(),
        slides: previewSlides,
      },
      ...current,
    ])
  }

  return (
    <div className="mx-auto max-w-[1240px]">
      <section
        className={cn("grid overflow-hidden rounded-[13px] border border-[#d9d8d0] bg-[#f1f1ed] shadow-sm", expanded ? "lg:grid-cols-[1fr]" : "lg:grid-cols-[320px_1fr]")}
        style={{ minHeight: previewEditorMinHeight }}
      >
        {!expanded && (
        <aside className="border-r border-[#deddd5] bg-[#f8f8f4] p-5">
          <div className="mb-7 flex items-center justify-between">
            <h1 className="text-[20px] font-semibold tracking-normal">Generate Slideshows</h1>
            <div className="flex rounded-[9px] bg-[#f0f0ec] p-1 text-[12px] font-semibold text-[#77766f]">
              <button className={cn("rounded-[7px] px-3 py-1.5", editorMode === "new" && "bg-white text-[#242421] shadow-sm")} onClick={() => setEditorMode("new")}>New</button>
              <button className={cn("rounded-[7px] px-3 py-1.5", editorMode === "prompt" && "bg-white text-[#242421] shadow-sm")} onClick={() => setEditorMode("prompt")}>Via Prompt</button>
            </div>
          </div>

          {editorMode === "new" ? (
            <>
              <BuilderStep
                title="Hook"
                labelPrefix="1."
                count={`${selectedHookPosition + 1}/${Math.max(1, hookOptions.length)}`}
                actions={<button className="flex items-center gap-1 text-[11px] font-semibold text-[#696862]" onClick={() => setHookOpen(true)}><IconList className="size-3.5" />All Hooks</button>}
              >
                <div className="flex h-[88px] items-center rounded-[15px] bg-white px-3 text-[14px] font-semibold leading-5 shadow-sm">
                  <IconChevronLeft className="size-4 shrink-0 text-[#a09f98]" />
                  <button className="min-w-0 flex-1 px-3 text-center" onClick={() => setActiveSlide(0)}>
                    {selectedHook}
                  </button>
                  <IconChevronRight className="size-4 shrink-0 text-[#a09f98]" />
                </div>
              </BuilderStep>

              <div className="mt-7">
                <BuilderStep
                  title="Slideshow Format"
                  labelPrefix="2."
                  actions={
                    <button className="flex items-center gap-1 text-[11px] text-[#696862]" onClick={() => setFormatPickerOpen(true)}>
                      <IconRefresh className="size-3" />
                      Change format
                    </button>
                  }
                >
                  <SlideshowFormatCard images={formatImages} hook={selectedHook} />
                </BuilderStep>
              </div>

              <Button
                variant="action"
                size="largeAction"
                className="mt-5 w-full rounded-[9px] text-[14px]"
                disabled={hasDefaultSlides}
                onClick={() => {
                  exportCurrentSlideshow()
                  onCreate()
                }}
              >
                <IconWand className="size-4" />
                <span className="leading-tight">
                  Generate Slideshow
                  <span className="block text-[10px] font-medium text-white/80">0 credits</span>
                </span>
              </Button>
            </>
          ) : (
            <ViaPromptPanel
              prompt={promptText}
              images={data.defaultCollections.backgrounds.images.slice(0, 4)}
              onPromptChange={setPromptText}
              onGenerate={generateFromPrompt}
            />
          )}
        </aside>
        )}

        <div className="relative min-w-0 bg-[#e9e9e5] p-5" style={{ minHeight: previewEditorMinHeight }}>
          <label className="absolute left-5 top-4 flex items-start gap-2 text-[11px] font-semibold text-[#8b8a83]">
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
            <span className="absolute left-12 top-6">{zoom.toFixed(1)}x</span>
          </label>
          <div className="absolute left-1/2 top-6 -translate-x-1/2 text-[12px] font-semibold text-[#94938b]">Preview Editor</div>
          <button className="absolute right-5 top-5 flex items-center gap-1 text-[11px] font-semibold text-[#94938b]" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Collapse View" : "Expand View"}
            {expanded ? <Shrink className="size-3.5" /> : <Expand className="size-3.5" />}
          </button>

          <div className="overflow-x-hidden overflow-y-visible pt-14" style={{ minHeight: previewStageMinHeight }}>
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
                    className={cn("shrink-0 cursor-pointer transition-opacity duration-300", activeSlide === slideIndex ? "opacity-100" : "opacity-55")}
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
                                  textElements: currentSlide.textElements.map((element) =>
                                    element.id === id ? { ...element, ...position } : element
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
                      onDurationChange={(duration) => updateActiveSlide({ duration })}
                      onAspectRatioChange={(aspectRatio) => updateActiveSlide({ aspectRatio })}
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

          <div className="absolute bottom-[92px] left-5 right-5 flex justify-center">
            <div className="flex items-center gap-2">
                {previewSlides.map((slide, index) => (
                  <button
                    key={slide.id}
                    className={cn("h-10 w-10 overflow-hidden rounded-[7px] border-2 shadow-sm", activeSlide === index ? "border-[#2f7df1]" : "border-white")}
                    onClick={() => {
                      setActiveSlide(index)
                      setSelectedTextId(null)
                    }}
                  >
                    {slide.isPlaceholder ? (
                      <DefaultSlideTile className="h-full rounded-none" />
                    ) : (
                      <PinterestPreviewTile image={slide.image} index={index} className="h-full rounded-none" />
                    )}
                  </button>
                ))}
                <Button
                  variant="softControl"
                  size="icon-lg"
                  className="rounded-[8px] text-[#242421]"
                  onClick={addDefaultSlide}
                  aria-label="Add slide"
                >
                  <IconPlus className="size-5" />
                </Button>
            </div>
          </div>
          {selectedText ? (
            <div className="absolute bottom-5 left-5 right-5 grid grid-cols-2 items-center gap-5">
              <Button variant="softControl" size="dialogAction" className="rounded-[10px]" onClick={cancelTextEdit}>
                Cancel edits
              </Button>
              <Button variant="action" size="dialogAction" className="rounded-[10px]" onClick={saveTextEdit}>
                Save
              </Button>
            </div>
          ) : (
            <div className="absolute bottom-5 left-5 right-5 grid grid-cols-[64px_1fr] items-center gap-5">
              <Button
                variant="softControl"
                size="icon-lg"
                className="size-14 rounded-[10px] text-[#242421]"
                aria-label="Slideshow export settings"
                onClick={() => setExportSettingsOpen(true)}
              >
                <SlidersHorizontal className="size-7" />
              </Button>
              <Button
                variant="action"
                size="dialogAction"
                className="rounded-[10px] bg-[#ff9a84] text-[22px] hover:bg-app-action disabled:cursor-not-allowed disabled:opacity-45"
                disabled={hasDefaultSlides}
                onClick={exportCurrentSlideshow}
              >
                Export
              </Button>
            </div>
          )}
        </div>
      </section>
      <ExportedSlideshows
        items={exportedSlideshows}
        onQuickPublish={() => setQuickPublishOpen(true)}
      />
      {hookOpen && (
        <HookSelectorModal
          hooks={hookOptions}
          selectedHook={selectedHook}
          onSelect={selectHook}
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
          collections={collections}
          onClose={() => setFormatPickerOpen(false)}
          onSelect={applyFormat}
        />
      )}
      {quickPublishOpen && <QuickPublishModal onClose={() => setQuickPublishOpen(false)} />}
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/25 p-4">
      <section className="w-full max-w-[360px] rounded-[4px] bg-white p-3 shadow-2xl">
        <h2 className="mb-3 border-b border-[#ecebe5] pb-3 text-[18px] font-bold text-[#111]">Export Settings</h2>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[16px] font-semibold text-[#4b4a45]">Export as video</div>
            <button
              className={cn("flex h-7 w-12 items-center rounded-full p-1 transition", exportAsVideo ? "bg-[#4388f7]" : "bg-[#e6e5df]")}
              onClick={() => onExportAsVideoChange(!exportAsVideo)}
              aria-pressed={exportAsVideo}
              aria-label="Toggle export as video"
            >
              <span className={cn("block size-5 rounded-full bg-white shadow-sm transition", exportAsVideo && "translate-x-5")} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-[16px] font-semibold text-[#4b4a45]">Sound</div>
            <SoundSelector
              selectedSound={selectedSound}
              music={music}
              onSelect={onSoundSelect}
              compact
              variant="sound"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="text-[16px] font-semibold text-[#4b4a45]" htmlFor="slideshow-export-transition">
              Transition
            </label>
            <select
              id="slideshow-export-transition"
              className="h-10 w-[132px] rounded-[6px] border border-[#111] bg-white px-3 text-[15px] font-medium outline-none"
              value={transition}
              onChange={(event) => onTransitionChange(event.target.value)}
            >
              {["Hard Cut", "Fade", "Slide", "Zoom"].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <Button variant="action" size="lg" className="mt-5 w-full rounded-[10px] text-[14px] font-semibold" onClick={onClose}>
          Close
        </Button>
      </section>
    </div>
  )
}

function SlideshowFormatCard({ images, hook }: { images: PinterestSearchResult[]; hook: string }) {
  return (
    <button className="overflow-hidden rounded-[9px] bg-white text-left shadow-sm">
      <div className="grid h-[126px] grid-cols-2">
        {images.map((image, index) => (
          <div key={image.id} className="relative overflow-hidden">
            <PinterestPreviewTile image={image} index={index} className="h-full rounded-none" />
            <div className="absolute inset-0 bg-black/15" />
            <div className="font-tiktok absolute inset-x-2 top-[42%] text-center text-[8px] font-bold leading-tight text-white drop-shadow">
              {hook}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-3">
        <AvatarDot name="Horizontal Girl" index={1} className="size-8" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">Horizontal Girl (@audrey.kins) <span className="text-[#f2bd32]">★</span></div>
          <div className="truncate text-[10px] font-medium text-[#77766f]">@audrey.kins</div>
        </div>
        <IconChevronRight className="size-4 text-[#aaa9a2]" />
      </div>
    </button>
  )
}

function ViaPromptPanel({
  prompt,
  images,
  onPromptChange,
  onGenerate,
}: {
  prompt: string
  images: PinterestSearchResult[]
  onPromptChange: (value: string) => void
  onGenerate: () => void
}) {
  return (
    <div className="space-y-2">
      <section className="rounded-[7px] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between text-[13px] font-semibold">
          <div>
            1. Prompt <button className="ml-2 text-[12px] font-medium underline text-[#77766f]">Recent</button>
          </div>
          <button className="text-[12px] font-medium text-[#55544f]"><span className="text-[#e23e44]">●</span> No Product Context</button>
        </div>
        <textarea
          className="h-[286px] w-full resize-none bg-transparent text-[14px] outline-none"
          placeholder="Describe the slideshow..."
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
        <Button variant="softControl" className="h-11 w-full rounded-[6px] text-[15px] font-semibold">
          <IconWand className="size-4" />
          Start with template
        </Button>
      </section>
      <section className="rounded-[7px] bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-[13px] font-semibold">
          2. Images
          <span className="text-[12px] font-medium text-[#5f5e58]"><span className="text-[#24b75f]">●</span> Community: Pinterest - NYC Lifestyle</span>
        </div>
        <div className="grid h-[92px] grid-cols-4 overflow-hidden rounded-[2px]">
          {images.map((image, index) => (
            <PinterestPreviewTile key={image.id} image={image} index={index} className="h-full rounded-none" />
          ))}
        </div>
      </section>
      <Button className="h-12 w-full rounded-[9px] bg-[#ff5626] text-[15px] font-semibold text-white hover:bg-[#ed4d22]" onClick={onGenerate}>
        <IconRefresh className="size-4" />
        Generate
      </Button>
    </div>
  )
}

