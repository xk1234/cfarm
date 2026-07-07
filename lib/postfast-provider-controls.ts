export type PostFastProvider =
  | "x"
  | "tiktok"
  | "tiktok-creative"
  | "tiktok-seller"
  | "facebook"
  | "instagram"
  | "youtube"
  | "linkedin"
  | "threads"
  | "pinterest"
  | "bluesky"
  | "telegram"
  | "google"
  | "google-business-profile"
  | string

export type PostFastProviderControlValue =
  string | number | boolean | null | string[]

export type PostFastTikTokControls = {
  tiktokTitle: string
  tiktokIsDraft: boolean
  tiktokAllowComments: boolean
  tiktokAllowDuet: boolean
  tiktokAllowStitch: boolean
  tiktokBrandOrganic: boolean
  tiktokBrandContent: boolean
  tiktokAutoAddMusic: boolean
  tiktokIsAigc: boolean
}

export type PostFastInstagramControls = {
  instagramPublishType: "TIMELINE" | "REEL" | "STORY"
  instagramPostToGrid: boolean
}

export type PostFastFacebookControls = {
  facebookContentType: "POST" | "REEL" | "STORY"
}

export type PostFastYouTubeControls = {
  youtubeTitle: string
  youtubePrivacy: "PUBLIC" | "UNLISTED" | "PRIVATE"
  youtubeIsShort: boolean
  youtubeMadeForKids: boolean
  youtubeTags: string[]
}

export type PostFastXControls = {
  xRetweetUrl: string
}

export type PostFastLinkedInControls = {
  linkedinAttachmentKey: string
  linkedinVisibility: "PUBLIC" | "CONNECTIONS"
}

export type PostFastPinterestControls = {
  pinterestBoardId: string
  pinterestLink: string
}

export type PostFastGoogleBusinessControls = {
  gbpLocationId: string
  gbpPostType: "STANDARD" | "EVENT" | "OFFER"
  gbpEventStartDate: string
  gbpEventEndDate: string
}

export type PostFastNoExtraPlatformControls = Record<string, never>

export type PostFastProviderControlsByProvider = {
  tiktok: PostFastTikTokControls
  "tiktok-creative": PostFastNoExtraPlatformControls
  "tiktok-seller": PostFastNoExtraPlatformControls
  facebook: PostFastFacebookControls
  instagram: PostFastInstagramControls
  youtube: PostFastYouTubeControls
  x: PostFastXControls
  twitter: PostFastXControls
  linkedin: PostFastLinkedInControls
  threads: PostFastNoExtraPlatformControls
  pinterest: PostFastPinterestControls
  bluesky: PostFastNoExtraPlatformControls
  telegram: PostFastNoExtraPlatformControls
  google: PostFastGoogleBusinessControls
  "google-business-profile": PostFastGoogleBusinessControls
}

export type PostFastKnownProvider = keyof PostFastProviderControlsByProvider

export type PostFastKnownProviderControls =
  PostFastProviderControlsByProvider[PostFastKnownProvider]

export type PostFastProviderControls = Partial<
  PostFastTikTokControls &
    PostFastInstagramControls &
    PostFastFacebookControls &
    PostFastYouTubeControls &
    PostFastXControls &
    PostFastLinkedInControls &
    PostFastPinterestControls &
    PostFastGoogleBusinessControls
> &
  Record<string, PostFastProviderControlValue>

export function defaultPostFastProviderControls<
  P extends PostFastKnownProvider,
>(
  provider: P,
  overrides?: Partial<PostFastProviderControlsByProvider[P]> &
    Record<string, unknown>
): PostFastProviderControlsByProvider[P]
export function defaultPostFastProviderControls(
  provider: PostFastProvider,
  overrides?: Record<string, unknown>
): PostFastProviderControls
export function defaultPostFastProviderControls(
  provider: PostFastProvider,
  overrides: Record<string, unknown> = {}
): PostFastProviderControls {
  const base = providerDefaults(provider)
  return { ...base, ...compactControls(overrides) } as PostFastProviderControls
}

function providerDefaults(
  provider: PostFastProvider
): PostFastProviderControls {
  switch (provider) {
    case "tiktok":
      return {
        tiktokTitle: "",
        tiktokIsDraft: false,
        tiktokAllowComments: true,
        tiktokAllowDuet: true,
        tiktokAllowStitch: true,
        tiktokBrandOrganic: false,
        tiktokBrandContent: false,
        tiktokAutoAddMusic: false,
        tiktokIsAigc: false,
      }
    case "facebook":
      return { facebookContentType: "POST" }
    case "instagram":
      return { instagramPublishType: "TIMELINE", instagramPostToGrid: true }
    case "youtube":
      return {
        youtubeTitle: "",
        youtubePrivacy: "PUBLIC",
        youtubeIsShort: true,
        youtubeMadeForKids: false,
        youtubeTags: [],
      }
    case "x":
    case "twitter":
      return { xRetweetUrl: "" }
    case "linkedin":
      return {
        linkedinAttachmentKey: "",
        linkedinVisibility: "PUBLIC",
      }
    case "pinterest":
      return {
        pinterestBoardId: "",
        pinterestLink: "",
      }
    case "google":
    case "google-business-profile":
      return {
        gbpLocationId: "",
        gbpPostType: "STANDARD",
        gbpEventStartDate: "",
        gbpEventEndDate: "",
      }
    default:
      return {}
  }
}

function compactControls(settings: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(settings).filter(
      ([, value]) =>
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null ||
        (Array.isArray(value) &&
          value.every((item) => typeof item === "string"))
    )
  ) as PostFastProviderControls
}
