import { DateTime } from "luxon"
import { providerName } from "./account-profile-icon"
import type { AnalyticsPayload } from "./analytics-view"
import { canonicalMetricOrder, type CanonicalMetric } from "@/lib/metric-registry"
import type { AccountFollowerSnapshot, PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import type { SocialIntegration } from "@/lib/social/provider-contract"

export type LatestPost = PostFastMetricSnapshot & { previous?: PostFastMetricSnapshot }

export function latestSnapshotsByPost(
  snapshots: PostFastMetricSnapshot[]
): LatestPost[] {
  const groups = new Map<string, PostFastMetricSnapshot[]>()
  for (const snapshot of snapshots) {
    const key = `${snapshot.integrationId}:${snapshot.postId}`
    groups.set(key, [...(groups.get(key) ?? []), snapshot])
  }
  return [...groups.values()].map((group) => {
    const sorted = group.sort(
      (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
    )
    return { ...sorted[sorted.length - 1], previous: sorted.at(-2) }
  })
}

export function postMetricSeries(
  snapshots: PostFastMetricSnapshot[],
  metric: CanonicalMetric
) {
  const latestByPostAndDay = latestSnapshotsPerPostDay(snapshots)
  const byDay = new Map<string, number[]>()
  for (const snapshot of latestByPostAndDay.values()) {
    const value = snapshot.metrics[metric]
    if (value === undefined) continue
    const day = snapshot.capturedAt.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), value])
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      label: DateTime.fromISO(date).toFormat("LLL d"),
      value: values.reduce((sum, value) => sum + value, 0),
    }))
}

export function audienceSeries(
  snapshots: AccountFollowerSnapshot[],
  integrationIds: string[]
) {
  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
  )
  const days = [
    ...new Set(sorted.map((point) => point.capturedAt.slice(0, 10))),
  ].sort()
  return days.flatMap((day) => {
    const end = Date.parse(`${day}T23:59:59.999Z`)
    const values = integrationIds.flatMap((id) => {
      const latest = sorted
        .filter(
          (point) =>
            point.integrationId === id && Date.parse(point.capturedAt) <= end
        )
        .at(-1)
      return latest ? [latest.followers] : []
    })
    return values.length
      ? [
          {
            date: day,
            label: DateTime.fromISO(day).toFormat("LLL d"),
            value: values.reduce((a, b) => a + b, 0),
          },
        ]
      : []
  })
}

export function comparisonSeries({
  accounts,
  snapshots,
  followers,
  metric,
  indexed,
}: {
  accounts: SocialIntegration[]
  snapshots: PostFastMetricSnapshot[]
  followers: AccountFollowerSnapshot[]
  metric: CanonicalMetric
  indexed: boolean
}) {
  const byAccount = new Map<string, Array<{ date: string; value: number }>>()
  for (const account of accounts) {
    const series =
      metric === "followers"
        ? audienceSeries(
            followers.filter(
              (point) => point.integrationId === account.integration_id
            ),
            [account.integration_id]
          )
        : accountPostMetricSeries(
            snapshots.filter(
              (snapshot) => snapshot.integrationId === account.integration_id
            ),
            metric
          )
    const baseline = series.find((point) => point.value > 0)?.value
    byAccount.set(
      account.integration_id,
      series.map((point) => ({
        date: point.date,
        value:
          indexed && baseline ? (point.value / baseline) * 100 : point.value,
      }))
    )
  }
  const days = [
    ...new Set(
      [...byAccount.values()].flatMap((series) =>
        series.map((point) => point.date)
      )
    ),
  ].sort()
  return days.map((date) => {
    const row: Record<string, string | number | undefined> = {
      date,
      label: DateTime.fromISO(date).toFormat("LLL d"),
    }
    for (const account of accounts)
      row[account.integration_id] = byAccount
        .get(account.integration_id)
        ?.find((point) => point.date === date)?.value
    return row
  })
}

export function accountPostMetricSeries(
  snapshots: PostFastMetricSnapshot[],
  metric: CanonicalMetric
) {
  if (metric !== "engagementRate") return postMetricSeries(snapshots, metric)
  const latest = latestSnapshotsPerPostDay(snapshots)
  const byDay = new Map<string, PostFastMetricSnapshot[]>()
  for (const snapshot of latest.values()) {
    const day = snapshot.capturedAt.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), snapshot])
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, points]) => {
      const value = weightedEngagementRate(points)
      return value === undefined
        ? []
        : [{ date, label: DateTime.fromISO(date).toFormat("LLL d"), value }]
    })
}

export function latestSnapshotsPerPostDay(snapshots: PostFastMetricSnapshot[]) {
  const map = new Map<string, PostFastMetricSnapshot>()
  for (const snapshot of [...snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
  )) {
    map.set(
      `${snapshot.capturedAt.slice(0, 10)}:${snapshot.integrationId}:${snapshot.postId}`,
      snapshot
    )
  }
  return map
}

export function metricAggregate(
  posts: PostFastMetricSnapshot[],
  metric: CanonicalMetric
) {
  return sumDefined(posts.map((post) => post.metrics[metric]))
}

export function weightedEngagementRate(posts: PostFastMetricSnapshot[]) {
  const comparable = posts.flatMap((post) => {
    const interactions = post.metrics.interactions
    const exposure =
      post.metrics.impressions ?? post.metrics.views ?? post.metrics.reach
    return interactions !== undefined && exposure !== undefined && exposure > 0
      ? [{ interactions, exposure }]
      : []
  })
  if (!comparable.length) return undefined
  const interactions = comparable.reduce(
    (sum, row) => sum + row.interactions,
    0
  )
  const exposure = comparable.reduce((sum, row) => sum + row.exposure, 0)
  return exposure ? (interactions / exposure) * 100 : undefined
}

export function accountMetricCurrent({
  integrationId,
  metric,
  posts,
  followers,
}: {
  integrationId: string
  metric: CanonicalMetric
  posts: LatestPost[]
  followers: AccountFollowerSnapshot[]
}) {
  if (metric === "followers")
    return latestFollower(
      followers.filter((point) => point.integrationId === integrationId)
    )
  const accountPosts = posts.filter(
    (post) => post.integrationId === integrationId
  )
  return metric === "engagementRate"
    ? weightedEngagementRate(accountPosts)
    : metricAggregate(accountPosts, metric)
}

export function accountMetricChange({
  integrationId,
  metric,
  snapshots,
  followers,
}: {
  integrationId: string
  metric: CanonicalMetric
  snapshots: PostFastMetricSnapshot[]
  followers: AccountFollowerSnapshot[]
}) {
  const series =
    metric === "followers"
      ? audienceSeries(
          followers.filter((point) => point.integrationId === integrationId),
          [integrationId]
        )
      : accountPostMetricSeries(
          snapshots.filter(
            (snapshot) => snapshot.integrationId === integrationId
          ),
          metric
        )
  if (series.length < 2) return undefined
  return series.at(-1)!.value - series[0].value
}

export function availablePlatformMetrics({
  accounts,
  capabilities,
  snapshots,
  followers,
  selectedIds,
}: {
  accounts: SocialIntegration[]
  capabilities: AnalyticsPayload["capabilities"]
  snapshots: PostFastMetricSnapshot[]
  followers: AccountFollowerSnapshot[]
  selectedIds: string[]
}) {
  const ids = new Set(
    selectedIds.length
      ? selectedIds
      : accounts.map((item) => item.integration_id)
  )
  const metrics = new Set<CanonicalMetric>()
  for (const account of accounts) {
    if (!ids.has(account.integration_id)) continue
    for (const metric of capabilities[account.integration_id]?.metrics ?? [])
      metrics.add(metric)
  }
  if (
    snapshots.some(
      (point) =>
        ids.has(point.integrationId) &&
        point.metrics.engagementRate !== undefined
    )
  )
    metrics.add("engagementRate")
  if (followers.some((point) => ids.has(point.integrationId)))
    metrics.add("followers")
  return canonicalMetricOrder.filter((metric) => metrics.has(metric))
}

export function defaultPlatformMetric(platform: string, metrics: CanonicalMetric[]) {
  const preferred: CanonicalMetric[] = [
    "instagram",
    "facebook",
    "linkedin",
    "pinterest",
  ].includes(platform)
    ? ["impressions", "views"]
    : ["views", "impressions"]
  return (
    preferred.find((metric) => metrics.includes(metric)) ??
    metrics[0] ??
    initialMetricForPlatform(platform)
  )
}

export function initialMetricForPlatform(platform?: string): CanonicalMetric {
  if (
    [
      "x",
      "threads",
      "bluesky",
      "telegram",
      "google-business-profile",
      "google",
      "tiktok-creative",
      "tiktok-seller",
    ].includes(platform || "")
  )
    return "followers"
  if (["tiktok", "youtube"].includes(platform || "")) return "views"
  return "impressions"
}

export function capabilitiesForSelected(
  accounts: SocialIntegration[],
  selectedIds: string[],
  capabilities: AnalyticsPayload["capabilities"]
) {
  const selected = new Set(selectedIds)
  return accounts.some(
    (account) =>
      selected.has(account.integration_id) &&
      capabilities[account.integration_id]?.supported
  )
}

export function metricAccountCoverage({
  metric,
  accounts,
  selectedIds,
  posts,
  followers,
}: {
  metric: CanonicalMetric
  accounts: SocialIntegration[]
  selectedIds: string[]
  posts: LatestPost[]
  followers: AccountFollowerSnapshot[]
}) {
  return accounts.filter(
    (account) =>
      selectedIds.includes(account.integration_id) &&
      accountMetricCurrent({
        integrationId: account.integration_id,
        metric,
        posts,
        followers,
      }) !== undefined
  ).length
}

export function latestFollowerTotal(
  snapshots: AccountFollowerSnapshot[],
  ids: string[]
) {
  return sumDefined(
    ids.map((id) =>
      latestFollower(snapshots.filter((point) => point.integrationId === id))
    )
  )
}

export function latestFollower(points: AccountFollowerSnapshot[]) {
  return [...points]
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
    .at(-1)?.followers
}

export function seriesDelta(series: Array<{ value: number }>) {
  if (series.length < 2 || series[0].value === 0) return null
  return ((series.at(-1)!.value - series[0].value) / series[0].value) * 100
}

export function postCoverageLabel(posts: LatestPost[], metric: CanonicalMetric) {
  const count = posts.filter(
    (post) => post.metrics[metric] !== undefined
  ).length
  return `${count} of ${posts.length} posts report this metric`
}

export function accountCoverageLabel(ids: string[], total: number) {
  return `${new Set(ids).size} of ${total} accounts report followers`
}

export function sumDefined(values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => value !== undefined)
  return defined.length
    ? defined.reduce((sum, value) => sum + value, 0)
    : undefined
}

export function postTimestamp(post: LatestPost) {
  return Date.parse(post.publishedAt || post.capturedAt) || 0
}

export function formatPostDate(post: LatestPost) {
  const date = DateTime.fromISO(post.publishedAt || post.capturedAt)
  return date.isValid ? date.toFormat("LLL d") : "Recent"
}

export function formatMetric(metric: CanonicalMetric, value: number | undefined) {
  if (value === undefined) return "—"
  return metric === "engagementRate"
    ? `${value.toFixed(2)}%`
    : formatAnalyticsNumber(value)
}

export function formatOptionalNumber(value: number | undefined) {
  return value === undefined ? "—" : formatAnalyticsNumber(value)
}

export function formatChange(value: number | undefined) {
  if (value === undefined) return "—"
  return `${value > 0 ? "+" : ""}${formatAnalyticsNumber(value)}`
}

export function formatAnalyticsNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)
}

export function fallbackIntegration(post: LatestPost): SocialIntegration {
  return {
    integration_id: post.integrationId,
    provider: post.provider as SocialIntegration["provider"],
    name: `${providerName(post.provider)} account`,
  }
}
