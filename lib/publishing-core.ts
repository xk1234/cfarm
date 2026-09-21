import { defaultPostFastProviderControls } from "@/lib/postfast-provider-controls"

export {
  buildPublicationRecord,
  normalizePublicationRecord,
  publicationRecordContractFixture,
  publicationRecordSummary,
  validatePublicationRecord,
} from "@/lib/publication-record"

export type PostingMode = "auto" | "review" | "manual"

export function effectivePostingMode(schema: { posting_mode?: unknown }) {
  if (
    schema?.posting_mode === "auto" ||
    schema?.posting_mode === "review" ||
    schema?.posting_mode === "manual"
  ) {
    return schema.posting_mode
  }
  return "auto"
}

export function postFastPostIds(value: unknown): string[] {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  return Array.isArray(record.postIds)
    ? record.postIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    : []
}

export function postFastReleaseUrl(value: unknown): string | undefined {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const post = Array.isArray(record.posts) ? record.posts[0] : undefined
  const postRecord =
    post && typeof post === "object" ? (post as Record<string, unknown>) : {}
  const valueFromResponse =
    record.releaseUrl ??
    record.releaseURL ??
    postRecord.releaseUrl ??
    postRecord.releaseURL
  return typeof valueFromResponse === "string" && valueFromResponse.trim()
    ? valueFromResponse.trim()
    : undefined
}

export function postFastSchedulePayload(input: {
  content: string
  integrationId: string
  media: Array<{ key: string; type: string; sortOrder?: number }>
  provider: string
  scheduledFor: string
  settings?: Record<string, unknown>
}) {
  const controls = defaultPostFastProviderControls(
    input.provider,
    input.settings
  )
  return {
    status: "SCHEDULED",
    posts: [
      {
        content: input.content,
        mediaItems: input.media.map((item, index) => ({
          key: item.key,
          type: item.type,
          sortOrder: item.sortOrder ?? index,
        })),
        scheduledAt: input.scheduledFor,
        socialMediaId: input.integrationId,
        status: "SCHEDULED",
      },
    ],
    ...(Object.keys(controls).length ? { controls } : {}),
  }
}
