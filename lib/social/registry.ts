import type {
  SocialMediaKind,
  SocialPlatformKey,
  SocialPreviewKind,
  SocialProvider,
} from "@/lib/social/provider-contract"

const MB = 1024 * 1024
const publishMedia = ["text", "image", "video"] as const

function provider(input: {
  platformKey: SocialPlatformKey
  name: string
  previewKind?: SocialPreviewKind
  maxTextLength: number
  maxMediaCount: number
  mediaKinds?: readonly SocialMediaKind[]
  canPublish?: boolean
  canSchedule?: boolean
  canAnalytics?: boolean
  maxImageBytes?: number
  maxVideoBytes?: number
  maxVideoSeconds?: number
}): SocialProvider {
  const previewKind =
    input.previewKind ?? (input.platformKey as SocialPreviewKind)

  return Object.freeze({
    id: input.platformKey,
    name: input.name,
    platformKey: input.platformKey,
    capabilities: Object.freeze({
      canPublish: input.canPublish ?? true,
      canSchedule: input.canSchedule ?? true,
      canAnalytics: input.canAnalytics ?? true,
      mediaKinds: Object.freeze(input.mediaKinds ?? publishMedia),
    }),
    limits: Object.freeze({
      maxTextLength: input.maxTextLength,
      maxMediaCount: input.maxMediaCount,
      image: Object.freeze({ maxFileSizeBytes: input.maxImageBytes }),
      video: Object.freeze({
        maxFileSizeBytes: input.maxVideoBytes,
        maxDurationSeconds: input.maxVideoSeconds,
      }),
    }),
    previewKind,
  })
}

export const socialProviders: readonly SocialProvider[] = Object.freeze([
  provider({
    platformKey: "tiktok",
    name: "TikTok",
    maxTextLength: 2_200,
    maxMediaCount: 35,
    maxImageBytes: 20 * MB,
    maxVideoBytes: 4_000 * MB,
    maxVideoSeconds: 600,
  }),
  provider({
    platformKey: "tiktok-creative",
    name: "TikTok Creative",
    previewKind: "tiktok",
    maxTextLength: 2_200,
    maxMediaCount: 1,
    maxVideoBytes: 4_000 * MB,
    maxVideoSeconds: 600,
  }),
  provider({
    platformKey: "tiktok-seller",
    name: "TikTok Seller",
    previewKind: "tiktok",
    maxTextLength: 2_200,
    maxMediaCount: 1,
    maxVideoBytes: 4_000 * MB,
    maxVideoSeconds: 600,
  }),
  provider({
    platformKey: "youtube",
    name: "YouTube",
    maxTextLength: 5_000,
    maxMediaCount: 1,
    mediaKinds: ["text", "video"],
    maxVideoBytes: 256_000 * MB,
  }),
  provider({
    platformKey: "instagram",
    name: "Instagram",
    maxTextLength: 2_200,
    maxMediaCount: 10,
    maxImageBytes: 8 * MB,
    maxVideoBytes: 4_000 * MB,
    maxVideoSeconds: 900,
  }),
  provider({
    platformKey: "facebook",
    name: "Facebook",
    maxTextLength: 63_206,
    maxMediaCount: 10,
    maxImageBytes: 10 * MB,
    maxVideoBytes: 10_000 * MB,
    maxVideoSeconds: 14_400,
  }),
  provider({
    platformKey: "x",
    name: "X",
    maxTextLength: 280,
    maxMediaCount: 4,
    maxImageBytes: 5 * MB,
    maxVideoBytes: 512 * MB,
    maxVideoSeconds: 140,
  }),
  provider({
    platformKey: "twitter",
    name: "Twitter",
    previewKind: "x",
    maxTextLength: 280,
    maxMediaCount: 4,
    maxImageBytes: 5 * MB,
    maxVideoBytes: 512 * MB,
    maxVideoSeconds: 140,
  }),
  provider({
    platformKey: "linkedin",
    name: "LinkedIn",
    maxTextLength: 3_000,
    maxMediaCount: 20,
    maxImageBytes: 10 * MB,
    maxVideoBytes: 5_000 * MB,
    maxVideoSeconds: 1_800,
  }),
  provider({
    platformKey: "threads",
    name: "Threads",
    maxTextLength: 500,
    maxMediaCount: 10,
    maxImageBytes: 8 * MB,
    maxVideoBytes: 1_000 * MB,
    maxVideoSeconds: 300,
  }),
  provider({
    platformKey: "pinterest",
    name: "Pinterest",
    maxTextLength: 500,
    maxMediaCount: 1,
    maxImageBytes: 32 * MB,
    maxVideoBytes: 2_000 * MB,
    maxVideoSeconds: 900,
  }),
  provider({
    platformKey: "bluesky",
    name: "Bluesky",
    maxTextLength: 300,
    maxMediaCount: 4,
    maxImageBytes: MB,
    maxVideoBytes: 50 * MB,
    maxVideoSeconds: 60,
  }),
  provider({
    platformKey: "telegram",
    name: "Telegram",
    maxTextLength: 4_096,
    maxMediaCount: 10,
    maxImageBytes: 10 * MB,
    maxVideoBytes: 2_000 * MB,
  }),
  provider({
    platformKey: "google",
    name: "Google",
    previewKind: "google-business-profile",
    maxTextLength: 1_500,
    maxMediaCount: 1,
    mediaKinds: ["text", "image"],
    maxImageBytes: 10 * MB,
  }),
  provider({
    platformKey: "google-business-profile",
    name: "Google Business Profile",
    maxTextLength: 1_500,
    maxMediaCount: 1,
    mediaKinds: ["text", "image"],
    maxImageBytes: 10 * MB,
  }),
])

const providersByPlatform = new Map(
  socialProviders.map((item) => [item.platformKey, item] as const)
)

export function getSocialProvider(key: string) {
  return providersByPlatform.get(key as SocialPlatformKey)
}

export function listSocialProviders() {
  return [...socialProviders]
}

export function getPublishableProviders() {
  return socialProviders.filter((item) => item.capabilities.canPublish)
}
