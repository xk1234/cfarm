export type PostizProvider = "x" | "tiktok" | "facebook" | "instagram" | "youtube" | string

export type PostizProviderSettings = Record<string, string | boolean | null | string[]>

export function defaultPostizProviderSettings(provider: PostizProvider, overrides: Record<string, unknown> = {}): PostizProviderSettings {
  const base = providerDefaults(provider)
  return { ...base, ...compactSettings(overrides) }
}

function providerDefaults(provider: PostizProvider): PostizProviderSettings {
  switch (provider) {
    case "tiktok":
      return {
        __type: "tiktok",
        title: "",
        privacy_level: "PUBLIC_TO_EVERYONE",
        duet: false,
        stitch: false,
        comment: true,
        autoAddMusic: "no",
        brand_content_toggle: false,
        brand_organic_toggle: false,
        video_made_with_ai: false,
        content_posting_method: "DIRECT_POST",
      }
    case "x":
      return {
        __type: "x",
        who_can_reply_post: "everyone",
        community: "",
        made_with_ai: false,
        paid_partnership: false,
      }
    case "facebook":
      return { __type: "facebook", url: "" }
    case "instagram":
      return { __type: "instagram", collaborators: [] }
    case "youtube":
      return {
        __type: "youtube",
        title: "",
        type: "public",
        selfDeclaredMadeForKids: "no",
        thumbnail: null,
        tags: [],
      }
    default:
      return { __type: provider || "unknown" }
  }
}

function compactSettings(settings: Record<string, unknown>): PostizProviderSettings {
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) =>
      typeof value === "string" ||
      typeof value === "boolean" ||
      value === null ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))
    )
  ) as PostizProviderSettings
}
