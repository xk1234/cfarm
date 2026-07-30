import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAutomationRecords: vi.fn(),
  listAutomationRuns: vi.fn(),
  listJobs: vi.fn(),
  listPostFastPostRecords: vi.fn(),
  listResultRecords: vi.fn(),
  listXAutomations: vi.fn(),
  listXAutomationRuns: vi.fn(),
  postfastRequest: vi.fn(),
}))

vi.mock("@/lib/automations", () => ({
  listAutomationRecords: mocks.listAutomationRecords,
  automationRecordToSummary: (record: { summary: unknown }) => record.summary,
}))
vi.mock("@/lib/automation-runner", () => ({
  listAutomationRuns: mocks.listAutomationRuns,
}))
vi.mock("@/lib/queue", () => ({ listJobs: mocks.listJobs }))
vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPostFastPostRecords,
}))
vi.mock("@/lib/postfast-client", () => ({
  postfastRequest: mocks.postfastRequest,
}))
vi.mock("@/lib/results", () => ({
  listResultRecords: mocks.listResultRecords,
}))
vi.mock("@/lib/x-automation-store", () => ({
  listXAutomations: mocks.listXAutomations,
  listXAutomationRuns: mocks.listXAutomationRuns,
}))
vi.mock("@/lib/x-automation", () => ({
  xAutomationToAutomation: (automation: unknown) => automation,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listAutomationRecords.mockResolvedValue([])
  mocks.listAutomationRuns.mockResolvedValue([])
  mocks.listJobs.mockResolvedValue([])
  mocks.listPostFastPostRecords.mockResolvedValue([])
  mocks.listResultRecords.mockResolvedValue([])
  mocks.listXAutomations.mockResolvedValue([])
  mocks.listXAutomationRuns.mockResolvedValue([])
  mocks.postfastRequest.mockResolvedValue({ data: [] })
})

describe("GET /api/calendar", () => {
  it("merges all four sources and lets a materialized item replace its exact projection", async () => {
    mocks.listAutomationRecords.mockResolvedValue([
      { summary: automationSummary() },
    ])
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        automationId: "automation-1",
        automationTitle: "Morning posts",
        scheduledFor: "2099-07-15T01:00:00.000Z",
        status: "succeeded",
        createdAt: "2099-07-14T23:00:00.000Z",
        updatedAt: "2099-07-15T00:00:00.000Z",
        plan: { caption: "A useful caption" },
      },
    ])
    mocks.listResultRecords.mockResolvedValue([
      {
        id: "result-1",
        runId: "run-1",
        createdAt: "2099-07-15T00:12:00.000Z",
      },
    ])
    mocks.listJobs.mockResolvedValue([
      job({
        id: "job-1",
        status: "processing",
        payload: {
          automationId: "automation-1",
          scheduledFor: "2099-07-15T01:00:00.000Z",
        },
      }),
    ])
    mocks.listPostFastPostRecords.mockResolvedValue([
      localPost({
        id: "local-action",
        sourceId: "run-1",
        status: "awaiting_manual_post",
      }),
      localPost({
        id: "local-scheduled",
        sourceId: "run-1",
        status: "scheduled",
        postfastPostId: "remote-1",
      }),
    ])
    mocks.postfastRequest.mockResolvedValue({
      data: [
        {
          id: "remote-1",
          status: "SCHEDULED",
          scheduledAt: "2099-07-15T01:00:00.000Z",
          content: "A useful caption",
          socialMediaId: "account-1",
        },
      ],
    })

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/calendar?from=2099-07-15T00:00:00.000Z&to=2099-07-15T23:59:59.999Z"
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "job:job-1",
          status: "generating",
          datetime: "2099-07-15T01:00:00.000Z",
          timestamps: expect.objectContaining({
            expectedGenerationAt: "2099-07-15T00:30:00.000Z",
            expectedPublishedAt: "2099-07-15T01:00:00.000Z",
          }),
        }),
        expect.objectContaining({
          id: "local:local-action",
          status: "needs_action",
          sourceType: "automation",
        }),
        expect.objectContaining({
          id: "postfast:remote-1",
          status: "scheduled",
          targets: [
            expect.objectContaining({
              integrationId: "account-1",
              provider: "tiktok",
            }),
          ],
          links: expect.objectContaining({
            cancel: "/api/calendar/items/local-scheduled",
            reschedule: "/api/calendar/items/local-scheduled",
          }),
          timestamps: expect.objectContaining({
            generatedAt: "2099-07-15T00:12:00.000Z",
            expectedPublishedAt: "2099-07-15T01:00:00.000Z",
          }),
        }),
      ])
    )
    expect(payload.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "projection",
          slot: "2099-07-15T01:00:00.000Z",
        }),
      ])
    )
  })

  it("projects only live automations while retaining real jobs from paused automations", async () => {
    const live = automationSummary()
    mocks.listAutomationRecords.mockResolvedValue([
      { summary: { ...live, id: "automation-live" } },
      {
        summary: {
          ...live,
          id: "automation-status-paused",
          status: "paused",
        },
      },
      {
        summary: {
          ...live,
          id: "automation-schedule-paused",
          schedule: { ...live.schedule, paused: true },
        },
      },
    ])
    mocks.listJobs.mockResolvedValue([
      job({
        id: "paused-job",
        payload: {
          automationId: "automation-status-paused",
          scheduledFor: "2099-07-15T02:00:00.000Z",
        },
      }),
    ])

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/calendar?from=2099-07-15T00:00:00.000Z&to=2099-07-15T23:59:59.999Z"
      )
    )
    const payload = await response.json()

    expect(
      payload.items
        .filter((item: { source: string }) => item.source === "projection")
        .map((item: { automationId: string }) => item.automationId)
    ).toEqual(["automation-live"])
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "job:paused-job",
          automationId: "automation-status-paused",
          status: "generating",
        }),
      ])
    )
  })

  it("accepts CSV/repeated aggregate filters and returns canonical failure counts", async () => {
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-failed",
        automationId: "automation-1",
        scheduledFor: "2099-07-15T01:00:00.000Z",
        status: "failed",
        createdAt: "2099-07-15T00:00:00.000Z",
        updatedAt: "2099-07-15T00:00:00.000Z",
      },
    ])
    mocks.listPostFastPostRecords.mockResolvedValue([
      localPost({
        id: "failed-1",
        sourceId: "run-failed",
        status: "failed",
        error: "Provider rejected the post",
      }),
      localPost({
        id: "other-draft",
        sourceId: "manual-1",
        status: "draft",
        integrationId: "account-2",
        provider: "instagram",
      }),
    ])

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/calendar?from=2099-07-15T00:00:00.000Z&to=2099-07-15T23:59:59.999Z&accounts=account-1,account-3&platforms=tiktok&statuses=failed&automations=automation-1&sourceType=automation"
      )
    )
    const payload = await response.json()

    expect(payload.items).toEqual([
      expect.objectContaining({
        id: "local:failed-1",
        status: "failed",
        error: "Provider rejected the post",
      }),
    ])
    expect(payload.summary).toMatchObject({ failed: 1, needsAction: 0 })
  })

  it("exposes a manual retry action for failed generation jobs", async () => {
    mocks.listAutomationRecords.mockResolvedValue([
      { summary: automationSummary() },
    ])
    mocks.listJobs.mockResolvedValue([
      job({
        id: "job-failed",
        status: "dead",
        error: "Provider returned error",
        payload: {
          automationId: "automation-1",
          scheduledFor: "2099-07-15T01:00:00.000Z",
        },
      }),
    ])

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/calendar?from=2099-07-15T00:00:00.000Z&to=2099-07-15T23:59:59.999Z"
      )
    )
    const payload = await response.json()

    expect(payload.items).toEqual([
      expect.objectContaining({
        id: "job:job-failed",
        status: "generation_failed",
        error: "Provider returned error",
        links: expect.objectContaining({
          retry: "/api/jobs/job-failed/retry",
        }),
      }),
    ])
  })

  it("surfaces manually published posts and dates them by publishedAt", async () => {
    mocks.listPostFastPostRecords.mockResolvedValue([
      localPost({
        id: "published-manual",
        status: "published",
        publishedAt: "2099-07-15T02:30:00.000Z",
        releaseUrl: "https://tiktok.com/@creator/video/1",
      }),
      // Backed by a PostFast id -> comes back via the remote feed, so the
      // local record must not double-count it.
      localPost({
        id: "published-remote",
        status: "published",
        postfastPostId: "remote-9",
        publishedAt: "2099-07-15T03:00:00.000Z",
      }),
    ])

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/calendar?from=2099-07-15T00:00:00.000Z&to=2099-07-15T23:59:59.999Z"
      )
    )
    const payload = await response.json()

    expect(payload.items).toEqual([
      expect.objectContaining({
        id: "local:published-manual",
        status: "published",
        datetime: "2099-07-15T02:30:00.000Z",
        title: "Published post",
        links: expect.objectContaining({
          live: "https://tiktok.com/@creator/video/1",
        }),
      }),
    ])
  })

  it("rejects invalid or reversed ranges", async () => {
    const { GET } = await import("./route")
    const invalid = await GET(
      new Request("http://localhost/api/calendar?from=nope")
    )
    const reversed = await GET(
      new Request(
        "http://localhost/api/calendar?from=2099-07-16T00:00:00.000Z&to=2099-07-15T00:00:00.000Z"
      )
    )
    expect(invalid.status).toBe(400)
    expect(reversed.status).toBe(400)
  })
})

function automationSummary() {
  return {
    id: "automation-1",
    name: "Morning posts",
    status: "live",
    account: "Creator",
    handle: "@creator",
    times: [],
    timezone: "Asia/Singapore",
    schedule: {
      timezone: "Asia/Singapore",
      posting_times: [{ time: "9:00 AM", days: [] }],
    },
    favorite: false,
    theme: "ugc",
    socialIntegrations: [
      {
        integration_id: "account-1",
        name: "Creator",
        provider: "tiktok",
      },
    ],
  }
}

function job(overrides: Record<string, unknown>) {
  return {
    id: "job",
    type: "run-automation",
    status: "queued",
    payload: {},
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    availableAt: "2099-07-15T00:30:00.000Z",
    createdAt: "2099-07-15T00:00:00.000Z",
    updatedAt: "2099-07-15T00:00:00.000Z",
    ownerId: "owner-1",
    ...overrides,
  }
}

function localPost(overrides: Record<string, unknown>) {
  return {
    id: "local",
    sourceType: "automation",
    sourceId: "run-1",
    integrationId: "account-1",
    provider: "tiktok",
    status: "draft",
    scheduledAt: "2099-07-15T01:00:00.000Z",
    content: "A useful caption",
    media: [],
    createdAt: "2099-07-15T00:00:00.000Z",
    updatedAt: "2099-07-15T00:00:00.000Z",
    ...overrides,
  }
}
