import { SelectControl, SwitchPillButton } from "@/components/ui/form-controls"
import {
  automationProviderPublishAs,
  automationPublishType,
  type AutomationSchema,
  type AutomationSocialIntegration,
  type TikTokPublishType,
} from "@/lib/realfarm-automation"
import type { PostFastProviderControls } from "@/lib/postfast-provider-controls"
import type { PostFastSocialProvider } from "@/lib/postfast-client"
import { canPublishSlideshowAsVideo } from "@/lib/slideshow-social-platforms"

import {
  brandDisclosureLabel,
  brandDisclosurePatch,
  brandDisclosureValue,
  brandDisclosureValueFromLabel,
  linkedinVisibilityValue,
  settingString,
  settingStringArray,
  youtubePrivacyValue,
} from "./social-settings-helpers"
import { SettingsRow } from "./settings-layout"

export function SocialPlatformSettingsFields({
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

  if (config.automationKind === "video") {
    return (
      <SettingsRow
        title="Publish as"
        description="Video automations always publish their rendered video."
        control={
          <span className="inline-flex h-10 items-center rounded-[8px] border border-app-panel-border bg-app-surface-subtle px-3 text-[14px] font-semibold text-app-text">
            Video
          </span>
        }
      />
    )
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
    <div className="rounded-[8px] border border-dashed border-app-panel-border bg-app-surface-subtle p-5">
      <div className="text-[14px] font-bold text-app-text">
        Selected accounts
      </div>
      {integrations.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {integrations.map((integration) => (
            <div
              key={`${integration.provider}:${integration.integration_id}`}
              className="flex items-center justify-between gap-3 rounded-[8px] border border-[#e4e2d8] bg-app-surface px-3 py-2"
            >
              <span className="truncate text-[13px] font-semibold text-app-text">
                {integration.name}
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-app-muted-text">
                {integration.profile
                  ? `@${integration.profile.replace(/^@/, "")}`
                  : "connected"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[13px] font-semibold text-app-muted-text">
          No accounts added for this platform.
        </div>
      )}
    </div>
  )
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
          className="h-11 min-w-[240px] rounded-[8px] border border-app-panel-border bg-app-surface px-3 text-[14px] font-semibold text-app-text outline-none focus:border-[#9f9e96]"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      }
    />
  )
}
