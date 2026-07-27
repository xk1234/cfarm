export type PublishedUsageRecord = {
  automation_id: string
  kind: string
  run_id: string
  used_at?: string
  [key: string]: unknown
}

export function usageForPublishedRuns<T extends PublishedUsageRecord>(
  usage: T[],
  automationId: string
) {
  const publishedAtByRun = new Map<string, string | undefined>()
  for (const record of usage) {
    if (
      record.automation_id !== automationId ||
      (record.kind !== "hook_published" &&
        record.kind !== "hook_combination_published")
    ) {
      continue
    }
    const current = publishedAtByRun.get(record.run_id)
    if (
      !publishedAtByRun.has(record.run_id) ||
      Date.parse(record.used_at ?? "") > Date.parse(current ?? "")
    ) {
      publishedAtByRun.set(record.run_id, record.used_at)
    }
  }
  return usage.flatMap((record) => {
    if (
      record.automation_id !== automationId ||
      !publishedAtByRun.has(record.run_id)
    ) {
      return []
    }
    const publishedAt = publishedAtByRun.get(record.run_id)
    return publishedAt ? [{ ...record, used_at: publishedAt }] : [record]
  })
}
