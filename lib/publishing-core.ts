import { defaultPostFastProviderControls } from "@/lib/postfast-provider-controls"

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
