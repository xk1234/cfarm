import { IconLanguage } from "@tabler/icons-react"

import { SoundSelector } from "@/components/realfarm/creator-ui"
import { SelectControl, SwitchPillButton } from "@/components/ui/form-controls"
import {
  automationPublishType,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { LocalAsset } from "@/lib/realfarm-data"
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
import { cn } from "@/lib/utils"

import { SettingsFooter, SettingsPage, SettingsRow } from "./settings-layout"

export function AutomationGeneralSettingsPanel({
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
  const language = config.language || defaultAutomationLanguage
  const isVideoAutomation = config.automationKind === "video"
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
      language: nextLanguage,
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
        title="Language"
        description={
          isVideoAutomation
            ? "Language for generated video copy"
            : "Language for generated text on slides"
        }
        control={
          <div className="flex items-center gap-2">
            <IconLanguage className="size-5 text-app-text" />
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
      {!isVideoAutomation ? (
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
      ) : null}
      {!isVideoAutomation ? (
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
      ) : null}
      {!isVideoAutomation ? (
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
      ) : null}
      {!isVideoAutomation ? (
        <div className={cn("mt-6", !exportAsVideo && "opacity-50")}>
          <SoundSelector
            selectedSound={selectedAutomationSound}
            music={music}
            onSelect={updateSelectedSound}
            variant="settingsSound"
            emptyLabel={randomTikTokSoundLabel}
          />
        </div>
      ) : null}
      <SettingsRow
        title="AI web search"
        description={`Allow the generation model to search for current facts when it decides the ${isVideoAutomation ? "video" : "slideshow"} needs them. Search usage adds provider cost.`}
        control={
          <SwitchPillButton
            enabled={Boolean(config.web_search_enabled)}
            onClick={() =>
              onConfigChange({
                ...config,
                web_search_enabled: !config.web_search_enabled,
              })
            }
            aria-label="Toggle AI web search"
          />
        }
      />
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}
