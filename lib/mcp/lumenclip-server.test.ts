import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { StoredImageCollection } from "@/lib/image-collections"
import {
  createLumenClipMcpServer,
  type LumenClipMcpServices,
} from "@/lib/mcp/lumenclip-server"
import { LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"
import type { CalendarItem } from "@/lib/calendar-items"
import type { Post } from "@/lib/data"
import type { Job } from "@/lib/queue"
import { verifySlideshowShareToken } from "@/lib/slideshow-share"
import type { SlideshowRecord } from "@/lib/slideshows"

const clients: Client[] = []
const servers: ReturnType<typeof createLumenClipMcpServer>[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all([
    ...clients.splice(0).map((client) => client.close()),
    ...servers.splice(0).map((server) => server.close()),
  ])
})

describe("LumenClip MCP server", () => {
  it("registers exactly the tools in the registry", async () => {
    const client = await connectClient()
    const tools = await client.listTools()
    const toolNames = tools.tools.map((tool) => tool.name)

    expect(toolNames.sort()).toEqual([...LUMENCLIP_MCP_TOOL_NAMES].sort())
    expect(toolNames).not.toContain("lumenclip_slideshow_generate")
    expect(toolNames).not.toContain("lumenclip_workspace_members_list")
  })

  it("removes disabled APIs from MCP discovery", async () => {
    const client = await connectClient(
      {},
      { disabledToolNames: ["lumenclip_output_delete"] }
    )
    const tools = await client.listTools()

    expect(tools.tools.map((tool) => tool.name)).not.toContain(
      "lumenclip_output_delete"
    )
  })

  it("creates an empty image collection", async () => {
    const save = vi.fn(async (collection: StoredImageCollection) => collection)
    const client = await connectClient({
      listImageCollections: vi.fn(async () => []),
      upsertImageCollection: save,
      now: () => new Date("2026-07-19T12:00:00.000Z"),
    })

    const result = await client.callTool({
      name: "lumenclip_collection_save",
      arguments: {
        name: "Mystical Pictures",
        mediaType: "image",
        requestId: "collection-1",
      },
    })

    expect(save).toHaveBeenCalledWith({
      name: "Mystical Pictures",
      created_at: "2026-07-19T12:00:00.000Z",
      pinned: false,
      images: [],
    })
    expect(result.structuredContent).toMatchObject({
      requestId: "collection-1",
      created: true,
      collection: {
        name: "Mystical Pictures",
        mediaType: "image",
        itemCount: 0,
      },
    })
  })

  it("lists image collections with a name filter", async () => {
    const client = await connectClient({
      listImageCollections: vi.fn(async () => [
        {
          name: "Interiors",
          created_at: "2026-07-19T12:00:00.000Z",
          images: [],
        },
        {
          name: "Charts",
          created_at: "2026-07-19T12:00:00.000Z",
          images: [],
        },
      ]),
    })

    const result = await client.callTool({
      name: "lumenclip_collections_list",
      arguments: { query: "chart" },
    })

    expect(result.structuredContent).toMatchObject({
      total: 1,
      items: [{ name: "Charts", mediaType: "image" }],
    })
  })

  it("soft-deletes a collection for 30 days", async () => {
    const collection: StoredImageCollection = {
      name: "Temporary collection",
      created_at: "2026-07-19T12:00:00.000Z",
      images: [],
    }
    const deleteCollection = vi.fn(async () => ({
      deleted: 1,
      deletedFiles: 0,
      deletedAt: "2026-07-19T13:00:00.000Z",
      deletedUntil: "2026-08-18T13:00:00.000Z",
      collections: [collection],
    }))
    const client = await connectClient({
      listImageCollections: vi.fn(async () => [collection]),
      deleteImageCollections: deleteCollection,
    })

    const result = await client.callTool({
      name: "lumenclip_collection_delete",
      arguments: {
        collectionId: "Temporary collection",
        requestId: "delete-collection-1",
        confirmDelete: true,
      },
    })

    expect(result.isError).not.toBe(true)
    expect(deleteCollection).toHaveBeenCalledWith([
      {
        name: collection.name,
        created_at: collection.created_at,
      },
    ])
    expect(result.structuredContent).toMatchObject({
      requestId: "delete-collection-1",
      deletedAt: "2026-07-19T13:00:00.000Z",
      deletedUntil: "2026-08-18T13:00:00.000Z",
      alreadyDeleted: false,
    })
  })

  it("lists rendered slideshows with publication state and delivery links", async () => {
    vi.stubEnv("BASE_URL", "https://studio.example.com/")
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "test-secret")
    const slideshow = slideshowRecord()
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async () => [slideshow]),
      listPosts: vi.fn(async () => [postRecord({ status: "scheduled" })]),
    })

    const result = await client.callTool({
      name: "lumenclip_outputs_list",
      arguments: {},
    })

    const items = (
      result.structuredContent as { items: Array<Record<string, unknown>> }
    ).items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: slideshow.id,
      outputType: "slideshow",
      status: "ready",
      publicationState: "scheduled",
      title: slideshow.title,
      slideCount: 1,
    })
    const previewUrl = items[0].previewUrl as string
    expect(previewUrl).toMatch(
      /^https:\/\/studio\.example\.com\/share\/slideshows\/slideshow-1\?token=/
    )
    expect(items[0].downloadUrl).toMatch(
      /^https:\/\/studio\.example\.com\/api\/public\/slideshows\/slideshow-1\/download\?token=/
    )
    const token = new URL(previewUrl).searchParams.get("token") ?? ""
    expect(verifySlideshowShareToken(token, "slideshow-1")).toMatchObject({
      ownerId: "owner-1",
      outputId: "slideshow-1",
    })
  })

  it("omits delivery URLs when sharing is not configured", async () => {
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "")
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async () => [slideshowRecord()]),
    })

    const result = await client.callTool({
      name: "lumenclip_output_get",
      arguments: { outputId: "slideshow-1" },
    })

    const output = result.structuredContent as Record<string, unknown>
    expect(output.previewUrl).toBeUndefined()
    expect(output.downloadUrl).toBeUndefined()
  })

  it("inspects one rendered slideshow with per-slide text and URLs", async () => {
    vi.stubEnv("BASE_URL", "https://studio.example.com")
    const slideshow = slideshowRecord()
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async ({ id } = {}) =>
        id === slideshow.id ? [slideshow] : []
      ),
    })

    const result = await client.callTool({
      name: "lumenclip_output_get",
      arguments: { outputId: slideshow.id },
    })

    expect(result.structuredContent).toMatchObject({
      id: slideshow.id,
      caption: slideshow.caption,
      hashtags: slideshow.hashtags,
      publicationState: "not_published",
      slides: [
        {
          index: 1,
          textItems: [{ id: "hook-heading", text: "Hook text" }],
          sourceImageUrl: "https://example.com/image.jpg",
          renderedImageUrl:
            "https://studio.example.com/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
        },
      ],
    })
  })

  it("permanently deletes an unpublished slideshow output", async () => {
    const slideshow = slideshowRecord()
    const deleteSlideshow = vi.fn(async () => slideshow)
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async () => [slideshow]),
      deleteSlideshowRecord: deleteSlideshow,
    })

    const result = await client.callTool({
      name: "lumenclip_output_delete",
      arguments: {
        outputId: slideshow.id,
        requestId: "delete-output-1",
        confirmDelete: true,
      },
    })

    expect(result.isError).not.toBe(true)
    expect(deleteSlideshow).toHaveBeenCalledWith({ id: slideshow.id })
    expect(result.structuredContent).toEqual({
      requestId: "delete-output-1",
      outputId: slideshow.id,
      outputType: "slideshow",
      deleted: true,
      recoverable: false,
    })
  })

  it("refuses to delete published outputs", async () => {
    const deleteSlideshow = vi.fn()
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async () => [slideshowRecord()]),
      listPosts: vi.fn(async () => [postRecord({ status: "published" })]),
      deleteSlideshowRecord: deleteSlideshow,
    })

    const result = await client.callTool({
      name: "lumenclip_output_delete",
      arguments: {
        outputId: "slideshow-1",
        requestId: "delete-output-2",
        confirmDelete: true,
      },
    })

    expect(result.isError).toBe(true)
    expect(deleteSlideshow).not.toHaveBeenCalled()
  })

  it("lists and reads queue operations", async () => {
    const job: Job = {
      id: "job-1",
      type: "send-notification",
      status: "queued",
      payload: {},
      result: null,
      error: null,
      attempts: 0,
      maxAttempts: 3,
      availableAt: "2026-07-22T12:00:00.000Z",
      createdAt: "2026-07-22T12:00:00.000Z",
      updatedAt: "2026-07-22T12:00:00.000Z",
      ownerId: "owner-1",
    }
    const client = await connectClient({
      listJobs: vi.fn(async () => [job]),
      getJob: vi.fn(async (id: string) => (id === job.id ? job : null)),
    })

    const list = await client.callTool({
      name: "lumenclip_operations_list",
      arguments: {},
    })
    const one = await client.callTool({
      name: "lumenclip_operation_get",
      arguments: { operationId: job.id },
    })
    const missing = await client.callTool({
      name: "lumenclip_operation_get",
      arguments: { operationId: "job-missing" },
    })

    expect(list.structuredContent).toMatchObject({
      total: 1,
      items: [{ id: job.id, kind: "send-notification", status: "queued" }],
    })
    expect(one.structuredContent).toMatchObject({ id: job.id })
    expect(missing.isError).toBe(true)
  })

  it("publishes a reviewed output through the SocialBu publishing service", async () => {
    const slideshow = slideshowRecord()
    const publish = vi.fn(async () => ({
      posts: [postRecord({ id: "post-2", status: "publishing" })],
    }))
    const client = await connectClient({
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      listSlideshowRecords: vi.fn(async () => [slideshow]),
      publishRender: publish,
    })

    const result = await client.callTool({
      name: "lumenclip_output_publish",
      arguments: {
        outputId: slideshow.id,
        targets: [
          { accountId: "account-1", mode: "now" },
          {
            accountId: "account-2",
            mode: "schedule",
            scheduledAt: "2026-07-24T09:00:00+08:00",
          },
        ],
        requestId: "publish-2",
        confirmPublish: true,
      },
    })

    expect(result.isError).not.toBe(true)
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish).toHaveBeenCalledWith("owner-1", {
      renderId: slideshow.id,
      accountIds: ["account-1"],
      caption: "Caption\n\n#topic",
      publishAt: null,
      idempotencyKey: "publish-2:now",
      createdBy: "owner-1",
    })
    expect(publish).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        accountIds: ["account-2"],
        publishAt: "2026-07-24T01:00:00.000Z",
      })
    )
    expect(result.structuredContent).toMatchObject({
      publishing: 2,
      failed: 0,
    })
  })

  it("rejects scheduled targets in the past", async () => {
    const publish = vi.fn()
    const client = await connectClient({
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      publishRender: publish,
    })

    const result = await client.callTool({
      name: "lumenclip_output_publish",
      arguments: {
        outputId: "slideshow-1",
        targets: [
          {
            accountId: "account-1",
            mode: "schedule",
            scheduledAt: "2026-07-19T09:00:00+00:00",
          },
        ],
        requestId: "publish-3",
        confirmPublish: true,
      },
    })

    expect(result.isError).toBe(true)
    expect(publish).not.toHaveBeenCalled()
  })

  it("lists SocialBu accounts and reports when SocialBu is not connected", async () => {
    const connected = await connectClient({
      listPublishingAccounts: vi.fn(async () => ({
        status: { configured: true as const, provider: "socialbu" as const },
        accounts: [
          {
            id: "4821",
            provider: "tiktok",
            name: "TikTok account",
            active: true,
            avatarUrl: null,
            extra: {},
            disabled: false,
          },
          {
            id: "4822",
            provider: "instagram",
            name: "Hidden",
            active: true,
            avatarUrl: null,
            extra: {},
            disabled: true,
          },
        ],
      })),
    })
    const list = await connected.callTool({
      name: "lumenclip_accounts_list",
      arguments: {},
    })
    expect(list.structuredContent).toMatchObject({
      total: 1,
      items: [{ id: "4821", platform: "tiktok", connected: true }],
    })

    const disconnected = await connectClient()
    const empty = await disconnected.callTool({
      name: "lumenclip_accounts_list",
      arguments: {},
    })
    expect(empty.structuredContent).toMatchObject({
      total: 0,
      status: { configured: false, message: "SocialBu not connected" },
    })
  })

  it("reads scheduled and published posts in the schedule window", async () => {
    const listCalendar = vi.fn(async () => ({
      items: [calendarItem()],
    }))
    const client = await connectClient({
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      listCalendarItems: listCalendar,
    })

    const result = await client.callTool({
      name: "lumenclip_schedule_get",
      arguments: { days: 7 },
    })

    expect(listCalendar).toHaveBeenCalledWith("owner-1", {
      from: "2026-07-20T00:00:00.000Z",
      to: "2026-07-27T00:00:00.000Z",
    })
    expect(result.structuredContent).toMatchObject({
      from: "2026-07-20T00:00:00.000Z",
      to: "2026-07-27T00:00:00.000Z",
      calendarItems: {
        items: [{ id: "post:post-1", status: "scheduled" }],
        summary: { scheduled: 1 },
      },
    })
  })
})

async function connectClient(
  overrides: Partial<LumenClipMcpServices> = {},
  options: { disabledToolNames?: Iterable<string> } = {}
) {
  const server = createLumenClipMcpServer(
    "owner-1",
    {
      listSlideshowRecords: vi.fn(async () => []),
      listPosts: vi.fn(async () => []),
      listJobs: vi.fn(async () => []),
      listCalendarItems: vi.fn(async () => ({ items: [] })),
      listPublishingAccounts: vi.fn(async () => ({
        status: {
          configured: false as const,
          message: "SocialBu not connected" as const,
        },
        accounts: [],
      })),
      ...overrides,
    },
    options
  )
  const client = new Client({ name: "lumenclip-test", version: "1.0.0" })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  clients.push(client)
  servers.push(server)
  return client
}

function postRecord(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    workspaceId: "owner-1",
    renderId: "slideshow-1",
    provider: "tiktok",
    accountId: "account-1",
    status: "draft",
    publishAt: null,
    publishedAt: null,
    caption: "Caption",
    platformOptions: {},
    providerPostId: null,
    externalPostId: null,
    permalink: null,
    error: null,
    intentKey: "intent-1",
    createdBy: "owner-1",
    createdAt: "2026-07-18T01:00:00.000Z",
    updatedAt: "2026-07-18T01:01:00.000Z",
    ...overrides,
  }
}

function calendarItem(): CalendarItem {
  return {
    id: "post-1",
    status: "scheduled",
    datetime: "2026-07-22T09:00:00.000Z",
    timezone: "UTC",
    targets: [{ integrationId: "account-1", provider: "tiktok", status: "scheduled" }],
    source: "post",
    sourceType: "slideshow",
    sourceId: "slideshow-1",
    title: "Rendered title",
    links: {},
    timestamps: { scheduledAt: "2026-07-22T09:00:00.000Z" },
  }
}

function slideshowRecord(): SlideshowRecord {
  return {
    id: "slideshow-1",
    title: "Rendered title",
    caption: "Caption",
    hashtags: "#topic",
    prompt: "",
    image_collection: "",
    slideshow_type: "educational",
    created_at: "2026-07-18T01:00:00.000Z",
    updated_at: "2026-07-18T01:01:00.000Z",
    status: "exported",
    output_dir: "/api/local-assets/slideshows/outputs/slideshow-1",
    output_images: [
      "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
    ],
    settings: {
      duration: 4,
      aspect_ratio: "9:16",
      font: "Inter",
      background_color: "#000000",
      transition_style: "cut",
      export_as_video: false,
      sound_id: "",
      sound_name: "",
      sound_url: "",
    },
    images: [
      {
        id: "slide-1",
        image_url:
          "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
        source_image_url: "https://example.com/image.jpg",
        textItems: [
          {
            id: "hook-heading",
            text: "Hook text",
            fontSize: "12px",
            textSize: { width: 80, height: 18 },
            textStyle: "outline",
            textAlign: "center",
            textAnchor: "padded",
            textPosition: { x: 50, y: 45 },
          },
        ],
      },
    ],
  }
}
