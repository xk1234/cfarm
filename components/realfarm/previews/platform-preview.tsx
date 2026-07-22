import { getSocialProvider } from "@/lib/social/registry"

import { FacebookPreview } from "./facebook-preview"
import { GeneralPreview } from "./general-preview"
import { InstagramPreview } from "./instagram-preview"
import { LinkedInPreview } from "./linkedin-preview"
import type { NetworkPreviewProps, PlatformPreviewProps } from "./preview-types"
import { ThreadsPreview } from "./threads-preview"
import { TikTokPreview } from "./tiktok-preview"
import { XPreview } from "./x-preview"
import { YouTubePreview } from "./youtube-preview"

const previews = {
  facebook: FacebookPreview,
  instagram: InstagramPreview,
  linkedin: LinkedInPreview,
  threads: ThreadsPreview,
  tiktok: TikTokPreview,
  x: XPreview,
  youtube: YouTubePreview,
} satisfies Partial<
  Record<string, (props: NetworkPreviewProps) => React.ReactNode>
>

export function truncatePreviewText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

export function PlatformPreview({
  platformKey,
  text,
  ...props
}: PlatformPreviewProps) {
  const provider = getSocialProvider(platformKey)
  if (!provider)
    return <GeneralPreview {...props} platformName="Social" text={text} />
  const Preview = previews[provider.previewKind as keyof typeof previews]
  const previewText = truncatePreviewText(text, provider.limits.maxTextLength)
  if (!Preview)
    return (
      <GeneralPreview
        {...props}
        platformName={provider.name}
        text={previewText}
      />
    )
  return <Preview {...props} text={previewText} />
}

export type { PlatformPreviewProps, PreviewMedia } from "./preview-types"
