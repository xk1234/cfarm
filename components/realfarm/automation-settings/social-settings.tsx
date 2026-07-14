import { useState } from "react"
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
  type Icon,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { SwitchPillButton } from "@/components/ui/form-controls"
import {
  type AutomationSchema,
  type AutomationSocialProvider,
  type TikTokPublishType,
} from "@/lib/realfarm-automation"
import {
  defaultPostFastProviderControls,
  type PostFastProviderControls,
} from "@/lib/postfast-provider-controls"
import type { PostFastSocialProvider } from "@/lib/postfast-client"
import { isSlideshowSocialProvider } from "@/lib/slideshow-social-platforms"
import { cn } from "@/lib/utils"

import {
  fixedSocialSettingsForProvider,
  socialSettingsForProvider,
  tiktokControlsFromPostSettings,
} from "./social-settings-helpers"
import { SocialPlatformSettingsFields } from "./social-platform-fields"
import { SettingsFooter, SettingsPage, SettingsRow } from "./settings-layout"

const socialMediaSettingTabs: {
  provider: PostFastSocialProvider
  label: string
  icon: Icon
  summary: string
  videoSummary: string
}[] = [
  {
    provider: "tiktok",
    label: "TikTok",
    icon: IconBrandTiktok,
    summary: "Video or photo slideshow posts.",
    videoSummary: "Native video posts.",
  },
  {
    provider: "youtube",
    label: "YouTube",
    icon: IconBrandYoutubeFilled,
    summary: "Exported slideshow videos. Shorts is always enabled.",
    videoSummary: "YouTube Shorts. Shorts is always enabled.",
  },
  {
    provider: "instagram",
    label: "Instagram",
    icon: IconBrandInstagram,
    summary: "Timeline for slideshows, Reels for exported videos.",
    videoSummary: "Published as Reels.",
  },
  {
    provider: "facebook",
    label: "Facebook",
    icon: IconBrandFacebookFilled,
    summary: "Feed posts for slideshows, Reels for exported videos.",
    videoSummary: "Published as Reels.",
  },
  {
    provider: "x",
    label: "X",
    icon: IconBrandX,
    summary: "Text, image, carousel, and video posts.",
    videoSummary: "Native video posts.",
  },
  {
    provider: "linkedin",
    label: "LinkedIn",
    icon: IconBrandLinkedin,
    summary: "Text, image carousel, and video posts.",
    videoSummary: "Native video posts.",
  },
  {
    provider: "pinterest",
    label: "Pinterest",
    icon: IconBrandPinterest,
    summary: "Image, carousel, and video pins.",
    videoSummary: "Video pins.",
  },
  {
    provider: "threads",
    label: "Threads",
    icon: IconBrandThreads,
    summary: "Text, image carousel, and video posts.",
    videoSummary: "Native video posts.",
  },
  {
    provider: "telegram",
    label: "Telegram",
    icon: IconBrandTelegram,
    summary: "Text, images, videos, and mixed media groups.",
    videoSummary: "Native video posts.",
  },
  {
    provider: "bluesky",
    label: "Bluesky",
    icon: IconBrandBluesky,
    summary: "Text and image posts.",
    videoSummary: "Video publishing is not available for this provider.",
  },
]

export function SocialMediaSettingsPanel({
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
  const isVideoAutomation = config.automationKind === "video"
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
  const supportedSocialIntegrations = config.social_integrations.filter(
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
                {supportedSocialIntegrations.length > 0
                  ? `${supportedSocialIntegrations.length} account${supportedSocialIntegrations.length === 1 ? "" : "s"} selected`
                  : "No social accounts selected"}
              </div>
            </div>
            <Button
              type="button"
              variant="softControl"
              size="appDefault"
              onClick={onEditSocialAccounts}
            >
              {supportedSocialIntegrations.length > 0
                ? "Edit accounts"
                : "Add accounts"}
            </Button>
          </div>
        </div>

        <SettingsRow
          title="Auto-post automation"
          description={`Publish automatically when a scheduled ${isVideoAutomation ? "video" : "slideshow"} is ready.`}
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
                {isVideoAutomation ? activeTab.videoSummary : activeTab.summary}
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

function socialProviderMatches(
  activeProvider: PostFastSocialProvider,
  integrationProvider: PostFastSocialProvider
) {
  if (activeProvider === "x") {
    return integrationProvider === "x" || integrationProvider === "twitter"
  }
  return integrationProvider === activeProvider
}
