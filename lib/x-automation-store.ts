import path from "node:path"

import {
  deleteJsonArrayRecord,
  readJsonArrayRecord,
  readJsonArrayStore,
  upsertJsonArrayRecord,
  withJsonArrayStore,
} from "@/lib/json-store"
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

export async function getXAutomation(id: string) {
  return readJsonArrayRecord<XAutomationRecord>({
    rootDir,
    fileName: "automations.json",
    key: "automations",
    id,
    normalize: normalizeXAutomation,
  })
}

export async function createXAutomation(
  input: {
    name?: string
    platform?: XAutomationRecord["platform"]
  } = {}
) {
  const record = defaultXAutomation({
    name: input.name,
    platform: input.platform,
  })
  await upsertJsonArrayRecord({
    rootDir,
    fileName: "automations.json",
    key: "automations",
    record,
  })
  return record
}

export async function upsertXAutomation(record: XAutomationRecord) {
  const normalized = normalizeXAutomation(record)
  if (!normalized) throw new Error("Invalid X automation")
  normalized.updatedAt = new Date().toISOString()
  await upsertJsonArrayRecord({
    rootDir,
    fileName: "automations.json",
    key: "automations",
    record: normalized,
  })
  return normalized
}

export async function deleteXAutomation(id: string) {
  const existing = await getXAutomation(id)
  if (!existing) return null
  await deleteJsonArrayRecord({
    rootDir,
    fileName: "automations.json",
    key: "automations",
    id,
  })
  return existing
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

export async function getXAutomationRun(id: string) {
  return readJsonArrayRecord<XAutomationRun>({
    rootDir,
    fileName: "runs.json",
    key: "runs",
    id,
    normalize: normalizeXAutomationRun,
  })
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

export async function deleteXAutomationRuns(automationId: string) {
  return withJsonArrayStore<XAutomationRun, XAutomationRun[]>({
    rootDir,
    fileName: "runs.json",
    key: "runs",
    normalize: normalizeXAutomationRun,
    update: (runs) => {
      const deleted = runs.filter((run) => run.automationId === automationId)
      return {
        records: runs.filter((run) => run.automationId !== automationId),
        result: deleted,
      }
    },
  })
}

function normalizeXAutomationRun(
  run: XAutomationRun & { platforms?: XAutomationRecord["platform"][] }
) {
  if (!run?.id || !run?.automationId) return null
  const setup = typeof run.setup === "string" ? run.setup : ""
  const proof = typeof run.proof === "string" ? run.proof : ""
  const curiosityGap =
    typeof run.curiosityGap === "string" ? run.curiosityGap : ""
  const platform =
    run.platform === "threads" || run.platform === "x"
      ? run.platform
      : run.platforms?.includes("threads") && !run.platforms?.includes("x")
        ? "threads"
        : "x"
  const benchmark = run.benchmark?.comparison
    ? run.benchmark
    : benchmarkXRun({
        platform,
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
    platform,
    setup,
    proof,
    curiosityGap,
    benchmark,
  }
}
