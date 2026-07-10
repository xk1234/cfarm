import { clean, isRecord } from "@/lib/guards"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { readJsonArrayStore, withJsonArrayStore } from "@/lib/json-store"

export type UsageKind = "hook" | "hook_combination" | "image" | "text"

export type UsageRecord = {
  id?: string
  automation_id: string
  account_key?: string
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
  const now = input.now ?? new Date()
  const cutoff = cutoffDate(now, input.pruneOlderThanDays ?? 45)
  const normalizedRecords = input.records.flatMap((record) => {
    const normalized = normalizeUsageRecord(record)
    return normalized ? [normalized] : []
  })

  return withJsonArrayStore<UsageRecord, UsageRecord[]>({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName,
    key: "usage",
    normalize: normalizeUsageRecord,
    update: (records) => {
      const next = dedupeUsageRecords(
        records
          .filter((record) => Date.parse(record.used_at) >= cutoff.getTime())
          .concat(normalizedRecords)
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
    now?: Date
    limit?: number
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
    now?: Date
    limit?: number
  } = {}
) {
  const now = input.now ?? new Date()
  const cutoff = cutoffDate(now, input.withinDays ?? 45)
  const records = await readJsonArrayStore<UsageRecord>({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName,
    key: "usage",
    normalize: normalizeUsageRecord,
  })
  const latestByKey = new Map<string, UsageRecord>()
  for (const record of records) {
    if (
      record.automation_id !== automationId ||
      (input.accountKey && record.account_key !== input.accountKey) ||
      record.kind !== kind ||
      Date.parse(record.used_at) < cutoff.getTime()
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
  const kind = normalizeKind(record.kind)
  const key = clean(record.key)
  const runId = clean(record.run_id)
  if (!automationId || !kind || !key || !runId) {
    return null
  }
  const usedAt = clean(record.used_at) || new Date().toISOString()
  return {
    id: clean(record.id) || `usage-${randomUUID()}`,
    automation_id: automationId,
    ...(accountKey ? { account_key: accountKey } : {}),
    kind,
    key,
    run_id: runId,
    used_at: usedAt,
  } satisfies UsageRecord
}

function normalizeKind(value: unknown): UsageKind | null {
  return value === "hook" ||
    value === "hook_combination" ||
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
