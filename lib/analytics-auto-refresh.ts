import type {
  AccountFollowerSnapshot,
  PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"

export const ANALYTICS_AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000

export function analyticsNeedsRefresh(
  input: {
    integrationIds?: string[]
    snapshots: PostFastMetricSnapshot[]
    followerSnapshots?: AccountFollowerSnapshot[]
  },
  now = Date.now()
) {
  const integrationIds = input.integrationIds?.length
    ? input.integrationIds
    : Array.from(
        new Set([
          ...input.snapshots.map((snapshot) => snapshot.integrationId),
          ...(input.followerSnapshots ?? []).map(
            (snapshot) => snapshot.integrationId
          ),
        ])
      )

  if (integrationIds.length === 0) return true
  return integrationIds.some((integrationId) => {
    const captures = [
      ...input.snapshots
        .filter(
          (snapshot) =>
            snapshot.integrationId === integrationId &&
            snapshot.source !== "tiktok_studio"
        )
        .map((snapshot) => Date.parse(snapshot.capturedAt)),
      ...(input.followerSnapshots ?? [])
        .filter((snapshot) => snapshot.integrationId === integrationId)
        .map((snapshot) => Date.parse(snapshot.capturedAt)),
    ].filter(Number.isFinite)
    const latestCapture = captures.length ? Math.max(...captures) : 0
    return (
      latestCapture === 0 ||
      now - latestCapture >= ANALYTICS_AUTO_REFRESH_INTERVAL_MS
    )
  })
}

export function analyticsRefreshKey(input: {
  integrationIds: string[]
  days: number
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots?: AccountFollowerSnapshot[]
}) {
  const captures = [
    ...input.snapshots
      .filter((snapshot) => snapshot.source !== "tiktok_studio")
      .map((snapshot) => snapshot.capturedAt),
    ...(input.followerSnapshots ?? []).map((snapshot) => snapshot.capturedAt),
  ].sort()
  return JSON.stringify([
    input.days,
    [...input.integrationIds].sort(),
    captures.at(-1) ?? "never",
  ])
}
