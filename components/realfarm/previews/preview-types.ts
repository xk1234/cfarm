import type { SocialPlatformKey } from "@/lib/social/provider-contract"
import type { PreviewMedia } from "@/features/composer/domain/media"

export type { PreviewMedia } from "@/features/composer/domain/media"

export interface PlatformPreviewProps {
  platformKey: SocialPlatformKey | string
  text: string
  media?: readonly PreviewMedia[]
  accountName?: string
  handle?: string
  avatarUrl?: string
  fields?: Record<string, string>
}

export type NetworkPreviewProps = Omit<PlatformPreviewProps, "platformKey">
