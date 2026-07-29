import "server-only"

import { randomUUID } from "node:crypto"

import { sendTelegramReminder } from "@/lib/reminder-settings"
import {
  fetchTikHubPost,
  fetchTikHubUserPosts,
  type TikHubPost,
} from "@/lib/tikhub"
import {
  checkpointSchedule,
  formatViralCheckpoint,
  getViralAccount,
  getViralProject,
  listViralPosts,
  qualifiesAsViral,
  saveViralAccount,
  saveViralPost,
  type ViralTrackerAccount,
  type ViralTrackerPost,
} from "@/lib/viral-tracker"

const POLL_INTERVAL_MS = 60 * 60 * 1000

type PollDependencies = {
  now?: Date
  fetchUserPosts?: typeof fetchTikHubUserPosts
  fetchPost?: typeof fetchTikHubPost
  sendAlert?: typeof sendTelegramReminder
}

export type ViralPollResult = {
  account: ViralTrackerAccount
  discovered: ViralTrackerPost[]
  updated: ViralTrackerPost[]
}

export async function pollViralAccount(
  accountId: string,
  dependencies: PollDependencies = {}
): Promise<ViralPollResult> {
  const account = await getViralAccount(accountId)
  if (!account) throw new Error("Viral tracker account not found")

  const now = dependencies.now ?? new Date()
  const nowIso = now.toISOString()
  const fetchUserPosts = dependencies.fetchUserPosts ?? fetchTikHubUserPosts
  const fetchPost = dependencies.fetchPost ?? fetchTikHubPost

  try {
    const sourcePosts = await fetchUserPosts({
      handle: account.handle,
      secUserId: account.secUserId,
      count: 20,
    })
    const existing = (await listViralPosts()).filter(
      (post) => post.accountId === account.id
    )
    const existingByExternalId = new Map(
      existing.map((post) => [post.externalPostId, post])
    )
    const knownPostIds = new Set(account.knownPostIds)
    const discovered = sourcePosts
      .filter(
        (post) =>
          !knownPostIds.has(post.externalPostId) &&
          !existingByExternalId.has(post.externalPostId) &&
          Date.parse(post.publishedAt) > Date.parse(account.createdAt)
      )
      .map((post) => trackedPostFromSource(account, post, now))

    await Promise.all(discovered.map(saveViralPost))

    const currentSourceById = new Map(
      sourcePosts.map((post) => [post.externalPostId, post])
    )
    const updated: ViralTrackerPost[] = []
    for (const post of [...existing, ...discovered]) {
      if (!hasDueCheckpoint(post, now)) continue
      const source =
        currentSourceById.get(post.externalPostId) ??
        (await fetchPost(post.externalPostId, account.handle))
      const next = captureDueCheckpoints(post, source, now)
      const alerted = await alertQualifiedPost(
        next,
        dependencies.sendAlert ?? sendTelegramReminder
      )
      await saveViralPost(alerted)
      updated.push(alerted)
    }

    const updatedById = new Map(updated.map((post) => [post.id, post]))
    const trackedPosts = [...existing, ...discovered].map(
      (post) => updatedById.get(post.id) ?? post
    )
    const nextAccount = await saveViralAccount({
      ...account,
      status: "active",
      knownPostIds: [
        ...new Set([
          ...account.knownPostIds,
          ...sourcePosts.map((post) => post.externalPostId),
        ]),
      ].slice(0, 200),
      lastPolledAt: nowIso,
      nextPollAt: nextViralPollAt(trackedPosts, now),
      error: undefined,
      updatedAt: nowIso,
    })

    return { account: nextAccount, discovered, updated }
  } catch (error) {
    await saveViralAccount({
      ...account,
      status: "error",
      lastPolledAt: nowIso,
      nextPollAt: new Date(now.getTime() + POLL_INTERVAL_MS).toISOString(),
      error: error instanceof Error ? error.message : "TikTok polling failed",
      updatedAt: nowIso,
    })
    throw error
  }
}

export function nextViralPollAt(
  posts: readonly ViralTrackerPost[],
  now = new Date()
) {
  const discoveryPollAt = now.getTime() + POLL_INTERVAL_MS
  const nextCheckpointAt = posts
    .flatMap((post) => post.checkpoints)
    .filter((checkpoint) => !checkpoint.capturedAt)
    .map((checkpoint) => Date.parse(checkpoint.scheduledFor))
    .filter((scheduledFor) => Number.isFinite(scheduledFor))
    .reduce(
      (earliest, scheduledFor) => Math.min(earliest, scheduledFor),
      Number.POSITIVE_INFINITY
    )
  return new Date(Math.min(discoveryPollAt, nextCheckpointAt)).toISOString()
}

export function trackedPostFromSource(
  account: ViralTrackerAccount,
  source: TikHubPost,
  now = new Date()
): ViralTrackerPost {
  const nowIso = now.toISOString()
  return {
    id: randomUUID(),
    projectId: account.projectId,
    accountId: account.id,
    platform: "tiktok",
    externalPostId: source.externalPostId,
    handle: account.handle,
    caption: source.caption,
    url: source.url,
    coverUrl: source.coverUrl,
    mediaUrl: source.mediaUrl,
    slideUrls: source.slideUrls,
    mediaType: source.mediaType,
    publishedAt: source.publishedAt,
    discoveredAt: nowIso,
    status: "tracking",
    baseline: account.baseline,
    thresholdMultiplier: account.thresholdMultiplier,
    checkpoints: checkpointSchedule(source.publishedAt),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export function captureDueCheckpoints(
  post: ViralTrackerPost,
  source: TikHubPost,
  now = new Date()
): ViralTrackerPost {
  const nowTime = now.getTime()
  const nowIso = now.toISOString()
  let qualifiedCheckpointHours = post.qualifiedCheckpointHours
  const checkpoints = post.checkpoints.map((checkpoint) => {
    if (
      checkpoint.capturedAt ||
      Date.parse(checkpoint.scheduledFor) > nowTime
    ) {
      return checkpoint
    }
    const qualified = qualifiesAsViral(
      source.views,
      post.baseline,
      post.thresholdMultiplier
    )
    if (qualified && qualifiedCheckpointHours === undefined) {
      qualifiedCheckpointHours = checkpoint.hours
    }
    return {
      ...checkpoint,
      views: source.views,
      likes: source.likes,
      comments: source.comments,
      shares: source.shares,
      saves: source.saves,
      engagementRate: source.engagementRate,
      capturedAt: nowIso,
      qualified,
    }
  })
  const qualified = qualifiedCheckpointHours !== undefined
  const complete = checkpoints.every((checkpoint) => checkpoint.capturedAt)
  return {
    ...post,
    caption: source.caption,
    coverUrl: source.coverUrl ?? post.coverUrl,
    mediaUrl: source.mediaUrl ?? post.mediaUrl,
    slideUrls: source.slideUrls.length ? source.slideUrls : post.slideUrls,
    status: qualified ? "qualified" : complete ? "expired" : post.status,
    checkpoints,
    qualifiedAt: qualified ? (post.qualifiedAt ?? nowIso) : post.qualifiedAt,
    qualifiedCheckpointHours,
    analysis:
      qualified && !post.analysis
        ? {
            status: "pending",
            kind: source.mediaType === "slides" ? "slides" : "whisper",
          }
        : post.analysis,
    updatedAt: nowIso,
  }
}

function hasDueCheckpoint(post: ViralTrackerPost, now: Date) {
  if (post.status === "expired" || post.status === "retained") return false
  return post.checkpoints.some(
    (checkpoint) =>
      !checkpoint.capturedAt &&
      Date.parse(checkpoint.scheduledFor) <= now.getTime()
  )
}

async function alertQualifiedPost(
  post: ViralTrackerPost,
  sendAlert: typeof sendTelegramReminder
) {
  if (post.status !== "qualified" || post.alertSentAt) return post
  const project = await getViralProject(post.projectId)
  try {
    await sendAlert({
      chatId: project?.telegramChatId,
      text: [
        `Viral TikTok detected: @${post.handle}`,
        post.caption,
        `${formatMetric(latestViews(post))} views at the ${formatViralCheckpoint(post.qualifiedCheckpointHours ?? 0)} checkpoint`,
        post.url,
      ].join("\n\n"),
    })
    return { ...post, alertSentAt: new Date().toISOString() }
  } catch {
    // Tracking must continue when Telegram is absent or temporarily down.
    return post
  }
}

function latestViews(post: ViralTrackerPost) {
  return (
    [...post.checkpoints].reverse().find((checkpoint) => checkpoint.capturedAt)
      ?.views ?? 0
  )
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value)
}
