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
          saves: 25,
          interactions: 100,
        },
        latestMetric: {},
        rawMetrics: {},
        observedKeys: [],
        tiktokStudio: {
          schemaVersion: 1,
          studioUrl: "https://www.tiktok.com/tiktokstudio/analytics/1/overview",
          capturedSections: ["overview"],
          slides: [
            { slideIndex: 1, retentionPercent: 1 },
            { slideIndex: 2, retentionPercent: 0.75 },
          ],
          trafficSources: {},
          searchTerms: [],
        },
      },
    ])

    const report = await hookAnalyticsReport("automation-1")

    expect(report?.rows).toEqual([
      expect.objectContaining({
        hookId: "hook-one",
        enabled: false,
        publishedPosts: 1,
        publishCount: 1,
        providers: ["tiktok"],
        views: 1_000,
        shares: 10,
        saves: 25,
        shareRate: 1,
        meanSlide1To2RetentionPercent: 75,
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

  it("recovers hook attribution from a source-linked Studio snapshot", async () => {
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
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    mocks.getAutomationRecord.mockResolvedValue({
      id: "automation-1",
      schema,
    })
    mocks.listMetricSnapshots.mockResolvedValue([
      {
        id: "snapshot-unlinked",
        postId: "publication-missing-from-output",
        integrationId: "account-1",
        provider: "tiktok",
        capturedAt: "2026-07-18T12:00:00.000Z",
        publishedAt: "2026-07-17T12:00:00.000Z",
        sourceType: "slideshow",
        sourceId: "slideshow-1",
        metrics: { views: 2_000, shares: 20, saves: 40 },
        latestMetric: {},
        rawMetrics: {},
        observedKeys: [],
        source: "tiktok_studio",
      },
      {
        id: "snapshot-unrelated-automation",
        postId: "other-post",
        integrationId: "account-1",
        provider: "tiktok",
        capturedAt: "2026-07-18T12:00:00.000Z",
        sourceType: "slideshow",
        sourceId: "other-slideshow",
        metrics: { views: 99_000 },
        latestMetric: {},
        rawMetrics: {},
        observedKeys: [],
        source: "tiktok_studio",
      },
    ])

    const report = await hookAnalyticsReport("automation-1")

    expect(report).toMatchObject({
      rows: [
        expect.objectContaining({
          hookId: "hook-one",
          publishedPosts: 1,
          views: 2_000,
        }),
      ],
      attribution: {
        attributedPosts: 1,
        unattributedPublishedPosts: 0,
        publishedOutputsWithoutPublication: 0,
        snapshotRecoveredPosts: 1,
      },
      dataWarning: expect.stringContaining(
        "attributed through analytics snapshots"
      ),
    })
  })

  it("warns when an output is marked published without a publication record", async () => {
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
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    mocks.getAutomationRecord.mockResolvedValue({
      id: "automation-1",
      schema,
    })
    mocks.listAutomationRuns.mockResolvedValue([
      {
        ...run,
        manuallyPublishedAt: "2026-07-17T12:00:00.000Z",
      },
    ])

    const report = await hookAnalyticsReport("automation-1")

    expect(report).toMatchObject({
      rows: [],
      attribution: {
        attributedPosts: 0,
        publishedOutputsWithoutPublication: 1,
      },
      dataWarning: expect.stringContaining(
        "published output is missing a publication record"
      ),
    })
  })

  it("reattaches a rendered legacy hook to its canonical pool id", async () => {
    const schema = defaultAutomationSchema({
      id: "1",
      name: "Astrology Informational",
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
        id: "hook_0sxku68",
        text: "[[SLIDE_COUNT]] things a [[ZODIAC]] will never tell you",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    mocks.getAutomationRecord.mockResolvedValue({
      id: "automation-local-e106cab9-5bb1-4810-afaa-3b2eb25e4467",
      schema,
    })
    mocks.listAutomationRuns.mockResolvedValue([
      {
        ...run,
        automationId:
          "automation-local-e106cab9-5bb1-4810-afaa-3b2eb25e4467",
        plan: {
          ...run.plan,
          hookId: "hook_0w6nkqy",
          hook: "3 things a Cancer will never tell you",
          hookTemplate: undefined,
        },
      },
    ])
    mocks.listPostFastPostRecords.mockResolvedValue([publication])
    mocks.listMetricSnapshots.mockResolvedValue([
      {
        id: "snapshot-winner",
        postId: publication.id,
        integrationId: "account-1",
        provider: "tiktok",
        capturedAt: "2026-07-18T12:00:00.000Z",
        metrics: {
          views: 29_790,
          likes: 1_102,
          shares: 74,
          saves: 405,
        },
        latestMetric: {},
        rawMetrics: {},
        observedKeys: [],
        tiktokStudio: {
          schemaVersion: 1,
          studioUrl: "https://www.tiktok.com/tiktokstudio/analytics/1/overview",
          capturedSections: ["overview"],
          slides: [
            { slideIndex: 1, retentionPercent: 1 },
            { slideIndex: 2, retentionPercent: 0.7536 },
          ],
          trafficSources: {},
          searchTerms: [],
        },
      },
    ])

    const report = await hookAnalyticsReport(
      "automation-local-e106cab9-5bb1-4810-afaa-3b2eb25e4467"
    )

    expect(schema.hooks[0].id).toBe("hook_0sxku68")
    expect(report).toMatchObject({
      hooks: [
        {
          hookId: "hook_0sxku68",
          used: true,
          publishedPosts: 1,
        },
      ],
      rows: [
        expect.objectContaining({
          hookId: "hook_0sxku68",
          publishedPosts: 1,
          views: 29_790,
          meanSlide1To2RetentionPercent: 75.36,
        }),
      ],
      performance: [
        expect.objectContaining({
          hookId: "hook_0sxku68",
          publishedPosts: 1,
          views: 29_790,
        }),
      ],
      attribution: {
        attributedPosts: 1,
        unattributedPublishedPosts: 0,
      },
      dataWarnings: [],
    })
    expect(
      report?.performance.some((item) => item.hookId === "hook_0w6nkqy")
    ).toBe(false)
  })

  it("does not guess when rendered text matches multiple pool templates", async () => {
    const schema = defaultAutomationSchema({
      id: "1",
      name: "Ambiguous",
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
        id: "canonical-one",
        text: "[[COUNT]] things a Cancer will never tell you",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "canonical-two",
        text: "3 things a [[ZODIAC]] will never tell you",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    mocks.getAutomationRecord.mockResolvedValue({
      id: "automation-1",
      schema,
    })
    mocks.listAutomationRuns.mockResolvedValue([
      {
        ...run,
        plan: {
          ...run.plan,
          hookId: "ghost-id",
          hook: "3 things a Cancer will never tell you",
          hookTemplate: undefined,
        },
      },
    ])
    mocks.listPostFastPostRecords.mockResolvedValue([publication])

    const report = await hookAnalyticsReport("automation-1")

    expect(schema.hooks.map((hook) => hook.id)).toEqual([
      "canonical-one",
      "canonical-two",
    ])
    expect(report).toMatchObject({
      rows: [],
      attribution: {
        attributedPosts: 0,
        unattributedPublishedPosts: 1,
      },
      dataWarnings: [
        "1 published post could not be attributed to a pool hook.",
      ],
    })
    expect(
      report?.performance.some((item) => item.hookId === "ghost-id")
    ).toBe(false)
  })

  it("propagates storage quota failures instead of returning zero performance", async () => {
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
    mocks.getAutomationRecord.mockResolvedValue({
      id: "automation-1",
      schema,
    })
    mocks.listPostFastPostRecords.mockRejectedValue({
      code: 429,
      type: "limit_databases_reads_exceeded",
    })

    await expect(hookAnalyticsReport("automation-1")).rejects.toMatchObject({
      code: 429,
      type: "limit_databases_reads_exceeded",
    })
  })
})
