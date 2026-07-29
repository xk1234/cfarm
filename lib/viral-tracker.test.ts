import { describe, expect, it } from "vitest"

import {
  buildViralBaseline,
  checkpointSchedule,
  engagementRate,
  formatViralCheckpoint,
  median,
  qualifiesAsViral,
} from "@/lib/viral-tracker"
import type { ViralBaselinePost } from "@/lib/viral-tracker"
import {
  captureDueCheckpoints,
  nextViralPollAt,
  trackedPostFromSource,
} from "@/lib/viral-tracker-poller"
import type { TikHubPost } from "@/lib/tikhub"
import type { ViralTrackerAccount } from "@/lib/viral-tracker"

describe("viral tracker metrics", () => {
  it("calculates a true median for odd and even samples", () => {
    expect(median([30, 10, 20])).toBe(20)
    expect(median([40, 10, 30, 20])).toBe(25)
  })

  it("uses the latest ten supplied posts for a metric baseline", () => {
    const posts = Array.from({ length: 12 }, (_, index) =>
      baselinePost(index + 1)
    )
    const baseline = buildViralBaseline(posts, "2026-07-29T00:00:00.000Z")

    expect(baseline.sampleSize).toBe(10)
    expect(baseline.views).toBe(5_500)
    expect(baseline.likes).toBe(550)
    expect(baseline.engagementRate).toBeCloseTo(12)
  })

  it("requires views to be strictly above the multiplier", () => {
    const baseline = { views: 10_000 }
    expect(qualifiesAsViral(30_000, baseline, 3)).toBe(false)
    expect(qualifiesAsViral(30_001, baseline, 3)).toBe(true)
  })

  it("schedules the required polling sequence from publish time", () => {
    const schedule = checkpointSchedule("2026-07-29T00:00:00.000Z")
    expect(schedule.map((checkpoint) => checkpoint.hours)).toEqual([
      3.3, 3.5, 6.3, 9.3, 12.3, 15.3, 18.3, 21.3, 24.3, 27.3,
    ])
    expect(schedule.map((checkpoint) => checkpoint.scheduledFor)).toEqual([
      "2026-07-29T03:30:00.000Z",
      "2026-07-29T03:50:00.000Z",
      "2026-07-29T06:30:00.000Z",
      "2026-07-29T09:30:00.000Z",
      "2026-07-29T12:30:00.000Z",
      "2026-07-29T15:30:00.000Z",
      "2026-07-29T18:30:00.000Z",
      "2026-07-29T21:30:00.000Z",
      "2026-07-30T00:30:00.000Z",
      "2026-07-30T03:30:00.000Z",
    ])
    expect(
      schedule.map((checkpoint) => formatViralCheckpoint(checkpoint.hours))
    ).toEqual([
      "3:30",
      "3:50",
      "6:30",
      "9:30",
      "12:30",
      "15:30",
      "18:30",
      "21:30",
      "24:30",
      "27:30",
    ])
  })

  it("captures due checkpoints and qualifies against the frozen baseline", () => {
    const account = trackerAccount()
    const source = tiktokPost(20_000)
    const tracked = trackedPostFromSource(
      account,
      source,
      new Date("2026-07-29T00:05:00.000Z")
    )
    const updated = captureDueCheckpoints(
      tracked,
      tiktokPost(30_001),
      new Date("2026-07-29T03:30:00.000Z")
    )

    expect(updated.status).toBe("qualified")
    expect(updated.qualifiedCheckpointHours).toBe(3.3)
    expect(updated.checkpoints[0]).toMatchObject({
      views: 30_001,
      qualified: true,
      capturedAt: "2026-07-29T03:30:00.000Z",
    })
    expect(updated.analysis).toEqual({ status: "pending", kind: "whisper" })
    expect(updated.checkpoints[1].capturedAt).toBeUndefined()
  })

  it("expires a post after its final non-viral checkpoint", () => {
    const tracked = trackedPostFromSource(
      trackerAccount(),
      tiktokPost(10_000),
      new Date("2026-07-29T00:05:00.000Z")
    )
    const updated = captureDueCheckpoints(
      tracked,
      tiktokPost(25_000),
      new Date("2026-07-30T03:30:00.000Z")
    )

    expect(updated.status).toBe("expired")
    expect(
      updated.checkpoints.every((checkpoint) => checkpoint.capturedAt)
    ).toBe(true)
  })

  it("moves the next account poll up to the next checkpoint", () => {
    const tracked = trackedPostFromSource(
      trackerAccount(),
      tiktokPost(10_000),
      new Date("2026-07-29T00:05:00.000Z")
    )

    expect(
      nextViralPollAt([tracked], new Date("2026-07-29T03:20:00.000Z"))
    ).toBe("2026-07-29T03:30:00.000Z")
  })
})

function baselinePost(index: number): ViralBaselinePost {
  const views = index * 1_000
  const likes = index * 100
  const comments = index * 10
  const shares = index * 5
  const saves = index * 5
  return {
    externalPostId: String(index),
    caption: `Post ${index}`,
    publishedAt: `2026-07-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    views,
    likes,
    comments,
    shares,
    saves,
    engagementRate: engagementRate({
      views,
      likes,
      comments,
      shares,
      saves,
    }),
  }
}

function trackerAccount(): ViralTrackerAccount {
  const baselinePosts = [baselinePost(10)]
  return {
    id: "account-id",
    projectId: "project-id",
    platform: "tiktok",
    handle: "creator",
    displayName: "Creator",
    profileUrl: "https://www.tiktok.com/@creator",
    status: "active",
    baseline: buildViralBaseline(baselinePosts, "2026-07-28T00:00:00.000Z"),
    baselinePosts,
    thresholdMultiplier: 3,
    knownPostIds: [],
    nextPollAt: "2026-07-29T01:00:00.000Z",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  }
}

function tiktokPost(views: number): TikHubPost {
  const likes = Math.round(views / 10)
  return {
    externalPostId: "post-id",
    caption: "A post",
    publishedAt: "2026-07-29T00:00:00.000Z",
    views,
    likes,
    comments: 0,
    shares: 0,
    saves: 0,
    engagementRate: engagementRate({
      views,
      likes,
      comments: 0,
      shares: 0,
      saves: 0,
    }),
    url: "https://www.tiktok.com/@creator/video/post-id",
    slideUrls: [],
    mediaType: "video",
  }
}
