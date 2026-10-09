import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listJobs: vi.fn(),
  listPostFastPostRecords: vi.fn(),
  listResultRecords: vi.fn(),
  postfastRequest: vi.fn(),
  canonicalList: vi.fn(),
}))

vi.mock("@/lib/queue", () => ({ listJobs: mocks.listJobs }))
vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPostFastPostRecords,
}))
vi.mock("@/lib/postfast-client", () => ({
  postfastRequest: mocks.postfastRequest,
}))
vi.mock("@/lib/output-publications", () => ({
  outputPublicationsOwnerId: vi.fn(async () => "owner-1"),
  writeCanonicalPostWithLegacyProjection: vi.fn(),
}))
vi.mock("@/lib/post-repository-store", () => ({
  railwayPostRepository: {
    listPosts: mocks.canonicalList,
  },
}))
vi.mock("@/lib/results", () => ({
  listResultRecords: mocks.listResultRecords,
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.POST_REPOSITORY_READ_MODE
  mocks.listJobs.mockResolvedValue([])
  mocks.listPostFastPostRecords.mockResolvedValue([])
  mocks.listResultRecords.mockResolvedValue([])
  mocks.postfastRequest.mockResolvedValue({ data: [] })
  mocks.canonicalList.mockResolvedValue([])
})

afterEach(() => {
  delete process.env.POST_REPOSITORY_READ_MODE
})

describe("GET /api/calendar", () => {
  it("merges render jobs, local publications, and remote posts", async () => {
    mocks.listJobs.mockResolvedValue([
      job({ id: "job-queued", status: "queued" }),
      job({ id: "job-other", type: "send-notification" }),
    ])
    mocks.listResultRecords.mockResolvedValue([
      {
        id: "result-1",
        title: "Rendered slideshow",
        createdAt: "2099-07-15T00:10:00.000Z",
        artifacts: {
          slideshowId: "slideshow-1",
          thumbnailUrl: "/api/local-assets/thumb.png",
        },
      },
    ])
    mocks.listPostFastPostRecords.mockResolvedValue([
      localPost({ id: "draft-1", status: "draft" }),
    ])
    mocks.postfastRequest.mockResolvedValue({
      data: [
        {
          id: "remote-2",
          status: "SCHEDULED",
          scheduledAt: "2099-07-15T05:00:00.000Z",
          content: "Remote caption",
          integration: { id: "account-9", providerIdentifier: "instagram" },
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

    expect(mocks.listJobs).toHaveBeenCalledWith(
      expect.objectContaining({ type: "render-slideshow" })
    )
    expect(payload.items.map((item: { id: string }) => item.id)).toEqual([
      "job:job-queued",
      "local:draft-1",
      "postfast:remote-2",
    ])
    expect(payload.items[1]).toMatchObject({
      status: "draft",
      previewUrl: "/api/local-assets/thumb.png",
      timestamps: { generatedAt: "2099-07-15T00:10:00.000Z" },
    })
    expect(payload.items[2]).toMatchObject({
      status: "scheduled",
      targets: [{ integrationId: "account-9", provider: "instagram" }],
    })
  })

  it("accepts CSV/repeated aggregate filters and returns canonical failure counts", async () => {
    mocks.listPostFastPostRecords.mockResolvedValue([
      localPost({
        id: "failed-1",
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
        "http://localhost/api/calendar?from=2099-07-15T00:00:00.000Z&to=2099-07-15T23:59:59.999Z&accounts=account-1,account-3&platforms=tiktok&statuses=failed&sourceType=slideshow"
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

  it("keeps dedupe stable in all read modes and shadows drift", async () => {
    const publication = localPost({
      id: "published-local",
      status: "published",
      scheduledAt: undefined,
      publishedAt: "2099-07-15T02:30:00.000Z",
      releaseUrl: "https://tiktok.com/@creator/video/1",
      postfastPostId: "remote-1",
      linkState: "postfast_published",
      statsSources: [],
    })
    mocks.listPostFastPostRecords.mockResolvedValue([publication])
    mocks.postfastRequest.mockResolvedValue({
      data: [
        {
          id: "remote-1",
          status: "PUBLISHED",
          publishedAt: "2099-07-15T02:30:00.000Z",
          socialMediaId: "account-1",
        },
      ],
    })
    const canonical = canonicalCalendarPost(publication)
    mocks.canonicalList.mockResolvedValue([canonical])

    const payloads = []
    for (const mode of ["legacy", "canonical", "union-shadow"] as const) {
      process.env.POST_REPOSITORY_READ_MODE = mode
      const { GET } = await import("./route")
      const response = await GET(
        new Request(
          "http://localhost/api/calendar?from=2099-07-15T00:00:00.000Z&to=2099-07-15T23:59:59.999Z"
        )
      )
      payloads.push(await response.json())
    }
    expect(payloads[1]).toEqual(payloads[0])
    expect(payloads[2]).toEqual(payloads[0])
    expect(payloads[0].items).toHaveLength(1)
    expect(payloads[0].items[0].id).toBe("postfast:remote-1")

    mocks.canonicalList.mockResolvedValue([
      { ...canonical, content: "Canonical drift" },
    ])
    process.env.POST_REPOSITORY_READ_MODE = "union-shadow"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/calendar?from=2099-07-15T00:00:00.000Z&to=2099-07-15T23:59:59.999Z"
      )
    )
    expect(await response.json()).toEqual(payloads[0])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"surface":"calendar"')
    )
    warn.mockRestore()
  })
})

function job(overrides: Record<string, unknown>) {
  return {
    id: "job",
    type: "render-slideshow",
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
    sourceType: "slideshow",
    sourceId: "slideshow-1",
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

function canonicalCalendarPost(publication: Record<string, unknown>) {
  return {
    schemaVersion: 1 as const,
    id: String(publication.id),
    intentId: `legacy:${publication.id}`,
    ownerId: "owner-1",
    origin: "manual_link" as const,
    sourceType: "slideshow" as const,
    sourceId: String(publication.sourceId),
    sourceRefs: [{ kind: "slideshow" as const, id: String(publication.sourceId) }],
    lifecycleStatus: "published" as const,
    linkState: "externally_linked" as const,
    linkMethod: "manual_url" as const,
    integrationId: String(publication.integrationId),
    provider: "tiktok" as const,
    postfastPostId:
      typeof publication.postfastPostId === "string"
        ? publication.postfastPostId
        : undefined,
    releaseUrl: String(publication.releaseUrl),
    statsSources: [],
    content: String(publication.content),
    hashtags: [],
    media: [],
    publishedAt: String(publication.publishedAt),
    createdAt: String(publication.createdAt),
    updatedAt: String(publication.updatedAt),
  }
}
