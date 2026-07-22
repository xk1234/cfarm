export type SocialMediaKind = "text" | "image" | "video"

export type SocialPreviewKind =
  | "bluesky"
  | "facebook"
  | "google-business-profile"
  | "instagram"
  | "linkedin"
  | "pinterest"
  | "telegram"
  | "threads"
  | "tiktok"
  | "x"
  | "youtube"

export type SocialPlatformKey =
  | "tiktok"
  | "tiktok-creative"
  | "tiktok-seller"
  | "youtube"
  | "instagram"
  | "facebook"
  | "x"
  | "twitter"
  | "linkedin"
  | "threads"
  | "pinterest"
  | "bluesky"
  | "telegram"
  | "google"
  | "google-business-profile"

export interface SocialMediaConstraints {
  readonly maxFileSizeBytes?: number
  readonly maxWidth?: number
  readonly maxHeight?: number
  readonly maxDurationSeconds?: number
  readonly supportedMimeTypes?: readonly string[]
}

export interface SocialProvider {
  readonly id: string
  readonly name: string
  readonly platformKey: SocialPlatformKey
  readonly capabilities: {
    readonly canPublish: boolean
    readonly canSchedule: boolean
    readonly canAnalytics: boolean
    readonly mediaKinds: readonly SocialMediaKind[]
  }
  readonly limits: {
    readonly maxTextLength: number
    readonly maxMediaCount: number
    readonly image: SocialMediaConstraints
    readonly video: SocialMediaConstraints
  }
  readonly previewKind: SocialPreviewKind
}

/** The stable account shape consumed by publishing UI, independent of vendor payloads. */
export interface SocialAccount {
  provider: SocialPlatformKey
  integration_id: string
  name: string
  profile?: string
  picture?: string
  disabled?: boolean
}

/** A connected account made available to a publishing integration. */
export type SocialIntegration = SocialAccount

export interface SocialPublishingAdapter {
  readonly id: string
  normalizeIntegration(value: unknown): SocialIntegration | null
  normalizeIntegrations(values: readonly unknown[]): SocialIntegration[]
}
