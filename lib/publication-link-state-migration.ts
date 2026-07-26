import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import type {
  PostFastPostRecord,
  PostFastStatsSource,
} from "@/lib/postfast-posts"
import type { PublicationLinkState } from "@/lib/publication-link-state"

// The legacy shape lives here rather than on PostFastPostRecord: production is
// migrated and the runtime type no longer carries externallyManaged, but this
// module still has to read records written before that.
export type LegacyPostFastPostRecord = Omit<
  PostFastPostRecord,
  "linkState" | "statsSources"
> & {
  linkState?: PublicationLinkState
  statsSources?: PostFastStatsSource[]
  externallyManaged?: boolean
}

export function migratePublicationLinkState(
  records: readonly LegacyPostFastPostRecord[],
  snapshots: readonly PostFastMetricSnapshot[]
) {
  const sourcesByPostId = new Map<string, Set<PostFastStatsSource>>()
  for (const snapshot of snapshots) {
    const sources = sourcesByPostId.get(snapshot.postId) ?? new Set()
    sources.add(
      snapshot.source === "tiktok_studio" ? "tiktok_studio" : "postfast"
    )
    sourcesByPostId.set(snapshot.postId, sources)
  }

  let changed = 0
  const migrated = records.map((record): PostFastPostRecord => {
    const linkState = backfilledLinkState(record)
    const statsSources = orderedStatsSources(sourcesByPostId.get(record.id))
    const next: LegacyPostFastPostRecord = {
      ...record,
      linkState,
      statsSources,
    }
    delete next.externallyManaged
    if (JSON.stringify(record) !== JSON.stringify(next)) changed += 1
    return next as PostFastPostRecord
  })
  return { records: migrated, changed }
}

export function publicationStateCounts(
  records: readonly LegacyPostFastPostRecord[]
) {
  const counts: Record<PublicationLinkState, number> = {
    postfast_published: 0,
    manually_linked: 0,
    unlinked: 0,
  }
  for (const record of records) counts[backfilledLinkState(record)] += 1
  return counts
}

function backfilledLinkState(
  record: LegacyPostFastPostRecord
): PublicationLinkState {
  if (record.linkState) return record.linkState
  if (record.externallyManaged === true) return "manually_linked"
  if (record.postfastPostId && record.status === "published") {
    return "postfast_published"
  }
  return "unlinked"
}

function orderedStatsSources(
  values: ReadonlySet<PostFastStatsSource> | undefined
): PostFastStatsSource[] {
  return (["postfast", "tiktok_studio"] as const).filter((source) =>
    values?.has(source)
  )
}
