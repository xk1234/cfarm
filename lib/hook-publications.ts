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
  lastPublishedAt: string
  providers: string[]
  metrics: Partial<Record<CanonicalMetric, number>>
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

export async function hookAnalyticsReport(automationId: string) {
  const automation = await getAutomationRecord(automationId)
  if (!automation) return null
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
    }
  >()

  for (const publication of publications) {
    const snapshot = latestSnapshotByPost.get(publication.id)
    const publishedAt =
      publication.status === "published"
        ? publication.publishedAt || publication.updatedAt
        : snapshot?.publishedAt
    if (!publishedAt) continue
    const run =
      publication.sourceType === "automation"
        ? runById.get(publication.sourceId)
        : publication.sourceType === "slideshow"
          ? runBySlideshow.get(publication.sourceId)
          : undefined
    if (!run) continue
    const item = hookItemForRun(run, hookItems)
    if (!item) continue
    const aggregate = aggregates.get(item.id) ?? {
      item,
      publications: new Set<string>(),
      providers: new Set<string>(),
      lastPublishedAt: publishedAt,
      metrics: {},
    }
    if (!aggregate.publications.has(publication.id)) {
      aggregate.publications.add(publication.id)
      aggregate.providers.add(publication.provider)
      aggregate.lastPublishedAt = laterDate(
        aggregate.lastPublishedAt,
        publishedAt
      )
      if (snapshot) addMetrics(aggregate.metrics, snapshot.metrics)
    }
    aggregates.set(item.id, aggregate)
  }

  const rows: HookAnalyticsRow[] = [...aggregates.values()]
    .map((aggregate) => ({
      hookId: aggregate.item.id,
      text: aggregate.item.text,
      enabled: aggregate.item.enabled,
      publishedPosts: aggregate.publications.size,
      lastPublishedAt: aggregate.lastPublishedAt,
      providers: [...aggregate.providers].sort(),
      metrics: withEngagementRate(aggregate.metrics),
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
  return { automationId, hooks, rows }
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
  }
  const candidates = [run.plan.hookTemplate, run.plan.hook]
    .map(normalizedText)
    .filter(Boolean)
  return items.find((item) => candidates.includes(normalizedText(item.text)))
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
