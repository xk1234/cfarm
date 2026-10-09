import type { SocialPlatformKey } from "@/lib/social/provider-contract"

export interface PreviewMedia {
  id: string
  kind: "image" | "video"
  url: string
  alt?: string
}

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
