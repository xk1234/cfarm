import "server-only"

import crypto from "node:crypto"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { getCurrentUser } from "@/lib/auth"
import { generationModelRegistry } from "@/lib/realfarm-generation-model-registry"
import type { AutomationUgcConfig } from "@/lib/realfarm-automation"

export type UgcCostTier = "lowcost" | "premium"
export type UgcCostItem = {
  stage: string
  provider: string
  model: string
  quantity: number
  unitCostUsd: number
  costUsd: number
  source: "estimate" | "ledger" | "derived"
}
export type UgcCostBreakdown = {
  currency: "USD"
  tier: UgcCostTier
  items: UgcCostItem[]
  totalUsd: number
}

// VERIFY pricing before enabling ENABLE_UGC_AUTOMATION. These are budgeting
// assumptions, not provider quotes; keep them in sync with provider billing.
export const UGC_PRICING_USD = {
  openrouter: { ugcAnalysis: 0.01, ugcScript: 0.01 },
  fal: {
    flux2ProImage: 0.05,
    hailuo23FastClip: 0.19,
    lipsync: { lowcost: 0.2, premium: 0.8 },
  },
  elevenlabs: { multilingualV2PerCharacter: 0.1 / 900 },
  rendi: { ffmpegComposite: 0.03 },
} as const

const rounded = (value: number) => Math.round(value * 10000) / 10000

function item(
  stage: string,
  provider: string,
  model: string,
  quantity: number,
  unitCostUsd: number,
  source: UgcCostItem["source"] = "estimate"
): UgcCostItem {
  return {
    stage,
    provider,
    model,
    quantity,
    unitCostUsd,
    costUsd: rounded(quantity * unitCostUsd),
    source,
  }
}

export function estimateUgcCost(
  ugc: Partial<AutomationUgcConfig>
): UgcCostBreakdown {
  const tier: UgcCostTier =
    ugc.lipSyncTier === "premium" ? "premium" : "lowcost"
  const brollCount = Math.max(
    0,
    Math.min(6, Math.floor(Number(ugc.brollCount) || 0))
  )
  const durationSeconds = Math.max(
    15,
    Math.min(180, Number(ugc.targetDurationSeconds) || 60)
  )
  const estimatedCharacters = Math.round(durationSeconds * 15)
  const lipSyncModel =
    tier === "premium"
      ? generationModelRegistry.ugc.falKlingAvatarV2Endpoint
      : generationModelRegistry.ugc.falVeedLipSyncEndpoint
  const items = [
    item(
      "analysis",
      "openrouter",
      generationModelRegistry.openRouter.ugcAnalysis.model,
      1,
      UGC_PRICING_USD.openrouter.ugcAnalysis
    ),
    item(
      "script",
      "openrouter",
      generationModelRegistry.openRouter.ugcScript.model,
      1,
      UGC_PRICING_USD.openrouter.ugcScript
    ),
    ...(ugc.actorSource === "generate" || !ugc.actorAssetUrl
      ? [
          item(
            "actor",
            "fal",
            generationModelRegistry.ugc.falFlux2ProEndpoint,
            1,
            UGC_PRICING_USD.fal.flux2ProImage
          ),
        ]
      : []),
    item(
      "voice",
      "elevenlabs",
      ugc.voiceModel || generationModelRegistry.ugc.elevenLabsModelId,
      estimatedCharacters,
      UGC_PRICING_USD.elevenlabs.multilingualV2PerCharacter
    ),
    item(
      "motion",
      "fal",
      generationModelRegistry.ugc.falHailuo23FastEndpoint,
      1,
      UGC_PRICING_USD.fal.hailuo23FastClip
    ),
    item("lipsync", "fal", lipSyncModel, 1, UGC_PRICING_USD.fal.lipsync[tier]),
    ...(brollCount
      ? [
          item(
            "broll",
            "fal",
            generationModelRegistry.ugc.falFlux2ProEndpoint,
            brollCount,
            UGC_PRICING_USD.fal.flux2ProImage
          ),
        ]
      : []),
    item(
      "composite",
      "rendi",
      "ffmpeg",
      1,
      UGC_PRICING_USD.rendi.ffmpegComposite
    ),
  ]
  return {
    currency: "USD",
    tier,
    items,
    totalUsd: rounded(items.reduce((sum, entry) => sum + entry.costUsd, 0)),
  }
}

type LedgerRecord = Record<string, unknown>

export async function actualUgcCostFromLedger(
  runId: string
): Promise<UgcCostBreakdown> {
  const aw = getAppwrite()
  const user = await getCurrentUser()
  if (!aw || !user)
    return { currency: "USD", tier: "lowcost", items: [], totalUsd: 0 }
  const stageKeys = [
    "analysis",
    "script",
    "actor",
    "voice",
    "motion",
    "lipsync",
    ...Array.from({ length: 6 }, (_, index) => `broll-${index}`),
    "composite",
  ]
  const rows = await Promise.all(
    stageKeys.map(async (stage) => {
      const usageId = `usage-${crypto.createHash("sha256").update(`${runId}:${stage}`).digest("hex").slice(0, 24)}`
      const rowId = `u${crypto.createHash("sha256").update(`usage_ledger:${user.$id}:${usageId}`).digest("hex").slice(0, 35)}`
      try {
        return (await aw.tables.getRow(
          APPWRITE_DATABASE_ID,
          "usage_ledger",
          rowId
        )) as LedgerRecord
      } catch (error) {
        if ((error as { code?: number }).code === 404) return null
        throw error
      }
    })
  )
  const records = rows
    .filter((row): row is LedgerRecord => Boolean(row))
    .map((row) => parseRecord(row.data))
    .filter(
      (record): record is LedgerRecord =>
        record?.run_id === runId && record.kind === "ugc_provider"
    )
  const tier: UgcCostTier = records.some((record) =>
    String(record.model).includes("kling")
  )
    ? "premium"
    : "lowcost"
  const items = records.map(costFromLedgerRecord)
  return {
    currency: "USD",
    tier,
    items,
    totalUsd: rounded(items.reduce((sum, entry) => sum + entry.costUsd, 0)),
  }
}

function costFromLedgerRecord(record: LedgerRecord): UgcCostItem {
  const stage = String(record.stage || "unknown")
  const provider = String(record.provider || "unknown")
  const model = String(record.model || "unknown")
  const explicit = finiteNumber(
    record.cost_usd ?? record.costUsd ?? record.cost
  )
  if (explicit !== null)
    return item(stage, provider, model, 1, explicit, "ledger")
  const quantity =
    stage === "voice" ? Math.max(0, finiteNumber(record.units) ?? 0) : 1
  const unitCostUsd = priceFor(stage, model)
  return item(stage, provider, model, quantity, unitCostUsd, "derived")
}

function priceFor(stage: string, model: string) {
  if (stage === "analysis") return UGC_PRICING_USD.openrouter.ugcAnalysis
  if (stage === "script") return UGC_PRICING_USD.openrouter.ugcScript
  if (stage === "voice")
    return UGC_PRICING_USD.elevenlabs.multilingualV2PerCharacter
  if (stage === "motion") return UGC_PRICING_USD.fal.hailuo23FastClip
  if (stage === "lipsync")
    return UGC_PRICING_USD.fal.lipsync[
      model.includes("kling") ? "premium" : "lowcost"
    ]
  if (stage === "actor" || stage.startsWith("broll"))
    return model === "unknown" ? 0 : UGC_PRICING_USD.fal.flux2ProImage
  if (stage === "composite") return UGC_PRICING_USD.rendi.ffmpegComposite
  return 0
}

function parseRecord(value: unknown): LedgerRecord | null {
  if (typeof value !== "string")
    return value && typeof value === "object" ? (value as LedgerRecord) : null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function finiteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
