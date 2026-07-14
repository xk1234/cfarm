import path from "node:path"

import { readJsonArrayStore, withJsonArrayStore } from "@/lib/json-store"
import {
  benchmarkXRun,
  defaultXAutomation,
  normalizeXAutomation,
  type XAutomationRecord,
  type XAutomationRun,
} from "@/lib/x-automation"

const rootDir = path.join(process.cwd(), "data", "x-automations")

export async function listXAutomations() {
  return readJsonArrayStore<XAutomationRecord>({
    rootDir,
    fileName: "automations.json",
    key: "automations",
    normalize: normalizeXAutomation,
  })
}

export async function createXAutomation(input: { name?: string } = {}) {
  const existing = await listXAutomations()
  if (existing[0]) return existing[0]
  const record = defaultXAutomation({ name: input.name })
  await withJsonArrayStore<XAutomationRecord>({
    rootDir,
    fileName: "automations.json",
    key: "automations",
    normalize: normalizeXAutomation,
    update: (records) => ({ records: [record, ...records] }),
  })
  return record
}

export async function upsertXAutomation(record: XAutomationRecord) {
  const normalized = normalizeXAutomation(record)
  if (!normalized) throw new Error("Invalid X automation")
  normalized.updatedAt = new Date().toISOString()
  await withJsonArrayStore<XAutomationRecord>({
    rootDir,
    fileName: "automations.json",
    key: "automations",
    normalize: normalizeXAutomation,
    update: (records) => ({
      records: [
        normalized,
        ...records.filter((item) => item.id !== normalized.id),
      ],
    }),
  })
  return normalized
}

export async function deleteXAutomation(id: string) {
  return withJsonArrayStore<XAutomationRecord, XAutomationRecord | null>({
    rootDir,
    fileName: "automations.json",
    key: "automations",
    normalize: normalizeXAutomation,
    update: (records) => ({
      records: records.filter((item) => item.id !== id),
      result: records.find((item) => item.id === id) ?? null,
    }),
  })
}

export async function listXAutomationRuns(automationId?: string) {
  const runs = await readJsonArrayStore<XAutomationRun>({
    rootDir,
    fileName: "runs.json",
    key: "runs",
    normalize: normalizeXAutomationRun,
  })
  return automationId
    ? runs.filter((run) => run.automationId === automationId)
    : runs
}

export async function upsertXAutomationRun(run: XAutomationRun) {
  await withJsonArrayStore<XAutomationRun>({
    rootDir,
    fileName: "runs.json",
    key: "runs",
    normalize: normalizeXAutomationRun,
    update: (runs) => ({
      records: [run, ...runs.filter((item) => item.id !== run.id)].slice(
        0,
        500
      ),
    }),
  })
  return run
}

function normalizeXAutomationRun(run: XAutomationRun) {
  if (!run?.id || !run?.automationId) return null
  const setup = typeof run.setup === "string" ? run.setup : ""
  const proof = typeof run.proof === "string" ? run.proof : ""
  const curiosityGap =
    typeof run.curiosityGap === "string" ? run.curiosityGap : ""
  const benchmark = run.benchmark?.comparison
    ? run.benchmark
    : benchmarkXRun({
        contentType: run.contentType,
        hook: run.hook,
        setup,
        content: Array.isArray(run.content) ? run.content : [],
        proof,
        curiosityGap,
        cta: run.cta,
        posts: Array.isArray(run.posts) ? run.posts : [],
        maxCharacters: 280,
      })
  return {
    ...run,
    setup,
    proof,
    curiosityGap,
    benchmark,
  }
}
