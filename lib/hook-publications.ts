import { clean } from "@/lib/guards"
import {
  listAutomationRuns,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import { getAutomationRecord } from "@/lib/automations"
import {
  automationHookItems,
  type AutomationHookItem,
} from "@/lib/realfarm-automation"
import {
  listPostFastPostRecords,
  type PostFastPostRecord,
} from "@/lib/postfast-posts"
import {
  listMetricSnapshots,
  type PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import {
  appendUsageRecords,
  listUsageRecords,
  type UsageRecord,
  usageKeyForHook,
  usageKeyForHookCombination,
} from "@/lib/usage-ledger"
import type { CanonicalMetric } from "@/lib/metric-registry"

export type HookAnalyticsRow = {
  hookId: string
  text: string
  enabled: boolean
  publishedPosts: number
  publishCount: number
  lastPublishedAt: string
  providers: string[]
  metrics: Partial<Record<CanonicalMetric, number>>
  views: number
  shares: number
  saves: number
  shareRate: number | null
  meanSlide1To2RetentionPercent: number | null
}

export type HookUsageState = {
  hookId: string
  used: boolean
  publishedPosts: number
  lastPublishedAt?: string
}

export async function recordPublishedHookUsage(
  publication: PostFastPostRecord
) {
  if (publication.status !== "published") return []
  const run = await runForPublication(publication)
  if (!run || !run.plan.hook) return []
  const usedAt = publication.publishedAt || publication.updatedAt
  const records: UsageRecord[] = [
    {
      automation_id: run.automationId,
      account_key: publication.integrationId,
      ...(run.plan.hookId ? { hook_id: run.plan.hookId } : {}),
      kind: "hook_published",
      key: usageKeyForHook(run.plan.hook),
      run_id: run.id,
      used_at: usedAt,
    },
  ]
  if (
    run.plan.hookTemplate &&
    run.plan.hookSubstitutions &&
    Object.keys(run.plan.hookSubstitutions).length > 0
  ) {
    records.push({
      automation_id: run.automationId,
      account_key: publication.integrationId,
      ...(run.plan.hookId ? { hook_id: run.plan.hookId } : {}),
      kind: "hook_combination_published",
      key: usageKeyForHookCombination(
        run.plan.hookTemplate,
        run.plan.hookSubstitutions
      ),
      run_id: run.id,
      used_at: usedAt,
    })
  }
  return appendUsageRecords({ records })
}

export async function hookAnalyticsReport(
  automationId: string,
  options: { days?: number; now?: Date } = {}
) {
  const automation = await getAutomationRecord(automationId)
  if (!automation) return null
  const now = options.now ?? new Date()
  const days = Math.max(1, options.days ?? 3650)
  const since = new Date(
    now.getTime() - days * 24 * 60 * 60 * 1000
  ).toISOString()
  const hookItems = automationHookItems(automation.schema)
  const runs = await listAutomationRuns({
    automationId,
    limit: Number.MAX_SAFE_INTEGER,
    postRecords: [],
  })
  const sourceIds = runs.flatMap((run) =>
    run.slideshowId ? [run.id, run.slideshowId] : [run.id]
  )
  const [publications, snapshots, usageRecords] = await Promise.all([
    listPostFastPostRecords({ sourceIds }).catch(() => []),
    listMetricSnapshots().catch(() => []),
    listUsageRecords().catch(() => []),
  ])
  const runById = new Map(runs.map((run) => [run.id, run]))
  const runBySlideshow = new Map(
    runs.flatMap((run) => (run.slideshowId ? [[run.slideshowId, run]] : []))
  )
  const latestSnapshotByPost = latestSnapshots(snapshots)
  const aggregates = new Map<
    string,
    {
      item: AutomationHookItem
      publications: Set<string>
      providers: Set<string>
      lastPublishedAt: string
      metrics: Partial<Record<CanonicalMetric, number>>
      retentionRatios: number[]
    }
  >()
  let unattributedPublishedPosts = 0
  let snapshotRecoveredPosts = 0
  const observedPostIds = new Set<string>()

  for (const publication of publications) {
    const snapshot = latestSnapshotByPost.get(publication.id)
    const publishedAt =
      publication.status === "published"
        ? publication.publishedAt || publication.updatedAt
        : snapshot?.publishedAt
    if (!publishedAt || Date.parse(publishedAt) < Date.parse(since)) continue
    observedPostIds.add(publication.id)
    const run = runForSource(
      publication.sourceType,
      publication.sourceId,
      runById,
      runBySlideshow
    )
    if (!run) {
      unattributedPublishedPosts += 1
      continue
    }
    const item = hookItemForRun(run, hookItems)
    if (!item) {
      unattributedPublishedPosts += 1
      continue
    }
    addHookObservation({
      aggregates,
      item,
      postId: publication.id,
      provider: publication.provider,
      publishedAt,
      snapshot,
      postSnapshots: snapshotsForPost(snapshots, publication.id),
    })
  }

  // Studio snapshots are independently owner-scoped evidence of a published
  // platform post. They retain sourceType/sourceId even when an older output
  // was marked published without a persisted publication array.
  for (const snapshot of latestSnapshotByPost.values()) {
    if (observedPostIds.has(snapshot.postId)) continue
    const publishedAt = snapshot.publishedAt ?? snapshot.capturedAt
    if (Date.parse(publishedAt) < Date.parse(since)) continue
    const run = runForSource(
      snapshot.sourceType,
      snapshot.sourceId,
      runById,
      runBySlideshow
    )
    if (!run) continue
    const item = hookItemForRun(run, hookItems)
    if (!item) {
      unattributedPublishedPosts += 1
      continue
    }
    snapshotRecoveredPosts += 1
    addHookObservation({
      aggregates,
      item,
      postId: snapshot.postId,
      provider: snapshot.provider,
      publishedAt,
      snapshot,
      postSnapshots: snapshotsForPost(snapshots, snapshot.postId),
    })
  }

  const rows: HookAnalyticsRow[] = [...aggregates.values()]
    .map((aggregate) => ({
      hookId: aggregate.item.id,
      text: aggregate.item.text,
      enabled: aggregate.item.enabled,
      publishedPosts: aggregate.publications.size,
      publishCount: aggregate.publications.size,
      lastPublishedAt: aggregate.lastPublishedAt,
      providers: [...aggregate.providers].sort(),
      metrics: withEngagementRate(aggregate.metrics),
      views: aggregate.metrics.views ?? 0,
      shares: aggregate.metrics.shares ?? 0,
      saves: aggregate.metrics.saves ?? 0,
      shareRate: aggregate.metrics.views
        ? ((aggregate.metrics.shares ?? 0) / aggregate.metrics.views) * 100
        : null,
      meanSlide1To2RetentionPercent:
        aggregate.retentionRatios.length > 0
          ? aggregate.retentionRatios.reduce((sum, value) => sum + value, 0) /
            aggregate.retentionRatios.length
          : null,
    }))
    .sort(
      (left, right) =>
        Date.parse(right.lastPublishedAt) - Date.parse(left.lastPublishedAt)
    )
  const rowsByHook = new Map(rows.map((row) => [row.hookId, row]))
  const historicallyUsedIds = new Set(
    usageRecords.flatMap((record) => {
      if (
        record.automation_id !== automationId ||
        record.kind !== "hook_published"
      ) {
        return []
      }
      if (record.hook_id) return [record.hook_id]
      const run = runById.get(record.run_id)
      const item = run ? hookItemForRun(run, hookItems) : undefined
      return item ? [item.id] : []
    })
  )
  const hooks: HookUsageState[] = hookItems.map((item) => {
    const row = rowsByHook.get(item.id)
    return {
      hookId: item.id,
      used: Boolean(row) || historicallyUsedIds.has(item.id),
      publishedPosts: row?.publishedPosts ?? 0,
      ...(row?.lastPublishedAt ? { lastPublishedAt: row.lastPublishedAt } : {}),
    }
  })
  const rowsById = new Map(rows.map((row) => [row.hookId, row]))
  const performance = [
    ...hookItems.map(
      (item) =>
        rowsById.get(item.id) ?? {
          hookId: item.id,
          text: item.text,
          enabled: item.enabled,
          publishedPosts: 0,
          publishCount: 0,
          lastPublishedAt: "",
          providers: [],
          metrics: {},
          views: 0,
          shares: 0,
          saves: 0,
          shareRate: null,
          meanSlide1To2RetentionPercent: null,
        }
    ),
    ...rows.filter((row) => !hookItems.some((item) => item.id === row.hookId)),
  ]
  const publishedOutputsWithoutPublication = runs.filter(
    (run) =>
      Boolean(run.manuallyPublishedAt) &&
      !publications.some((publication) =>
        publicationMatchesRun(publication, run)
      )
  ).length
  const dataWarnings = [
    ...(unattributedPublishedPosts > 0
      ? [
          `${unattributedPublishedPosts} published ${
            unattributedPublishedPosts === 1 ? "post" : "posts"
          } could not be attributed to hooks.`,
        ]
      : []),
    ...(publishedOutputsWithoutPublication > 0
      ? [
          `${publishedOutputsWithoutPublication} published ${
            publishedOutputsWithoutPublication === 1
              ? "output is"
              : "outputs are"
          } missing a publication record.`,
        ]
      : []),
    ...(snapshotRecoveredPosts > 0
      ? [
          `${snapshotRecoveredPosts} ${
            snapshotRecoveredPosts === 1 ? "post was" : "posts were"
          } attributed through analytics snapshots because publication records were unavailable.`,
        ]
      : []),
  ]
  return {
    automationId,
    days,
    since,
    hooks,
    rows,
    performance,
    attribution: {
      attributedPosts: rows.reduce(
        (total, row) => total + row.publishedPosts,
        0
      ),
      unattributedPublishedPosts,
      publishedOutputsWithoutPublication,
      snapshotRecoveredPosts,
    },
    dataWarnings,
    dataWarning: dataWarnings.length > 0 ? dataWarnings.join(" ") : undefined,
  }
}

export async function usedHookIdsForAutomation(automationId: string) {
  const report = await hookAnalyticsReport(automationId)
  return new Set(
    report?.hooks.filter((hook) => hook.used).map((hook) => hook.hookId) ?? []
  )
}

async function runForPublication(publication: PostFastPostRecord) {
  const runs = await listAutomationRuns({
    limit: Number.MAX_SAFE_INTEGER,
    postRecords: [],
  })
  return runs.find(
    (run) =>
      (publication.sourceType === "automation" &&
        run.id === publication.sourceId) ||
      (publication.sourceType === "slideshow" &&
        run.slideshowId === publication.sourceId)
  )
}

function hookItemForRun(run: AutomationRunRecord, items: AutomationHookItem[]) {
  if (run.plan.hookId) {
    const byId = items.find((item) => item.id === run.plan.hookId)
    if (byId) return byId
    return {
      id: run.plan.hookId,
      text: run.plan.hookTemplate || run.plan.hook,
      enabled: false,
      createdAt: run.createdAt,
    }
  }
  const candidates = [run.plan.hookTemplate, run.plan.hook]
    .map(normalizedText)
    .filter(Boolean)
  return items.find((item) => candidates.includes(normalizedText(item.text)))
}

function runForSource(
  sourceType: string | undefined,
  sourceId: string | undefined,
  runById: Map<string, AutomationRunRecord>,
  runBySlideshow: Map<string, AutomationRunRecord>
) {
  if (!sourceId) return undefined
  if (sourceType === "automation") return runById.get(sourceId)
  if (sourceType === "slideshow") return runBySlideshow.get(sourceId)
  return runById.get(sourceId) ?? runBySlideshow.get(sourceId)
}

function publicationMatchesRun(
  publication: PostFastPostRecord,
  run: AutomationRunRecord
) {
  return (
    (publication.sourceType === "automation" &&
      publication.sourceId === run.id) ||
    (publication.sourceType === "slideshow" &&
      publication.sourceId === run.slideshowId)
  )
}

function addHookObservation(input: {
  aggregates: Map<
    string,
    {
      item: AutomationHookItem
      publications: Set<string>
      providers: Set<string>
      lastPublishedAt: string
      metrics: Partial<Record<CanonicalMetric, number>>
      retentionRatios: number[]
    }
  >
  item: AutomationHookItem
  postId: string
  provider: string
  publishedAt: string
  snapshot?: PostFastMetricSnapshot
  postSnapshots: PostFastMetricSnapshot[]
}) {
  const aggregate = input.aggregates.get(input.item.id) ?? {
    item: input.item,
    publications: new Set<string>(),
    providers: new Set<string>(),
    lastPublishedAt: input.publishedAt,
    metrics: {},
    retentionRatios: [],
  }
  if (!aggregate.publications.has(input.postId)) {
    aggregate.publications.add(input.postId)
    aggregate.providers.add(input.provider)
    aggregate.lastPublishedAt = laterDate(
      aggregate.lastPublishedAt,
      input.publishedAt
    )
    if (input.snapshot) addMetrics(aggregate.metrics, input.snapshot.metrics)
    const retention = slideOneToTwoRetention(input.postSnapshots)
    if (retention !== null) aggregate.retentionRatios.push(retention)
  }
  input.aggregates.set(input.item.id, aggregate)
}

function snapshotsForPost(snapshots: PostFastMetricSnapshot[], postId: string) {
  return snapshots
    .filter((snapshot) => snapshot.postId === postId)
    .sort(
      (left, right) =>
        Date.parse(right.capturedAt) - Date.parse(left.capturedAt)
    )
}

function slideOneToTwoRetention(snapshots: PostFastMetricSnapshot[]) {
  for (const snapshot of snapshots) {
    const slides = snapshot.tiktokStudio?.slides ?? []
    const slideOne = slides.find((slide) => slide.slideIndex === 1)
    const slideTwo = slides.find((slide) => slide.slideIndex === 2)
    const first = slideOne?.retentionPercent
    const second = slideTwo?.retentionPercent
    if (
      typeof first === "number" &&
      Number.isFinite(first) &&
      first > 0 &&
      typeof second === "number" &&
      Number.isFinite(second)
    ) {
      return (second / first) * 100
    }
  }
  return null
}

function latestSnapshots(snapshots: PostFastMetricSnapshot[]) {
  const latest = new Map<string, PostFastMetricSnapshot>()
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.postId)
    if (
      !current ||
      Date.parse(snapshot.capturedAt) > Date.parse(current.capturedAt)
    ) {
      latest.set(snapshot.postId, snapshot)
    }
  }
  return latest
}

function addMetrics(
  target: Partial<Record<CanonicalMetric, number>>,
  source: Partial<Record<CanonicalMetric, number>>
) {
  for (const [metric, value] of Object.entries(source)) {
    if (metric === "engagementRate" || !Number.isFinite(value)) continue
    const key = metric as CanonicalMetric
    target[key] = (target[key] ?? 0) + Number(value)
  }
}

function withEngagementRate(metrics: Partial<Record<CanonicalMetric, number>>) {
  const denominator = metrics.views || metrics.impressions || metrics.reach
  return {
    ...metrics,
    ...(denominator
      ? { engagementRate: ((metrics.interactions ?? 0) / denominator) * 100 }
      : {}),
  }
}

function laterDate(left: string, right: string) {
  return Date.parse(right) > Date.parse(left) ? right : left
}

function normalizedText(value: string | undefined) {
  return clean(value).toLowerCase().replace(/\s+/g, " ")
}
