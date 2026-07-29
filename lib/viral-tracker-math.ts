export const VIRAL_CHECKPOINT_HOURS = [
  3.3, 3.5, 6.3, 9.3, 12.3, 15.3, 18.3, 21.3, 24.3, 27.3,
] as const
export const DEFAULT_VIRAL_MULTIPLIER = 3

export type ViralMetricSet = {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  engagementRate: number
}

export type ViralBaselinePost = ViralMetricSet & {
  externalPostId: string
  caption: string
  publishedAt: string
}

export type ViralBaseline = ViralMetricSet & {
  sampleSize: number
  calculatedAt: string
}

export type ViralTrackerProject = {
  id: string
  name: string
  status: "active" | "archived"
  telegramChatId?: string
  createdAt: string
  updatedAt: string
}

export type ViralTrackerAccount = {
  id: string
  projectId: string
  platform: "tiktok"
  handle: string
  displayName: string
  avatarUrl?: string
  profileUrl: string
  externalUserId?: string
  secUserId?: string
  status: "active" | "paused" | "error"
  baseline: ViralBaseline
  baselinePosts: ViralBaselinePost[]
  thresholdMultiplier: number
  knownPostIds: string[]
  lastPolledAt?: string
  nextPollAt: string
  error?: string
  createdAt: string
  updatedAt: string
}

export type ViralCheckpoint = ViralMetricSet & {
  hours: (typeof VIRAL_CHECKPOINT_HOURS)[number]
  scheduledFor: string
  capturedAt?: string
  qualified?: boolean
}

export type ViralPostAnalysis = {
  status: "pending" | "processing" | "complete" | "failed"
  kind: "whisper" | "slides"
  transcript?: string
  summary?: string
  hook?: string
  error?: string
  completedAt?: string
}

export type ViralTrackerPost = {
  id: string
  projectId: string
  accountId: string
  platform: "tiktok"
  externalPostId: string
  handle: string
  caption: string
  url: string
  coverUrl?: string
  mediaUrl?: string
  slideUrls?: string[]
  mediaType: "video" | "slides"
  publishedAt: string
  discoveredAt: string
  status: "tracking" | "qualified" | "analyzing" | "retained" | "expired"
  baseline: ViralBaseline
  thresholdMultiplier: number
  checkpoints: ViralCheckpoint[]
  qualifiedAt?: string
  qualifiedCheckpointHours?: number
  alertSentAt?: string
  analysis?: ViralPostAnalysis
  createdAt: string
  updatedAt: string
}

export function median(values: readonly number[]) {
  const sorted = values.map(finiteMetric).sort((left, right) => left - right)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

export function engagementRate(
  metrics: Pick<
    ViralMetricSet,
    "views" | "likes" | "comments" | "shares" | "saves"
  >
) {
  if (metrics.views <= 0) return 0
  return (
    ((metrics.likes + metrics.comments + metrics.shares + metrics.saves) /
      metrics.views) *
    100
  )
}

export function buildViralBaseline(
  posts: readonly ViralBaselinePost[],
  calculatedAt = new Date().toISOString()
): ViralBaseline {
  const sample = posts.slice(0, 10)
  return {
    views: median(sample.map((post) => post.views)),
    likes: median(sample.map((post) => post.likes)),
    comments: median(sample.map((post) => post.comments)),
    shares: median(sample.map((post) => post.shares)),
    saves: median(sample.map((post) => post.saves)),
    engagementRate: median(sample.map((post) => post.engagementRate)),
    sampleSize: sample.length,
    calculatedAt,
  }
}

export function viralThreshold(
  baseline: Pick<ViralBaseline, "views">,
  multiplier = DEFAULT_VIRAL_MULTIPLIER
) {
  return baseline.views * Math.max(1, multiplier)
}

export function qualifiesAsViral(
  views: number,
  baseline: Pick<ViralBaseline, "views">,
  multiplier = DEFAULT_VIRAL_MULTIPLIER
) {
  return finiteMetric(views) > viralThreshold(baseline, multiplier)
}

export function checkpointSchedule(publishedAt: string): ViralCheckpoint[] {
  const published = Date.parse(publishedAt)
  const basis = Number.isFinite(published) ? published : Date.now()
  return VIRAL_CHECKPOINT_HOURS.map((hours) => ({
    hours,
    scheduledFor: new Date(
      basis + checkpointOffsetMinutes(hours) * 60 * 1000
    ).toISOString(),
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    engagementRate: 0,
  }))
}

export function formatViralCheckpoint(hours: number) {
  const wholeHours = Math.trunc(hours)
  const minutes = checkpointOffsetMinutes(hours) - wholeHours * 60
  return `${wholeHours}:${String(minutes).padStart(2, "0")}`
}

function finiteMetric(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function checkpointOffsetMinutes(value: number) {
  const wholeHours = Math.trunc(value)
  const minuteTens = Math.round((value - wholeHours) * 10)
  return wholeHours * 60 + minuteTens * 10
}
