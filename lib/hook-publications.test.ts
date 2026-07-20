import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAutomationRecord: vi.fn(),
  listAutomationRuns: vi.fn(),
  listPostFastPostRecords: vi.fn(),
  listMetricSnapshots: vi.fn(),
  listUsageRecords: vi.fn(),
  appendUsageRecords: vi.fn(),
}))

vi.mock("@/lib/automations", () => ({
  getAutomationRecord: mocks.getAutomationRecord,
}))
vi.mock("@/lib/automation-runner", () => ({
  listAutomationRuns: mocks.listAutomationRuns,
}))
vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPostFastPostRecords,
}))
vi.mock("@/lib/postfast-metric-snapshots", () => ({
  listMetricSnapshots: mocks.listMetricSnapshots,
}))
vi.mock("@/lib/usage-ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usage-ledger")>()
  return {
    ...actual,
    listUsageRecords: mocks.listUsageRecords,
    appendUsageRecords: mocks.appendUsageRecords,
  }
})

import {
  hookAnalyticsReport,
  recordPublishedHookUsage,
} from "@/lib/hook-publications"
import { defaultAutomationSchema } from "@/lib/realfarm-automation"

const run = {
  id: "run-1",
  automationId: "automation-1",
  automationTitle: "Demo",
  scheduledFor: "2026-07-17T10:00:00.000Z",
  status: "succeeded",
  slideshowId: "slideshow-1",
  createdAt: "2026-07-17T09:00:00.000Z",
  plan: {
    hookId: "hook-one",
    hook: "This is the published hook",
    hookTemplate: "This is the published hook",
    hookSubstitutions: {},
    imageCollectionIds: [],
    slides: [],
    publishType: "slideshow",
    autoMusic: true,
    autoPost: false,
    hookCandidates: [],
    language: "English",
  },
}

const publication = {
  id: "publication-1",
  sourceType: "slideshow" as const,
  sourceId: "slideshow-1",
  integrationId: "account-1",
  provider: "tiktok",
  status: "published" as const,
  publishedAt: "2026-07-17T12:00:00.000Z",
  content: "Caption",
  media: [],
  createdAt: "2026-07-17T10:00:00.000Z",
  updatedAt: "2026-07-17T12:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listAutomationRuns.mockResolvedValue([run])
  mocks.listPostFastPostRecords.mockResolvedValue([])
  mocks.listMetricSnapshots.mockResolvedValue([])
  mocks.listUsageRecords.mockResolvedValue([])
  mocks.appendUsageRecords.mockImplementation(async ({ records }) => records)
})

describe("published hook attribution", () => {
  it("records hook usage only after the publication is confirmed", async () => {
    await expect(
      recordPublishedHookUsage({ ...publication, status: "scheduled" })
    ).resolves.toEqual([])
    expect(mocks.appendUsageRecords).not.toHaveBeenCalled()

    await recordPublishedHookUsage(publication)

    expect(mocks.appendUsageRecords).toHaveBeenCalledWith({
      records: [
        expect.objectContaining({
          automation_id: "automation-1",
          hook_id: "hook-one",
          kind: "hook_published",
          key: "this is the published hook",
          run_id: "run-1",
          used_at: "2026-07-17T12:00:00.000Z",
        }),
      ],
    })
  })

  it("aggregates only published posts and their latest metric snapshots", async () => {
    const schema = defaultAutomationSchema({
      id: "1",
      name: "Demo",
      status: "live",
      account: "",
      handle: "",
      times: [],
      theme: "",
      socialIntegrations: [],
      favorite: false,
      automationKind: "slideshow",
    })
    schema.hooks = [
      {
        id: "hook-one",
        text: "This is the published hook",
        enabled: false,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    mocks.getAutomationRecord.mockResolvedValue({
      id: "automation-1",
      schema,
    })
    mocks.listPostFastPostRecords.mockResolvedValue([
      publication,
      {
        ...publication,
        id: "scheduled-1",
        status: "scheduled",
        publishedAt: undefined,
      },
    ])
    mocks.listMetricSnapshots.mockResolvedValue([
      {
        id: "snapshot-1",
        postId: "publication-1",
        integrationId: "account-1",
        provider: "tiktok",
        capturedAt: "2026-07-18T12:00:00.000Z",
        metrics: {
          views: 1_000,
          likes: 80,
          comments: 10,
          shares: 10,
          interactions: 100,
        },
        latestMetric: {},
        rawMetrics: {},
        observedKeys: [],
      },
    ])

    const report = await hookAnalyticsReport("automation-1")

    expect(report?.rows).toEqual([
      expect.objectContaining({
        hookId: "hook-one",
        enabled: false,
        publishedPosts: 1,
        providers: ["tiktok"],
        metrics: expect.objectContaining({
          views: 1_000,
          likes: 80,
          engagementRate: 10,
        }),
      }),
    ])
    expect(report?.hooks).toEqual([
      expect.objectContaining({
        hookId: "hook-one",
        used: true,
        publishedPosts: 1,
      }),
    ])
  })
})
