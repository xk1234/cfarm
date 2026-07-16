import {
  IconBrandBluesky,
  IconBrandFacebookFilled,
  IconBrandGoogleFilled,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandPinterest,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutubeFilled,
} from "@tabler/icons-react"

import {
  postFastProviderLabel,
  type PostFastSocialIntegration,
  type PostFastSocialProvider,
} from "@/lib/postfast-client"

export function SocialPlatformIcon({
  provider,
  className,
  stroke = 2.4,
}: {
  provider: PostFastSocialProvider
  className?: string
  stroke?: number
}) {
  const props = { className, stroke }
  switch (provider) {
    case "instagram":
      return <IconBrandInstagram {...props} />
    case "youtube":
      return <IconBrandYoutubeFilled {...props} />
    case "facebook":
      return <IconBrandFacebookFilled {...props} />
    case "x":
    case "twitter":
      return <IconBrandX {...props} />
    case "linkedin":
      return <IconBrandLinkedin {...props} />
    case "threads":
      return <IconBrandThreads {...props} />
    case "pinterest":
      return <IconBrandPinterest {...props} />
    case "bluesky":
      return <IconBrandBluesky {...props} />
    case "telegram":
      return <IconBrandTelegram {...props} />
    case "google":
    case "google-business-profile":
      return <IconBrandGoogleFilled {...props} />
    case "tiktok":
    case "tiktok-creative":
    case "tiktok-seller":
    default:
      return <IconBrandTiktok {...props} />
  }
}

export function socialProviderLabel(provider: PostFastSocialProvider) {
  return postFastProviderLabel(provider)
}

export function socialIntegrationKey(
  integration: Pick<PostFastSocialIntegration, "provider" | "integration_id">
) {
  return `${integration.provider}:${integration.integration_id}`
}

export function socialAccountShortName(
  integration: Pick<PostFastSocialIntegration, "provider" | "profile" | "name">
) {
  return (
    integration.profile?.replace(/^@/, "") ||
    integration.name ||
    socialProviderLabel(integration.provider)
  )
}
