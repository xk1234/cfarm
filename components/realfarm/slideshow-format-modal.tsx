"use client"

import { useState } from "react"
import type * as React from "react"
import { IconChevronLeft, IconChevronRight, IconList, IconPhoto, IconSwitch, IconX } from "@tabler/icons-react"
import { Expand, Grid2X2, ImagePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FormatLabeledSelect, FormatSelect, SwitchPill } from "@/components/ui/form-controls"
import { PinterestPreviewTile } from "@/components/realfarm/shared-media"
import { SlideshowImagePickerModal, readRecentPinterestSearches } from "@/components/realfarm/slideshow-preview"
import { defaultImageCollections, type CreatedImageCollection } from "@/lib/realfarm-collections"
import type { RealFarmData } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function FormatPickerModal({
  data,
  collections,
  onClose,
  onSelect,
}: {
  data: RealFarmData
  collections: CreatedImageCollection[]
  onClose: () => void
  onSelect: (index: number) => void
}) {
  const formats = data.automations.slice(0, 8)
  const initialCollectionId = collections.find((collection) => !collection.virtual)?.id ?? collections[0]?.id ?? ""
  const [activeTab, setActiveTab] = useState<"Hook" | "Content" | "CTA">("Hook")
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [selectedFormatIndex, setSelectedFormatIndex] = useState(0)
  const [aspectRatio, setAspectRatio] = useState("9:16")
  const [imageGrid, setImageGrid] = useState("None")
  const [overlay, setOverlay] = useState(true)
  const [overlayImage, setOverlayImage] = useState(false)
  const [displayText, setDisplayText] = useState(true)
  const [overlayOpacity, setOverlayOpacity] = useState("10%")
  const [textStyle, setTextStyle] = useState("Light Black BG")
  const [textSize, setTextSize] = useState("16px")
  const [textPosition, setTextPosition] = useState("Center")
  const [textWidth, setTextWidth] = useState("70%")
  const [slideCountMode, setSlideCountMode] = useState("Varying")
  const [slideCountMin, setSlideCountMin] = useState("3")
  const [slideCountMax, setSlideCountMax] = useState("4")
  const [overlayCollectionId, setOverlayCollectionId] = useState(initialCollectionId)
  const [overrideMode, setOverrideMode] = useState<"collection" | "single">("collection")
  const [overrideCollectionId, setOverrideCollectionId] = useState(initialCollectionId)
  const [singleOverrideImage, setSingleOverrideImage] = useState<PinterestSearchResult | null>(null)
  const [overridePickerOpen, setOverridePickerOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const selectedFormat = formats[selectedFormatIndex] ?? formats[0]
  const previewImages = data.defaultCollections.backgrounds.images.slice(selectedFormatIndex, selectedFormatIndex + 5)
  const modalCollections = collections.length > 0 ? collections : defaultImageCollections(data)
  const selectedOverlayCollection = modalCollections.find((collection) => collection.id === overlayCollectionId) ?? modalCollections[0]
  const selectedOverrideCollection = modalCollections.find((collection) => collection.id === overrideCollectionId) ?? modalCollections[0]
  const activeCollectionTitle = activeTab === "Content" ? selectedOverrideCollection?.title : selectedFormat?.name
  const displayedPreviewImages = activeTab === "Content" && selectedOverrideCollection?.images.length ? selectedOverrideCollection.images : previewImages
  const previewText = data.editor.slides[selectedFormatIndex % data.editor.slides.length]?.text ?? selectedFormat?.name ?? "Preview text"
  const selectTab = (tab: "Hook" | "Content" | "CTA") => {
    setActiveTab(tab)
    if (tab === "Content") {
      setViewMode("grid")
      setOverlay(false)
      setOverlayImage(true)
      setTextStyle("White Text")
      setTextSize("12px")
      setTextPosition("Top")
      setTextWidth("80%")
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/45 p-4">
      <section className="grid h-[min(700px,88vh)] w-[min(1040px,calc(100vw-32px))] overflow-hidden rounded-[14px] bg-white shadow-2xl md:grid-cols-[300px_1fr]">
        <aside className="flex min-h-0 flex-col border-r border-[#e1e0d8] bg-[#f7f7f3]">
          <div className="flex h-12 items-center justify-between border-b border-[#e1e0d8] px-3">
            <button className="flex items-center gap-1 text-[13px] font-semibold text-[#5d5c56]" onClick={onClose}>
              <IconChevronLeft className="size-4" />
              Back
            </button>
            <div className="flex gap-1">
              <button
                className={cn("grid size-8 place-items-center rounded-[6px] text-[#4d4c47]", viewMode === "list" ? "bg-white shadow-sm" : "text-[#9b9a92] hover:bg-white")}
                onClick={() => setViewMode("list")}
                aria-label="List view"
              >
                <IconList className="size-4" />
              </button>
              <button
                className={cn("grid size-8 place-items-center rounded-[6px]", viewMode === "grid" ? "bg-white text-[#4d4c47] shadow-sm" : "text-[#9b9a92] hover:bg-white")}
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
              >
                <Grid2X2 className="size-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 border-b border-[#e1e0d8] text-[13px] font-semibold">
            {(["Hook", "Content", "CTA"] as const).map((tab) => (
              <button
                key={tab}
                className={cn("h-11 border-b-2 transition", activeTab === tab ? "border-[#242421] text-[#242421]" : "border-transparent text-[#9a9991]")}
                onClick={() => selectTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <button className="w-full rounded-[8px] bg-white p-3 text-left shadow-sm">
              <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-[#4d4c47]">
                <span>{activeTab} <IconChevronRight className="inline size-4" /></span>
                <span className="max-w-[130px] truncate text-[12px] text-[#9a9991]">{activeCollectionTitle ?? "Ingame photos"}</span>
              </div>
              <div className="grid h-[58px] grid-cols-4 overflow-hidden rounded-[4px] bg-[#e7e6df]">
                {displayedPreviewImages.slice(0, 4).map((image, index) => (
                  <PinterestPreviewTile key={`${image.id}-${index}`} image={image} index={index} className="h-full rounded-none" />
                ))}
              </div>
            </button>

            <div className="mt-4 space-y-3">
              {activeTab === "Content" && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#4d4c47]">
                    <IconSwitch className="size-3.5 text-[#9a9991]" />
                    Slide count
                  </div>
                  <div className="grid grid-cols-[1fr_54px_54px] gap-2">
                    <FormatSelect value={slideCountMode} options={["Varying", "Static"]} onChange={setSlideCountMode} />
                    <input
                      className="h-8 rounded-[7px] border border-[#ebeae3] bg-white px-2 text-center text-[12px] font-semibold outline-none"
                      value={slideCountMin}
                      onChange={(event) => setSlideCountMin(event.target.value)}
                      aria-label="Minimum slide count"
                    />
                    <input
                      className="h-8 rounded-[7px] border border-[#ebeae3] bg-white px-2 text-center text-[12px] font-semibold outline-none"
                      value={slideCountMax}
                      onChange={(event) => setSlideCountMax(event.target.value)}
                      aria-label="Maximum slide count"
                    />
                  </div>
                  <p className="mt-1 text-[10px] font-medium leading-4 text-[#9a9991]">
                    Each generation picks a random count between {slideCountMin}-{slideCountMax}. Listicle hooks can override this.
                  </p>
                </div>
              )}
              <FormatSettingRow label="Aspect Ratio" icon={<Expand className="size-3.5" />}>
                <FormatSelect value={aspectRatio} options={["9:16", "4:5", "3:4", "1:1"]} onChange={setAspectRatio} />
              </FormatSettingRow>
              <FormatSettingRow label="Image Grid" icon={<Grid2X2 className="size-3.5" />}>
                <FormatSelect value={imageGrid} options={["None", "1:2", "1:3", "2:1", "2:2"]} onChange={setImageGrid} />
              </FormatSettingRow>
              <FormatSettingRow label="Overlay">
                <button onClick={() => setOverlay((value) => !value)} aria-label="Toggle overlay">
                  <SwitchPill enabled={overlay} />
                </button>
              </FormatSettingRow>
              {(activeTab !== "Content" || overlay) && (
                <div className="flex w-full items-center justify-between rounded-[7px] px-1 py-1 text-left">
                  <span className="text-[13px] font-semibold text-[#4d4c47]">Overlay Opacity</span>
                  <FormatSelect value={overlayOpacity} options={["0%", "10%", "25%", "50%", "75%"]} onChange={setOverlayOpacity} />
                </div>
              )}
              {activeTab === "Content" && (
                <>
                  <FormatSettingRow label="Overlay Image" icon={<IconPhoto className="size-3.5" />}>
                    <button onClick={() => setOverlayImage((value) => !value)} aria-label="Toggle overlay image">
                      <SwitchPill enabled={overlayImage} />
                    </button>
                  </FormatSettingRow>
                  {overlayImage && selectedOverlayCollection && (
                    <FormatCollectionCard
                      title={selectedOverlayCollection.title}
                      images={selectedOverlayCollection.images}
                      collections={modalCollections}
                      value={selectedOverlayCollection.id}
                      onChange={setOverlayCollectionId}
                      suffix={`${Math.max(0, selectedOverlayCollection.images.length - 4) > 0 ? `+${selectedOverlayCollection.images.length - 4}` : ""}`}
                    />
                  )}
                </>
              )}
              {activeTab !== "Content" && (
                <FormatSettingRow label="Display text" icon={<span className="text-[13px] font-semibold">T</span>}>
                  <button onClick={() => setDisplayText((value) => !value)} aria-label="Toggle display text">
                    <SwitchPill enabled={displayText} />
                  </button>
                </FormatSettingRow>
              )}
            </div>

            <button
              className="mt-4 flex w-full items-center justify-between text-[12px] font-semibold text-[#8b8a83]"
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              Advanced
              <IconChevronRight className={cn("size-4 transition", advancedOpen && "rotate-90")} />
            </button>

            {advancedOpen && activeTab === "Content" && (
              <div className="mt-3 space-y-3 rounded-[8px] bg-white p-3 shadow-sm">
                <FormatSettingRow label="Display text" icon={<span className="text-[13px] font-semibold">T</span>}>
                  <button onClick={() => setDisplayText((value) => !value)} aria-label="Toggle display text">
                    <SwitchPill enabled={displayText} />
                  </button>
                </FormatSettingRow>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold text-[#4d4c47]">Image overrides</div>
                    <FormatSelect value={overrideMode} options={["collection", "single"]} onChange={(value) => setOverrideMode(value as "collection" | "single")} />
                  </div>
                  {overrideMode === "collection" && selectedOverrideCollection ? (
                    <FormatCollectionCard
                      compact
                      title={`Random from ${selectedOverrideCollection.title}`}
                      images={selectedOverrideCollection.images}
                      collections={modalCollections}
                      value={selectedOverrideCollection.id}
                      onChange={setOverrideCollectionId}
                    />
                  ) : (
                    <button
                      className="flex h-14 w-full items-center gap-3 rounded-[7px] border border-dashed border-[#deddd5] bg-[#fbfbf8] px-3 text-left text-[12px] font-semibold text-[#686761]"
                      onClick={() => setOverridePickerOpen(true)}
                    >
                      {singleOverrideImage ? (
                        <PinterestPreviewTile image={singleOverrideImage} index={0} className="h-10 w-10 rounded-[4px]" />
                      ) : (
                        <span className="grid size-10 place-items-center rounded-[4px] bg-white text-[#8b8a83]">
                          <ImagePlus className="size-5" />
                        </span>
                      )}
                      {singleOverrideImage ? "Single image override selected" : "Choose single image override"}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {formats.slice(0, 5).map((format, index) => (
                <button
                  key={format.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[7px] px-2 py-2 text-left transition",
                    selectedFormatIndex === index ? "bg-white shadow-sm" : "hover:bg-white/70"
                  )}
                  onClick={() => setSelectedFormatIndex(index)}
                >
                  <div className="grid h-9 w-14 grid-cols-3 overflow-hidden rounded-[4px] bg-[#ddd]">
                    {data.defaultCollections.backgrounds.images.slice(index, index + 3).map((image, imageIndex) => (
                      <PinterestPreviewTile key={`${image.id}-${imageIndex}`} image={image} index={imageIndex} className="h-full rounded-none" />
                    ))}
                  </div>
                  <span className="min-w-0 truncate text-[12px] font-semibold">{format.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#e1e0d8] p-3">
            <Button
              className="h-10 w-full rounded-[7px] bg-[#ff5626] text-[13px] font-semibold text-white hover:bg-[#ed4d22]"
              onClick={() => onSelect(selectedFormatIndex)}
            >
              Save Changes
            </Button>
          </div>
        </aside>

        <div className="relative min-h-0 overflow-hidden bg-[#b8b8b5] p-6">
          <button className="absolute right-5 top-5 z-20 grid size-8 place-items-center rounded-full bg-white/80 text-[#4d4c47] hover:bg-white" onClick={onClose} aria-label="Close format picker">
            <IconX className="size-5" />
          </button>
          <div className="flex h-full flex-col">
            <div className={cn("min-h-0 flex-1 overflow-hidden", viewMode === "grid" ? "grid grid-cols-3 content-center gap-2 py-8" : "flex items-center gap-7 pl-20")}>
              {(viewMode === "grid" ? [0, 1, 2, 3, 4] : [0, 1, 2]).map((offset) => {
                const imageSource = activeTab === "Content" && selectedOverrideCollection?.images.length ? selectedOverrideCollection.images : displayedPreviewImages
                const image = imageSource[offset % Math.max(1, imageSource.length)] ?? data.defaultCollections.backgrounds.images[offset]
                const overlayImageItem = selectedOverlayCollection?.images[offset % Math.max(1, selectedOverlayCollection.images.length)]
                const isActive = offset === 0
                return (
                  <FormatPreviewCard
                    key={`${image?.id}-${offset}-${viewMode}`}
                    image={image}
                    overlayImage={overlayImage ? overlayImageItem : undefined}
                    text={previewText}
                    showText={displayText}
                    overlay={overlay}
                    overlayOpacity={overlayOpacity}
                    textStyle={textStyle}
                    textSize={textSize}
                    textPosition={textPosition}
                    textWidth={textWidth}
                    active={isActive}
                    compact={viewMode === "grid"}
                  />
                )
              })}
            </div>
            <div className="mx-auto mb-6 flex gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className={cn("size-2 rounded-full", index === 0 ? "bg-white" : "bg-white/55")} />
              ))}
            </div>
            <div className="rounded-[10px] bg-white p-4 shadow-lg">
              <div className="grid gap-3 md:grid-cols-3">
                <FormatLabeledSelect label="Font" value="Default" options={["Default", "Bebas Neue", "Elegance", "Elegance Italic"]} />
                <FormatLabeledSelect label="Style" value={textStyle} options={["Outline", "White Text", "Black Text", "Yellow Text", "Light Black BG"]} onChange={setTextStyle} />
                <FormatLabeledSelect label="Size" value={textSize} options={["8px", "12px", "14px", "16px", "18px", "20px"]} onChange={setTextSize} />
                <FormatLabeledSelect label="Position" value={textPosition} options={["Top", "Center", "Bottom"]} onChange={setTextPosition} />
                <FormatLabeledSelect label="Width" value={textWidth} options={["50%", "70%", "80%", "90%", "100%"]} onChange={setTextWidth} />
              </div>
              <div className="mt-3 flex items-center justify-between text-[12px] font-semibold text-[#8b8a83]">
                <button>Advanced⌄</button>
                <button className="text-[#2f7df1]">+ Add text</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      {overridePickerOpen && (
        <SlideshowImagePickerModal
          collections={modalCollections}
          recentSearches={readRecentPinterestSearches()}
          onClose={() => setOverridePickerOpen(false)}
          onSelect={(image) => {
            setSingleOverrideImage(image)
            setOverridePickerOpen(false)
          }}
        />
      )}
    </div>
  )
}

function FormatCollectionCard({
  title,
  images,
  collections,
  value,
  onChange,
  suffix,
  compact,
}: {
  title: string
  images: PinterestSearchResult[]
  collections: CreatedImageCollection[]
  value: string
  onChange: (value: string) => void
  suffix?: string
  compact?: boolean
}) {
  return (
    <div className={cn("rounded-[8px] bg-white p-3 shadow-sm", compact && "bg-[#fbfbf8] p-2 shadow-none")}>
      <div className="relative mb-2 flex items-center justify-between gap-2">
        <select
          className="h-7 min-w-0 flex-1 appearance-none truncate rounded-[6px] bg-transparent pr-7 text-[12px] font-semibold text-[#4d4c47] outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${title} collection`}
        >
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>{collection.title}</option>
          ))}
        </select>
        <IconChevronRight className="pointer-events-none absolute right-0 top-1.5 size-4 text-[#aaa9a2]" />
      </div>
      <div className="flex items-center gap-1 overflow-hidden">
        {images.slice(0, 4).map((image, index) => (
          <PinterestPreviewTile key={`${image.id}-${index}`} image={image} index={index} className="h-8 w-8 rounded-[3px]" />
        ))}
        {suffix && (
          <span className="grid h-8 min-w-8 place-items-center rounded-[3px] bg-[#ecebe4] px-1 text-[10px] font-bold text-[#77766f]">{suffix}</span>
        )}
      </div>
    </div>
  )
}

function FormatPreviewCard({
  image,
  overlayImage,
  text,
  showText,
  overlay,
  overlayOpacity,
  textStyle,
  textSize,
  textPosition,
  textWidth,
  active,
  compact,
}: {
  image?: PinterestSearchResult
  overlayImage?: PinterestSearchResult
  text: string
  showText: boolean
  overlay: boolean
  overlayOpacity: string
  textStyle: string
  textSize: string
  textPosition: string
  textWidth: string
  active: boolean
  compact?: boolean
}) {
  const textTop = textPosition === "Top" ? "12%" : textPosition === "Bottom" ? "72%" : "42%"
  const parsedTextSize = Number.parseInt(textSize, 10)
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[3px] bg-[#777]",
        compact ? "h-[198px] w-full" : active ? "h-[360px] w-[202px] shadow-xl ring-2 ring-white" : "h-[320px] w-[180px] opacity-80"
      )}
    >
      {image && <PinterestPreviewTile image={image} index={0} className="h-full rounded-none" />}
      {overlayImage && (
        <div className="absolute inset-0 opacity-45 mix-blend-screen">
          <PinterestPreviewTile image={overlayImage} index={1} className="h-full rounded-none" />
        </div>
      )}
      {overlay && <div className="absolute inset-0 bg-black/20" style={{ opacity: Number.parseInt(overlayOpacity, 10) / 100 + 0.08 }} />}
      {showText && (
        <div
          className={cn(
            "font-tiktok absolute left-1/2 rounded-[3px] px-2 py-1 text-center font-bold leading-tight text-white drop-shadow",
            textStyle === "Light Black BG" && "bg-black/35",
            textStyle === "Yellow Text" && "text-[#ffe36a]",
            textStyle === "Black Text" && "text-black drop-shadow-none",
            textStyle === "Outline" && "text-white"
          )}
          style={{
            top: textTop,
            width: textWidth,
            transform: "translateX(-50%)",
            fontSize: compact ? Math.max(8, parsedTextSize - 2) : parsedTextSize,
          }}
        >
          {text}
        </div>
      )}
    </div>
  )
}

function FormatSettingRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#4d4c47]">
        <span className="text-[#9a9991]">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  )
}
