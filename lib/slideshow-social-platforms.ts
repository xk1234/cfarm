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
] as const

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
] as const

const slideshowSocialProviderSet = new Set<string>(
  slideshowSocialProviders
)
const slideshowVideoPublishProviderSet = new Set<string>(
  slideshowVideoPublishProviders
)

export function isSlideshowSocialProvider(
  provider: string
): provider is SlideshowSocialProvider {
  return slideshowSocialProviderSet.has(provider)
}

export function canPublishSlideshowAsVideo(provider: string) {
  return slideshowVideoPublishProviderSet.has(provider)
}
