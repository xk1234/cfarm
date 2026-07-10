import type { SwipeRecord } from "@/lib/swipes"

// B5.1 — Swipe "winner" score.
//
// Deterministic, weighted blend of the signals available on a SwipeRecord:
//   - engagement:  likes/comments/shares (log-scaled so one viral outlier
//                  doesn't swamp everything).
//   - performance: ctr_rank / cvr_rank strings (lower rank OR "top X%" = better).
//   - longevity:   how long the ad has been observed running (B2.2). A long
//                  runner is a likely winner.
//   - recency:     newer swipes score slightly higher (fresh creative).
//
// Each component is normalized to 0..1, then combined with the WEIGHTS below.
// Final score is 0..100. The breakdown is returned for UI transparency and is
// unit-tested for stability.

export type SwipeScoreBreakdown = {
  engagement: number
  performance: number
  longevity: number
  recency: number
}

export type SwipeScore = {
  score: number
  breakdown: SwipeScoreBreakdown
  weights: SwipeScoreBreakdown
}

const WEIGHTS: SwipeScoreBreakdown = {
  engagement: 0.35,
  performance: 0.3,
  longevity: 0.25,
  recency: 0.1,
}

// Reference points for normalization (documented, not magic):
const ENGAGEMENT_SATURATION = 100_000 // total interactions that maps to ~1.0
const LONGEVITY_SATURATION_DAYS = 45 // an ad running 45+ days = full marks
const RECENCY_HALFLIFE_DAYS = 30 // score halves every 30 days since swiped

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

function engagementScore(swipe: SwipeRecord): number {
  const total =
    (swipe.likes ?? 0) + (swipe.comments ?? 0) + (swipe.shares ?? 0)
  if (total <= 0) {
    return 0
  }
  // log scale: log10(total+1) / log10(SATURATION+1)
  return clamp01(Math.log10(total + 1) / Math.log10(ENGAGEMENT_SATURATION + 1))
}

// Parse a rank string into 0..1 (1 = best). Handles:
//   "1", "#2", "Top 5%", "top 10 %", "12", ""/unknown.
export function rankToUnit(rank: string | undefined): number | null {
  if (!rank) {
    return null
  }
  const normalized = rank.toLowerCase().trim()
  const percentMatch = normalized.match(/top\s*(\d+(?:\.\d+)?)\s*%/)
  if (percentMatch) {
    const pct = Number(percentMatch[1])
    if (Number.isFinite(pct)) {
      // top 1% -> ~1.0, top 50% -> 0.5, top 100% -> 0
      return clamp01(1 - pct / 100)
    }
  }
  const numberMatch = normalized.match(/(\d+(?:\.\d+)?)/)
  if (numberMatch) {
    const value = Number(numberMatch[1])
    if (Number.isFinite(value)) {
      if (normalized.includes("%")) {
        return clamp01(1 - value / 100)
      }
      // Plain ordinal rank: 1 -> 1.0, 10 -> ~0.1, floor at 0.
      return clamp01(1 - (value - 1) / 20)
    }
  }
  return null
}

function performanceScore(swipe: SwipeRecord): number {
  const units = [
    rankToUnit(swipe.ctr_rank),
    rankToUnit(swipe.cvr_rank),
    rankToUnit(swipe.clicks_rank),
    rankToUnit(swipe.conversion_rank),
  ].filter((value): value is number => value !== null)
  if (units.length === 0) {
    return 0
  }
  return units.reduce((sum, value) => sum + value, 0) / units.length
}

function longevityScore(swipe: SwipeRecord, now: Date): number {
  const first = Date.parse(swipe.first_seen_at ?? swipe.swipedAt ?? "")
  const last = Date.parse(swipe.last_seen_at ?? now.toISOString())
  let days = 0
  if (Number.isFinite(first) && Number.isFinite(last) && last >= first) {
    days = (last - first) / (1000 * 60 * 60 * 24)
  }
  // times_seen is a secondary longevity proxy from the extension.
  const seenBoost = swipe.times_seen && swipe.times_seen > 1 ? Math.log2(swipe.times_seen) : 0
  return clamp01((days + seenBoost) / LONGEVITY_SATURATION_DAYS)
}

function recencyScore(swipe: SwipeRecord, now: Date): number {
  const swiped = Date.parse(swipe.swipedAt ?? "")
  if (!Number.isFinite(swiped)) {
    return 0
  }
  const days = Math.max(0, (now.getTime() - swiped) / (1000 * 60 * 60 * 24))
  return clamp01(Math.pow(0.5, days / RECENCY_HALFLIFE_DAYS))
}

export function scoreSwipe(
  swipe: SwipeRecord,
  options: { now?: Date } = {}
): SwipeScore {
  const now = options.now ?? new Date()
  const breakdown: SwipeScoreBreakdown = {
    engagement: engagementScore(swipe),
    performance: performanceScore(swipe),
    longevity: longevityScore(swipe, now),
    recency: recencyScore(swipe, now),
  }
  const weighted =
    breakdown.engagement * WEIGHTS.engagement +
    breakdown.performance * WEIGHTS.performance +
    breakdown.longevity * WEIGHTS.longevity +
    breakdown.recency * WEIGHTS.recency
  return {
    score: Math.round(clamp01(weighted) * 1000) / 10, // 0..100, 1 decimal
    breakdown,
    weights: WEIGHTS,
  }
}

export function rankSwipesByScore(
  swipes: SwipeRecord[],
  options: { now?: Date } = {}
): { swipe: SwipeRecord; score: SwipeScore }[] {
  return swipes
    .map((swipe) => ({ swipe, score: scoreSwipe(swipe, options) }))
    .sort(
      (a, b) =>
        b.score.score - a.score.score ||
        a.swipe.advertiser.localeCompare(b.swipe.advertiser)
    )
}
