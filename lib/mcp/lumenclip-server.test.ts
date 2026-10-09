import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { StoredImageCollection } from "@/lib/image-collections"
import {
  createLumenClipMcpServer,
  type LumenClipMcpServices,
} from "@/lib/mcp/lumenclip-server"
import { LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"
import type { PostFastPostRecord } from "@/lib/postfast-posts"
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
      listPostFastPostRecords: vi.fn(async () => [
        publicationRecord({ status: "scheduled" }),
      ]),
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
    const deletePublications = vi.fn(async () => [])
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async () => [slideshow]),
      deleteSlideshowRecord: deleteSlideshow,
      deletePostFastPostRecords: deletePublications,
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
    expect(deletePublications).toHaveBeenCalledWith({
      sourceType: "slideshow",
      sourceIds: [slideshow.id],
    })
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
      listPostFastPostRecords: vi.fn(async () => [
        publicationRecord({ status: "published" }),
      ]),
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

  it("routes a manual link through the shared writer", async () => {
    const slideshow = slideshowRecord()
    const publication = publicationRecord({
      id: "publication-manual-1",
      integrationId: "manual-tiktok",
      status: "published",
      publishedAt: "2026-07-30T12:00:00.000Z",
      releaseUrl: "https://www.tiktok.com/@creator/photo/7662360324313517330",
      linkState: "manually_linked",
    })
    const link = vi.fn(async () => publication)
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async () => [slideshow]),
      linkPublishedOutput: link,
    })

    const result = await client.callTool({
      name: "lumenclip_output_mark_published",
      arguments: {
        outputId: slideshow.id,
        platform: "tiktok",
        publishedUrl: publication.releaseUrl,
        publishedAt: publication.publishedAt,
        requestId: "manual-link-1",
        confirmLink: true,
      },
    })

    expect(result.isError).not.toBe(true)
    expect(link).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "slideshow",
        sourceId: slideshow.id,
        integrationId: "manual-tiktok",
      })
    )
  })

  it("publishes a reviewed output only after explicit confirmation", async () => {
    const slideshow = slideshowRecord()
    const publication = publicationRecord({
      id: "publication-2",
      status: "published",
      media: [{ key: "uploaded-1", type: "IMAGE" }],
    })
    const publish = vi.fn(async () => ({ ok: true, record: publication }))
    const upload = vi.fn(async () => publication.media)
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async () => [slideshow]),
      listAccounts: vi.fn(async () => [
        {
          integration_id: "account-1",
          provider: "tiktok" as const,
          name: "TikTok account",
        },
      ]),
      uploadPostFastMediaSources: upload,
      publishPost: publish as unknown as LumenClipMcpServices["publishPost"],
    })

    const result = await client.callTool({
      name: "lumenclip_output_publish",
      arguments: {
        outputId: slideshow.id,
        targets: [{ accountId: "account-1", mode: "now" }],
        requestId: "publish-2",
        confirmPublish: true,
      },
    })

    expect(upload).toHaveBeenCalledWith({ urls: slideshow.output_images })
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "now",
        integrationId: "account-1",
        content: "Caption\n\n#topic",
        sourceType: "slideshow",
        sourceId: slideshow.id,
      })
    )
    expect(result.structuredContent).toMatchObject({
      published: 1,
      reused: 0,
      failed: 0,
    })
  })

  it("suppresses a duplicate publication for the same output and account", async () => {
    const existing = publicationRecord({
      integrationId: "account-1",
      status: "scheduled",
    })
    const publish = vi.fn()
    const client = await connectClient({
      listSlideshowRecords: vi.fn(async () => [slideshowRecord()]),
      listPostFastPostRecords: vi.fn(async () => [existing]),
      listAccounts: vi.fn(async () => [
        {
          integration_id: "account-1",
          provider: "tiktok" as const,
          name: "TikTok account",
        },
      ]),
      publishPost: publish,
    })

    const result = await client.callTool({
      name: "lumenclip_output_publish",
      arguments: {
        outputId: "slideshow-1",
        targets: [{ accountId: "account-1", mode: "now" }],
        requestId: "publish-3",
        confirmPublish: true,
      },
    })

    expect(publish).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({ reused: 1, failed: 0 })
  })

  it("reads scheduled and published items in the schedule window", async () => {
    const client = await connectClient({
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      listPostFastPostRecords: vi.fn(async () => [
        publicationRecord({
          id: "pub-scheduled",
          status: "scheduled",
          scheduledAt: "2026-07-22T09:00:00.000Z",
        }),
        publicationRecord({
          id: "pub-outside",
          status: "scheduled",
          scheduledAt: "2026-09-22T09:00:00.000Z",
        }),
      ]),
    })

    const result = await client.callTool({
      name: "lumenclip_schedule_get",
      arguments: { days: 7 },
    })

    expect(result.structuredContent).toMatchObject({
      from: "2026-07-20T00:00:00.000Z",
      to: "2026-07-27T00:00:00.000Z",
      calendarItems: {
        items: [{ id: "publication:pub-scheduled", status: "scheduled" }],
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
      listPostFastPostRecords: vi.fn(async () => []),
      listJobs: vi.fn(async () => []),
      postfastRequest: vi.fn(async () => []) as never,
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

function publicationRecord(
  overrides: Partial<PostFastPostRecord> = {}
): PostFastPostRecord {
  return {
    id: "publication-1",
    sourceType: "slideshow",
    sourceId: "slideshow-1",
    integrationId: "account-1",
    provider: "tiktok",
    status: "draft",
    linkState: "postfast_published",
    statsSources: [],
    content: "Caption",
    media: [],
    createdAt: "2026-07-18T01:00:00.000Z",
    updatedAt: "2026-07-18T01:01:00.000Z",
    ...overrides,
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
