import { clean } from "@/lib/guards"
import { postFastSocialAdapter } from "@/lib/social/postfast-adapter"
import { socialBuSocialAdapter } from "@/lib/social/socialbu-adapter"
import type { SocialPublishingAdapter } from "@/lib/social/provider-contract"

export type PublishingProviderId = "postfast" | "socialbu"

export const defaultPublishingProvider: PublishingProviderId = "postfast"

/**
 * Selects the active social publishing backend. PostFast remains the default so
 * behaviour is unchanged until `SOCIAL_PUBLISHING_PROVIDER=socialbu` is set as
 * part of the SocialBu migration cutover.
 */
export function activePublishingProvider(
  value: string | undefined = process.env.SOCIAL_PUBLISHING_PROVIDER
): PublishingProviderId {
  switch (clean(value).toLowerCase()) {
    case "socialbu":
      return "socialbu"
    case "postfast":
      return "postfast"
    default:
      return defaultPublishingProvider
  }
}

const adaptersById: Record<PublishingProviderId, SocialPublishingAdapter> = {
  postfast: postFastSocialAdapter,
  socialbu: socialBuSocialAdapter,
}

export function activePublishingAdapter(
  provider: PublishingProviderId = activePublishingProvider()
): SocialPublishingAdapter {
  return adaptersById[provider]
}
