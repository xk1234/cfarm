import type { PostFastSocialProvider } from "@/lib/postfast-client"

export const slideshowSocialProviders = [
  "tiktok",
  "youtube",
  "instagram",
  "facebook",
  "x",
  "twitter",
  "linkedin",
  "pinterest",
  "threads",
  "telegram",
  "bluesky",
] as const satisfies readonly PostFastSocialProvider[]

export type SlideshowSocialProvider = (typeof slideshowSocialProviders)[number]

export const slideshowVideoPublishProviders = [
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "twitter",
  "linkedin",
  "pinterest",
  "threads",
  "telegram",
] as const satisfies readonly PostFastSocialProvider[]

const slideshowSocialProviderSet = new Set<PostFastSocialProvider>(
  slideshowSocialProviders
)
const slideshowVideoPublishProviderSet = new Set<PostFastSocialProvider>(
  slideshowVideoPublishProviders
)

export function isSlideshowSocialProvider(
  provider: string
): provider is SlideshowSocialProvider {
  return slideshowSocialProviderSet.has(provider as PostFastSocialProvider)
}

export function canPublishSlideshowAsVideo(provider: string) {
  return slideshowVideoPublishProviderSet.has(provider as PostFastSocialProvider)
}
