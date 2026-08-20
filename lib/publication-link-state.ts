import type {
  PostFastPostRecord,
  PostFastStatsSource,
  PublicationLinkState,
} from "@/lib/publication-contract"

export const PUBLICATION_LINK_STATES = [
  "postfast_published",
  "manually_linked",
  "unlinked",
] as const

export type { PublicationLinkState } from "@/lib/publication-contract"

type PublicationLinkStateRecord = Pick<
  PostFastPostRecord,
  "linkState" | "statsSources"
>

export function publicationLinkState(
  record: Partial<PublicationLinkStateRecord>
): {
  state: PublicationLinkState
  hasApiStats: boolean
  hasStudioStats: boolean
  label: string
  description: string
} {
  const state = record.linkState ?? "unlinked"
  const statsSources = new Set<PostFastStatsSource>(record.statsSources ?? [])
  const copy = {
    postfast_published: {
      label: "PostFast linked",
      description:
        "Published through PostFast with automatic publication attribution.",
    },
    manually_linked: {
      label: "Manually linked",
      description: "Published elsewhere and linked to LumenClip by hand.",
    },
    unlinked: {
      label: "Unlinked",
      description:
        "The publication exists, but its publishing and attribution state is unknown.",
    },
  } satisfies Record<
    PublicationLinkState,
    { label: string; description: string }
  >
  return {
    state,
    hasApiStats: statsSources.has("postfast"),
    hasStudioStats: statsSources.has("tiktok_studio"),
    ...copy[state],
  }
}
