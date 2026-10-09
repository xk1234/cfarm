/**
 * SocialBu accounts → the vendor-neutral `SocialIntegration` used by the
 * publishing UI. Client-safe (no server imports).
 */
import type {
  SocialIntegration,
  SocialPlatformKey,
  SocialPublishingAdapter,
} from "@/lib/social/provider-contract"

const PLATFORM_KEYS: ReadonlySet<string> = new Set<SocialPlatformKey>([
  "tiktok",
  "youtube",
  "instagram",
  "facebook",
  "x",
  "twitter",
  "linkedin",
  "threads",
  "pinterest",
  "bluesky",
  "google-business-profile",
])

function text(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

export function socialBuPlatformKey(provider: string): SocialPlatformKey | null {
  const key = provider.trim().toLowerCase()
  const normalized = key === "twitter" ? "x" : key === "google" ? "google-business-profile" : key
  return PLATFORM_KEYS.has(normalized) ? (normalized as SocialPlatformKey) : null
}

/**
 * Accepts a `PublishingAccount` (`/api/publishing/accounts` → `accounts[]`) or
 * an already-normalized integration.
 */
export function normalizeSocialBuSocialIntegration(value: unknown): SocialIntegration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = text(record.integration_id) || text(record.id)
  const provider = socialBuPlatformKey(text(record.provider))
  if (!id || !provider) return null
  const picture = text(record.picture) || text(record.avatarUrl)
  const extra = record.extra && typeof record.extra === "object" ? (record.extra as Record<string, unknown>) : {}
  const profile = text(record.profile) || text(extra.username)
  return {
    provider,
    integration_id: id,
    name: text(record.name) || `Account ${id}`,
    ...(profile ? { profile } : {}),
    ...(picture ? { picture } : {}),
    disabled: record.disabled === true || record.active === false,
  }
}

export const socialBuSocialAdapter: SocialPublishingAdapter = {
  id: "socialbu",
  normalizeIntegration: normalizeSocialBuSocialIntegration,
  normalizeIntegrations(values) {
    return values.flatMap((value) => {
      const integration = normalizeSocialBuSocialIntegration(value)
      return integration ? [integration] : []
    })
  },
}
