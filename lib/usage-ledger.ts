import { clean, isRecord } from "@/lib/guards"
import { createHash } from "node:crypto"
import path from "node:path"

import {
  appendJsonArrayRecords,
  readJsonArrayStore,
  withJsonArrayStore,
} from "@/lib/json-store"

export type UsageKind =
  | "hook"
  | "hook_combination"
  | "hook_published"
  | "hook_combination_published"
  | "image"
  | "text"

export type UsageRecord = {
  id?: string
  automation_id: string
  account_key?: string
  hook_id?: string
  kind: UsageKind
  key: string
  run_id: string
  used_at: string
}

const defaultRootDir = path.join(process.cwd(), "data")
const fileName = "usage-ledger.json"

export async function appendUsageRecords(input: {
  rootDir?: string
  records: UsageRecord[]
  now?: Date
  pruneOlderThanDays?: number
}) {
  const normalizedRecords = dedupeUsageRecords(
    input.records.flatMap((record) => {
      const normalized = normalizeUsageRecord(record)
      return normalized ? [normalized] : []
    })
  )
  if (normalizedRecords.length === 0) return []

  // Usage is append-only on the hot generation path. The previous array-store
  // update read the full ledger twice and rewrote every row for a handful of
  // new entries. Time-window filtering below preserves the same reuse behavior
  // without making every generation pay for historical rows.
  await appendJsonArrayRecords<UsageRecord>({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName,
    key: "usage",
    normalize: normalizeUsageRecord,
    records: normalizedRecords,
  })
  return normalizedRecords
}

export function listUsageRecords(input: { rootDir?: string } = {}) {
  return readJsonArrayStore<UsageRecord>({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName,
    key: "usage",
    normalize: normalizeUsageRecord,
  })
}

export async function deleteUsageRecords(input: {
  rootDir?: string
  runIds?: string[]
  entries?: Array<{
    runId: string
    kind: UsageKind
    key: string
  }>
}) {
  const runIds = new Set((input.runIds ?? []).map(clean).filter(Boolean))
  const entries = new Set(
    (input.entries ?? [])
      .map(
        (entry) => `${clean(entry.runId)}::${entry.kind}::${clean(entry.key)}`
      )
      .filter((entry) => !entry.startsWith("::") && !entry.endsWith("::"))
  )
  if (runIds.size === 0 && entries.size === 0) {
    return []
  }

  return withJsonArrayStore<UsageRecord, UsageRecord[]>({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName,
    key: "usage",
    normalize: normalizeUsageRecord,
    update: (records) => {
      const next = records.filter(
        (record) =>
          !runIds.has(record.run_id) &&
          !entries.has(`${record.run_id}::${record.kind}::${record.key}`)
      )
      return { records: next, result: next }
    },
  })
}

export async function recentUsageKeys(
  kind: UsageKind,
  automationId: string,
  input: {
    accountKey?: string
    rootDir?: string
    withinDays?: number
    allTime?: boolean
    now?: Date
    limit?: number
    records?: UsageRecord[]
  } = {}
) {
  const limited = await recentUsageRecords(kind, automationId, input)
  return new Set(limited.map((record) => record.key))
}

export async function recentUsageRecords(
  kind: UsageKind,
  automationId: string,
  input: {
    accountKey?: string
    rootDir?: string
    withinDays?: number
    allTime?: boolean
    now?: Date
    limit?: number
    records?: UsageRecord[]
  } = {}
) {
  const now = input.now ?? new Date()
  const cutoffTime = input.allTime
    ? Number.NEGATIVE_INFINITY
    : cutoffDate(now, input.withinDays ?? 45).getTime()
  const records = input.records ?? (await listUsageRecords(input))
  const latestByKey = new Map<string, UsageRecord>()
  for (const record of records) {
    if (
      record.automation_id !== automationId ||
      (input.accountKey && record.account_key !== input.accountKey) ||
      record.kind !== kind ||
      Date.parse(record.used_at) < cutoffTime
    ) {
      continue
    }
    const existing = latestByKey.get(record.key)
    if (
      !existing ||
      Date.parse(record.used_at) > Date.parse(existing.used_at)
    ) {
      latestByKey.set(record.key, record)
    }
  }
  const matching = [...latestByKey.values()].sort(
    (a, b) => Date.parse(b.used_at) - Date.parse(a.used_at)
  )
  return input.limit ? matching.slice(0, input.limit) : matching
}

/**
 * Returns usage belonging to runs that have actual publication evidence.
 * Generation-time image/text rows remain useful for auditing, but a draft
 * must not reserve its content from a future generation.
 */
export function usageRecordsForPublishedRuns(
  records: UsageRecord[],
  automationId: string
) {
  const publishedAtByRun = new Map<string, string>()
  for (const record of records) {
    if (
      record.automation_id !== automationId ||
      (record.kind !== "hook_published" &&
        record.kind !== "hook_combination_published")
    ) {
      continue
    }
    const current = publishedAtByRun.get(record.run_id)
    if (!current || Date.parse(record.used_at) > Date.parse(current)) {
      publishedAtByRun.set(record.run_id, record.used_at)
    }
  }
  return records.flatMap((record) => {
    if (record.automation_id !== automationId) return []
    const publishedAt = publishedAtByRun.get(record.run_id)
    return publishedAt ? [{ ...record, used_at: publishedAt }] : []
  })
}

export function usageKeyForHookCombination(
  template: string,
  substitutions: Record<string, string>
) {
  const parts = Object.entries(substitutions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|")
  return `${template}::${parts}`
}

export function usageKeyForHook(hook: string) {
  return clean(hook).toLowerCase().replace(/\s+/g, " ")
}

function normalizeUsageRecord(raw: UsageRecord) {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {}
  const automationId = clean(record.automation_id)
  const accountKey = clean(record.account_key)
  const hookId = clean(record.hook_id)
  const kind = normalizeKind(record.kind)
  const key = clean(record.key)
  const runId = clean(record.run_id)
  if (!automationId || !kind || !key || !runId) {
    return null
  }
  const usedAt = clean(record.used_at) || new Date().toISOString()
  return {
    id:
      clean(record.id) ||
      usageRecordId({ runId, kind, key, accountKey, automationId }),
    automation_id: automationId,
    ...(accountKey ? { account_key: accountKey } : {}),
    ...(hookId ? { hook_id: hookId } : {}),
    kind,
    key,
    run_id: runId,
    used_at: usedAt,
  } satisfies UsageRecord
}

function usageRecordId(input: {
  runId: string
  kind: UsageKind
  key: string
  accountKey: string
  automationId: string
}) {
  const basis = [
    input.automationId,
    input.accountKey,
    input.runId,
    input.kind,
    input.key,
  ].join("\u0000")
  return `u${createHash("sha256").update(basis).digest("hex").slice(0, 35)}`
}

function normalizeKind(value: unknown): UsageKind | null {
  return value === "hook" ||
    value === "hook_combination" ||
    value === "hook_published" ||
    value === "hook_combination_published" ||
    value === "image" ||
    value === "text"
    ? value
    : null
}

function dedupeUsageRecords(records: UsageRecord[]) {
  const seen = new Set<string>()
  return records.filter((record) => {
    const key = `${record.run_id}::${record.kind}::${record.key}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function cutoffDate(now: Date, days: number) {
  return new Date(now.getTime() - Math.max(0, days) * 24 * 60 * 60 * 1000)
}
