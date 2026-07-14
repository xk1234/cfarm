import { useState } from "react"
import { IconChevronLeft, IconVideo } from "@tabler/icons-react"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { SoundSelector } from "@/components/realfarm/creator-ui"
import { PinterestPreviewTile } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import {
  automationCollectionId,
  automationFormatSection,
  automationHooks,
  defaultAutomationTextItem,
  schemaWithAutomationCollectionId,
  updateAutomationFormatSection,
  type AutomationSchema,
  type AutomationTextItem,
  type AutomationVideoTemplateId,
} from "@/lib/realfarm-automation"
import {
  videoAutomationTemplatePreset,
  videoAutomationTemplatePresets,
} from "@/lib/video-automation-templates"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import { previewTextForTextItem } from "@/lib/realfarm-preview-text"
import { randomTikTokSoundLabel } from "@/lib/slideshow-publishing-config"
import { cn } from "@/lib/utils"

import { AutomationFormatTextToolbar } from "./format-text-toolbar"
import { resolveMediaCollection } from "./automation-video-generation"
import { DemoVideoSelector } from "./demo-video-selector"
import {
  videoAutomationPreviewTextHighlightStyle,
  videoAutomationPreviewTextStyle,
} from "./video-format-helpers"

export function VideoAutomationFormatPanel({
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
  const [selectedVideoTextIndex, setSelectedVideoTextIndex] = useState<
    number | null
  >(null)
  const hooks = automationHooks(config)
  const selectedAvatarCollectionId = automationCollectionId(config, "content")
  const selectedAvatarCollection = resolveMediaCollection(
    collections,
    selectedAvatarCollectionId,
    "video"
  )
  const selectedDemoVideoId = config.image_collection_ids.video_demo_asset_id
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
  const hookTextItem =
    hookTextItems[selectedVideoTextIndex ?? 0] ?? hookTextItems[0]

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
    const textIndex = selectedVideoTextIndex ?? 0
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
      (_, index) => index !== (selectedVideoTextIndex ?? 0)
    )
    onConfigChange(
      updateAutomationFormatSection(config, "hook", {
        textItems:
          nextTextItems.length > 0
            ? nextTextItems
            : [defaultAutomationTextItem()],
      })
    )
    setSelectedVideoTextIndex((index) => Math.max(0, (index ?? 0) - 1))
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
                Video template
              </div>
              <SelectControl
                value="ugc_ad"
                onChange={(event) =>
                  onConfigChange({
                    ...config,
                    video_format: videoAutomationTemplatePreset(
                      event.target.value as AutomationVideoTemplateId
                    ).buildFormat(),
                  })
                }
              >
                {videoAutomationTemplatePresets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.tagline}
                  </option>
                ))}
              </SelectControl>
            </section>

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
              <DemoVideoSelector
                videos={demoVideos}
                value={selectedDemoVideoId ?? ""}
                onChange={updateDemoVideo}
              />
              <p className="mt-2 text-[12px] leading-4 font-medium text-[#77766f]">
                Pulled only from the demo videos folder. If selected, the
                rendered ad continues into this demo clip after the avatar
                intro.
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
              {hooks.length} hooks · {hookTextItems.length} text elements
            </span>
          </div>
          <div className="[container-type:inline-size] relative mx-auto aspect-[9/16] max-h-[72vh] overflow-hidden rounded-[18px] bg-[#858581] shadow-2xl ring-1 ring-black/20">
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
                text={previewTextForTextItem(textItem)}
                active={selectedVideoTextIndex === index}
                onClick={() => setSelectedVideoTextIndex(index)}
              />
            ))}
          </div>
          <p className="mt-4 text-center text-[12px] font-semibold text-[#55544f]">
            Save, then use Generate. Finished videos appear in Overview.
          </p>
        </div>
        {selectedVideoTextIndex !== null && (
          <AutomationFormatTextToolbar
            mode="Hook"
            textItem={hookTextItem}
            updateTextItem={updateVideoTextItem}
            onDelete={deleteSelectedVideoTextItem}
            onAdd={addVideoTextItem}
          />
        )}
      </main>
    </div>
  )
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
      <span style={videoAutomationPreviewTextHighlightStyle(textItem)}>
        {text || "text element"}
      </span>
    </button>
  )
}
