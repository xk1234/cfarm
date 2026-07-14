import { useEffect, useState } from "react"
import { IconChevronLeft, IconVideo } from "@tabler/icons-react"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { SoundSelector } from "@/components/realfarm/creator-ui"
import { PinterestPreviewTile } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import {
  defaultAutomationTextItem,
  type AutomationSchema,
  type AutomationTextItem,
  type AutomationVideoFormat,
  type AutomationVideoSegment,
  type AutomationVideoTemplateId,
} from "@/lib/realfarm-automation"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import { previewTextForTextItem } from "@/lib/realfarm-preview-text"
import { randomTikTokSoundLabel } from "@/lib/slideshow-publishing-config"
import {
  videoAutomationTemplatePreset,
  videoAutomationTemplatePresets,
  videoSegmentPlaysFull,
} from "@/lib/video-automation-templates"
import { cn } from "@/lib/utils"

import { AutomationFormatTextToolbar } from "./format-text-toolbar"
import { resolveMediaCollection } from "./automation-video-generation"
import { DemoVideoSelector } from "./demo-video-selector"
import {
  videoAutomationPreviewTextHighlightStyle,
  videoAutomationPreviewTextStyle,
} from "./video-format-helpers"

type TextTarget = { scope: "global" | "segment"; segmentId?: string }
type SlideshowAutomationOption = { id: string; name: string }

export function VideoTemplateFormatPanel({
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
  const format =
    config.video_format ?? videoAutomationTemplatePreset("ugc_ad").buildFormat()
  const preset = videoAutomationTemplatePreset(format.template)
  const [selectedTarget, setSelectedTarget] = useState<TextTarget>(
    format.segments.length > 0
      ? { scope: "segment", segmentId: format.segments[0].id }
      : { scope: "global" }
  )
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(
    null
  )
  const [slideshowAutomations, setSlideshowAutomations] = useState<
    SlideshowAutomationOption[]
  >([])

  useEffect(() => {
    if (format.template !== "birdseye_pov") return
    void fetchJsonWithTimeout<{
      records?: Array<{
        id: string
        name: string
        schema?: { automationKind?: string }
      }>
    }>("/api/automations", { toastOnError: false })
      .then((payload) =>
        setSlideshowAutomations(
          (payload.records ?? [])
            .filter(
              (record) =>
                record.id !== automation.id &&
                record.schema?.automationKind !== "video"
            )
            .map((record) => ({ id: record.id, name: record.name }))
        )
      )
      .catch(() => setSlideshowAutomations([]))
  }, [automation.id, format.template])

  const selectedSegment =
    selectedTarget.scope === "segment"
      ? (format.segments.find(
          (segment) => segment.id === selectedTarget.segmentId
        ) ?? format.segments[0])
      : null
  const activeTextItems = selectedSegment
    ? selectedSegment.textItems
    : format.globalTextItems
  const activeTextItem =
    activeTextItems[selectedTextIndex ?? 0] ?? activeTextItems[0]
  const selectedAutomationSound =
    music.find(
      (sound) => sound.id === config.tiktok_post_settings.slideshow_sound_id
    ) ??
    (selectedSound?.id === config.tiktok_post_settings.slideshow_sound_id
      ? selectedSound
      : null)

  const previewSegment = selectedSegment ?? format.segments[0]
  const previewImage =
    previewSegment && previewSegment.mediaSource === "collection"
      ? (resolveMediaCollection(
          collections,
          previewSegment.collectionId,
          previewSegment.mediaKind
        )?.images[0] ?? null)
      : null
  const previewDemo =
    previewSegment?.mediaSource === "demo_asset"
      ? demoVideos.find((video) => video.id === previewSegment.demoAssetId)
      : null

  function patchFormat(patch: Partial<AutomationVideoFormat>) {
    onConfigChange({
      ...config,
      tiktok_post_settings: {
        ...config.tiktok_post_settings,
        publish_type: "video",
      },
      video_format: { ...format, ...patch },
    })
  }

  function switchTemplate(templateId: AutomationVideoTemplateId) {
    const nextFormat = videoAutomationTemplatePreset(templateId).buildFormat()
    onConfigChange({
      ...config,
      video_format: nextFormat,
    })
    setSelectedTarget(
      nextFormat.segments.length > 0
        ? { scope: "segment", segmentId: nextFormat.segments[0].id }
        : { scope: "global" }
    )
    setSelectedTextIndex(null)
  }

  function updateSegment(
    segmentId: string,
    patch: Partial<AutomationVideoSegment>
  ) {
    patchFormat({
      segments: format.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, ...patch } : segment
      ),
    })
  }

  function updateSelectedSound(id: string, sound?: LocalAsset | null) {
    const selected = sound ?? music.find((item) => item.id === id) ?? null
    onConfigChange({
      ...config,
      tiktok_post_settings: {
        ...config.tiktok_post_settings,
        publish_type: "video",
        slideshow_sound_id: selected?.id ?? "",
        slideshow_sound_name: selected?.name ?? "",
        slideshow_sound_url: selected?.url ?? "",
      },
    })
  }

  function updateActiveTextItem(patch: Partial<AutomationTextItem>) {
    const textIndex = Math.min(
      selectedTextIndex ?? 0,
      Math.max(0, activeTextItems.length - 1)
    )
    const nextItems = activeTextItems.map((item, index) =>
      index === textIndex ? { ...item, ...patch } : item
    )
    applyActiveTextItems(nextItems)
  }

  function addTextItem() {
    const next = defaultAutomationTextItem({
      fontSize: "8px",
      textStyle: "outline",
      textItemWidth: "80%",
      contentDirection: "supporting caption",
      textPosition: "center",
    })
    applyActiveTextItems([...activeTextItems, next])
    setSelectedTextIndex(activeTextItems.length)
  }

  function deleteSelectedTextItem() {
    const nextItems = activeTextItems.filter(
      (_, index) => index !== (selectedTextIndex ?? 0)
    )
    applyActiveTextItems(nextItems)
    setSelectedTextIndex((index) => Math.max(0, (index ?? 0) - 1))
  }

  function applyActiveTextItems(items: AutomationTextItem[]) {
    if (selectedSegment) {
      updateSegment(selectedSegment.id, { textItems: items })
      return
    }
    patchFormat({ globalTextItems: items })
  }

  return (
    <div className="grid min-h-svh bg-white md:grid-cols-[380px_1fr]">
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
            {preset.name}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <section className="rounded-[10px] border border-[#e3e2db] bg-white p-3 shadow-sm">
              <div className="mb-2 text-[14px] font-bold text-[#242421]">
                Video template
              </div>
              <SelectControl
                value={format.template}
                onChange={(event) =>
                  switchTemplate(
                    event.target.value as AutomationVideoTemplateId
                  )
                }
              >
                {videoAutomationTemplatePresets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.tagline}
                  </option>
                ))}
              </SelectControl>
              <p className="mt-2 text-[12px] leading-4 font-medium text-[#77766f]">
                {preset.description}
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
            </section>

            {format.globalTextItems.length > 0 ||
            format.hookPlacement === "global" ? (
              <button
                type="button"
                className={cn(
                  "w-full rounded-[10px] border bg-white p-3 text-left shadow-sm transition",
                  selectedTarget.scope === "global"
                    ? "border-[#242421]"
                    : "border-[#e3e2db] hover:border-[#c9c8c0]"
                )}
                onClick={() => {
                  setSelectedTarget({ scope: "global" })
                  setSelectedTextIndex(null)
                }}
              >
                <div className="text-[14px] font-bold text-[#242421]">
                  Persistent text
                </div>
                <p className="mt-1 text-[12px] leading-4 font-medium text-[#77766f]">
                  Shown for the whole video.{" "}
                  {format.hookPlacement === "global"
                    ? "The first element carries the hook."
                    : ""}
                </p>
              </button>
            ) : null}

            {format.segments.map((segment, index) => (
              <VideoSegmentCard
                key={segment.id}
                segment={segment}
                playFullVideo={videoSegmentPlaysFull(format, segment)}
                fixedVideoCollection={
                  format.template === "aesthetic" &&
                  segment.id === "aesthetic-clips"
                }
                allowsSlidesMode={
                  format.template === "birdseye_pov" &&
                  ["birdseye-problem", "birdseye-payoff"].includes(segment.id)
                }
                slideshowAutomations={slideshowAutomations}
                index={index}
                active={
                  selectedTarget.scope === "segment" &&
                  selectedSegment?.id === segment.id
                }
                showsHook={
                  format.hookPlacement === "first_segment" &&
                  index === 0 &&
                  segment.textItems.length > 0
                }
                collections={collections}
                demoVideos={demoVideos}
                onSelect={() => {
                  setSelectedTarget({ scope: "segment", segmentId: segment.id })
                  setSelectedTextIndex(null)
                }}
                onCreateCollection={onCreateCollection}
                onChange={(patch) => updateSegment(segment.id, patch)}
              />
            ))}
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

      <main className="relative isolate grid min-h-0 place-items-center overflow-y-auto bg-[#b9b9b6] p-8">
        <div className="w-full max-w-[360px]">
          <div className="mb-3 flex items-center justify-between text-[13px] font-bold text-[#55544f]">
            <span>{automation.name}</span>
            <span>
              {selectedSegment ? selectedSegment.label : "Persistent text"}
            </span>
          </div>
          <div className="[container-type:inline-size] relative mx-auto aspect-[9/16] max-h-[64vh] overflow-hidden rounded-[18px] bg-[#858581] shadow-2xl ring-1 ring-black/20">
            {previewImage ? (
              <PinterestPreviewTile
                image={previewImage}
                index={0}
                className="h-full w-full"
              />
            ) : previewDemo ? (
              <video
                src={previewDemo.url}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
            ) : (
              <div className="grid h-full place-items-center px-8 text-center text-[14px] font-semibold text-white/70">
                Select media for this segment
              </div>
            )}
            {activeTextItems.map((textItem, index) => (
              <TemplatePreviewText
                key={textItem.id || index}
                textItem={textItem}
                text={previewTextForTextItem(textItem)}
                active={selectedTextIndex === index}
                onClick={() => setSelectedTextIndex(index)}
              />
            ))}
            {selectedTarget.scope !== "global"
              ? format.globalTextItems.map((textItem, index) => (
                  <TemplatePreviewText
                    key={`global-${textItem.id || index}`}
                    textItem={textItem}
                    text={previewTextForTextItem(textItem)}
                    active={false}
                    onClick={() => {
                      setSelectedTarget({ scope: "global" })
                      setSelectedTextIndex(index)
                    }}
                  />
                ))
              : null}
          </div>
          {!activeTextItem ? (
            <button
              type="button"
              className="mt-3 w-full rounded-[10px] border border-dashed border-[#8a8a85] px-3 py-2 text-[13px] font-semibold text-[#3b3a36] hover:bg-white/40"
              onClick={addTextItem}
            >
              + Add text element
            </button>
          ) : null}
          <p className="mt-4 text-center text-[12px] font-semibold text-[#55544f]">
            Save, then use Generate. Finished videos appear in Overview.
          </p>
        </div>
        {activeTextItem && selectedTextIndex !== null ? (
          <AutomationFormatTextToolbar
            mode="Hook"
            textItem={activeTextItem}
            updateTextItem={updateActiveTextItem}
            onDelete={deleteSelectedTextItem}
            onAdd={addTextItem}
          />
        ) : null}
      </main>
    </div>
  )
}

function VideoSegmentCard({
  segment,
  playFullVideo,
  fixedVideoCollection,
  allowsSlidesMode,
  slideshowAutomations,
  index,
  active,
  showsHook,
  collections,
  demoVideos,
  onSelect,
  onCreateCollection,
  onChange,
}: {
  segment: AutomationVideoSegment
  playFullVideo: boolean
  fixedVideoCollection: boolean
  allowsSlidesMode: boolean
  slideshowAutomations: SlideshowAutomationOption[]
  index: number
  active: boolean
  showsHook: boolean
  collections: CreatedImageCollection[]
  demoVideos: LocalAsset[]
  onSelect: () => void
  onCreateCollection: (collection: CreatedImageCollection) => void
  onChange: (patch: Partial<AutomationVideoSegment>) => void
}) {
  const collection = findCollectionByIdOrAlias(
    collections,
    segment.collectionId
  )
  const mediaCollections = collections.filter((item) =>
    segment.mediaKind === "video"
      ? item.mediaType === "video"
      : item.mediaType !== "video"
  )
  const durationSeconds = Math.round(segment.clipDurationMs / 100) / 10
  const usesSingleFullVideo = playFullVideo
  const slidesMode = segment.mediaSource === "slideshow_automation"

  return (
    <section
      className={cn(
        "rounded-[10px] border bg-white p-3 shadow-sm transition",
        active ? "border-[#242421]" : "border-[#e3e2db]"
      )}
      onClick={onSelect}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[14px] font-bold text-[#242421]">
          {index + 1}. {segment.label}
        </div>
        {showsHook ? (
          <span className="rounded-full bg-[#f0efe9] px-2 py-0.5 text-[10px] font-bold tracking-[0.06em] text-[#77766f] uppercase">
            Hook
          </span>
        ) : null}
      </div>
      {segment.guidance ? (
        <p className="mb-2 text-[12px] leading-4 font-medium text-[#77766f]">
          {segment.guidance}
        </p>
      ) : null}

      <div className="space-y-2">
        {allowsSlidesMode ? (
          <div className="grid grid-cols-2 rounded-[8px] bg-[#efeee8] p-1">
            <button
              type="button"
              className={cn(
                "h-8 rounded-[6px] text-[12px] font-bold",
                !slidesMode ? "bg-white shadow-sm" : "text-[#77766f]"
              )}
              onClick={(event) => {
                event.stopPropagation()
                onChange({ mediaSource: "collection", mediaKind: "video" })
              }}
            >
              Videos
            </button>
            <button
              type="button"
              className={cn(
                "h-8 rounded-[6px] text-[12px] font-bold",
                slidesMode ? "bg-white shadow-sm" : "text-[#77766f]"
              )}
              onClick={(event) => {
                event.stopPropagation()
                onChange({ mediaSource: "slideshow_automation" })
              }}
            >
              Slides
            </button>
          </div>
        ) : null}

        {!usesSingleFullVideo && !fixedVideoCollection && !allowsSlidesMode ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-bold text-[#77766f]">
                Media source
              </span>
              <SelectControl
                value={segment.mediaSource}
                onChange={(event) =>
                  onChange({
                    mediaSource:
                      event.target.value === "demo_asset"
                        ? "demo_asset"
                        : "collection",
                  })
                }
              >
                <option value="collection">Collection</option>
                <option value="demo_asset">Demo video</option>
              </SelectControl>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-[#77766f]">
                Media type
              </span>
              <SelectControl
                value={segment.mediaKind}
                disabled={segment.mediaSource === "demo_asset"}
                onChange={(event) =>
                  onChange({
                    mediaKind:
                      event.target.value === "image" ? "image" : "video",
                  })
                }
              >
                <option value="video">Video clips</option>
                <option value="image">Images</option>
              </SelectControl>
            </label>
          </div>
        ) : null}

        {slidesMode ? (
          <label className="block">
            <span className="text-[11px] font-bold text-[#77766f]">
              Slides automation
            </span>
            <SelectControl
              className="w-full"
              value={segment.slideshowAutomationId || ""}
              onChange={(event) =>
                onChange({ slideshowAutomationId: event.target.value })
              }
            >
              <option value="">Select slides automation</option>
              {slideshowAutomations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectControl>
          </label>
        ) : segment.mediaSource === "demo_asset" ? (
          <DemoVideoSelector
            videos={demoVideos}
            value={segment.demoAssetId}
            label={`${segment.label} demo video`}
            onChange={(demoAssetId) => onChange({ demoAssetId })}
          />
        ) : (
          <CollectionSelector
            label={`${segment.label} collection`}
            collection={collection}
            collections={mediaCollections}
            onChange={(collectionId) => onChange({ collectionId })}
            onCreateCollection={onCreateCollection}
          />
        )}

        {!usesSingleFullVideo ? (
          <div
            className={cn(
              "grid gap-2",
              slidesMode ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            <label className="block">
              <span className="text-[11px] font-bold text-[#77766f]">
                {slidesMode ? "Slides" : "Clips"}
              </span>
              <SelectControl
                value={String(segment.clipCount)}
                disabled={segment.mediaSource === "demo_asset"}
                onChange={(event) =>
                  onChange({ clipCount: Number(event.target.value) || 1 })
                }
              >
                {Array.from({ length: 8 }, (_, count) => count + 1).map(
                  (count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  )
                )}
              </SelectControl>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-[#77766f]">
                {slidesMode ? "Secs/slide" : "Secs/clip"}
              </span>
              <SelectControl
                value={String(durationSeconds)}
                onChange={(event) =>
                  onChange({
                    clipDurationMs: Math.round(
                      Number(event.target.value) * 1000
                    ),
                  })
                }
              >
                {[1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 30]
                  .concat([durationSeconds])
                  .filter((value, idx, values) => values.indexOf(value) === idx)
                  .sort((a, b) => a - b)
                  .map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds}s
                    </option>
                  ))}
              </SelectControl>
            </label>
            {!slidesMode ? (
              <label className="block">
                <span className="text-[11px] font-bold text-[#77766f]">
                  Cut
                </span>
                <SelectControl
                  value={segment.transition}
                  onChange={(event) =>
                    onChange({
                      transition:
                        event.target.value === "fade" ? "fade" : "cut",
                    })
                  }
                >
                  <option value="cut">Hard cut</option>
                  <option value="fade">Fade</option>
                </SelectControl>
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function TemplatePreviewText({
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
      <span style={videoAutomationPreviewTextHighlightStyle(textItem)}>
        {text || "text element"}
      </span>
    </button>
  )
}
