import {
  automationProviderPublishesVideo,
  postTextValue,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import {
  defaultPostFastProviderControls,
  type PostFastProviderControls,
} from "@/lib/postfast-provider-controls"
import type { SocialPlatformKey } from "@/lib/social/provider-contract"

export function socialSettingsForProvider(
  config: AutomationSchema,
  provider: SocialPlatformKey
) {
  return defaultPostFastProviderControls(provider, {
    ...(provider === "tiktok"
      ? tiktokControlsFromPostSettings(config.tiktok_post_settings)
      : {}),
    ...(config.social_post_settings?.[provider] ?? {}),
    ...fixedSocialSettingsForProvider(config, provider),
  })
}

export function fixedSocialSettingsForProvider(
  config: AutomationSchema,
  provider: SocialPlatformKey
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

export function tiktokControlsFromPostSettings(
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

export type BrandDisclosureValue = "none" | "organic" | "branded"

export function brandDisclosureValue(
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

export function brandDisclosureValueFromLabel(
  value: string
): BrandDisclosureValue {
  if (value === "Brand organic") {
    return "organic"
  }
  if (value === "Branded content") {
    return "branded"
  }
  return "none"
}

export function brandDisclosureLabel(value: BrandDisclosureValue) {
  switch (value) {
    case "organic":
      return "Brand organic"
    case "branded":
      return "Branded content"
    default:
      return "None"
  }
}

export function brandDisclosurePatch(value: BrandDisclosureValue) {
  return {
    disclose_brand_organic: value === "organic",
    disclose_branded_content: value === "branded",
  }
}

export function youtubePrivacyValue(value: string) {
  return value === "UNLISTED" || value === "PRIVATE" ? value : "PUBLIC"
}

export function linkedinVisibilityValue(value: string) {
  return value === "CONNECTIONS" ? value : "PUBLIC"
}

export function settingString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

export function settingBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

export function settingStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}
