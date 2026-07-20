import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createLocalAutomationRecord } from "@/lib/automations"
import type { AutomationRunRecord } from "@/lib/automation-runner"
import type { StoredImageCollection } from "@/lib/image-collections"
import {
  buildAnalyticsReport,
  buildScheduleReport,
  createLumenClipMcpServer,
  type LumenClipMcpServices,
} from "@/lib/mcp/lumenclip-server"
import type {
  AccountFollowerSnapshot,
  PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import { schemaWithAutomationCollectionId } from "@/lib/realfarm-automation"
import { defaultXAutomation } from "@/lib/x-automation"

const clients: Client[] = []
const servers: ReturnType<typeof createLumenClipMcpServer>[] = []

afterEach(async () => {
  await Promise.all([
    ...clients.splice(0).map((client) => client.close()),
    ...servers.splice(0).map((server) => server.close()),
  ])
})

describe("LumenClip MCP server", () => {
  it("registers the app tools and the TikTok reconciliation tools", async () => {
    const client = await connectClient()
    const tools = await client.listTools()

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      [
        "lumenclip_accounts_list",
        "lumenclip_analytics_report",
        "lumenclip_automation_get",
        "lumenclip_automation_run",
        "lumenclip_automation_update",
        "lumenclip_automations_list",
        "lumenclip_collection_add_assets",
        "lumenclip_collection_delete",
        "lumenclip_collection_save",
        "lumenclip_collections_list",
        "lumenclip_operation_get",
        "lumenclip_output_delete",
        "lumenclip_output_mark_published",
        "lumenclip_output_publish",
        "lumenclip_outputs_list",
        "lumenclip_schedule_get",
        "lumenclip_slideshow_generate",
        "lumenclip_tiktok_import_preview",
        "lumenclip_tiktok_import_start",
        "lumenclip_tiktok_publications_link",
      ].sort()
    )
  })

  it("reads schedules across slideshow and social automations", async () => {
    const slideshow = automationRecord()
    const social = {
      ...defaultXAutomation({ id: "threads-1", platform: "threads" }),
      status: "paused" as const,
      schedule: {
        timezone: "Asia/Singapore",
        posting_times: [{ time: "9:00 AM" as const, days: ["Sun" as const] }],
        paused: true,
      },
    }
    const report = buildScheduleReport({
      automations: [slideshow],
      socialAutomations: [social],
      from: new Date("2026-07-18T00:00:00.000Z"),
      days: 2,
      includePaused: true,
      limit: 20,
    })

    expect(report.automations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "automation-1", kind: "slideshow" }),
        expect.objectContaining({ id: "threads-1", kind: "threads" }),
      ])
    )
    expect(report.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ automationId: "automation-1" }),
        expect.objectContaining({ automationId: "threads-1", paused: true }),
      ])
    )
  })

  it("pauses a slideshow automation and its schedule", async () => {
    const current = automationRecord()
    const patch = vi.fn(
      async (input: { status?: string; schema?: unknown }) => ({
        ...current,
        status:
          input.status === "paused" ? ("paused" as const) : current.status,
        schema: input.schema
          ? (input.schema as typeof current.schema)
          : current.schema,
        updatedAt: "2026-07-18T02:00:00.000Z",
      })
    )
    const client = await connectClient({
      getAutomationRecord: vi.fn(async (id: string) =>
        id === current.id ? current : null
      ) as LumenClipMcpServices["getAutomationRecord"],
      patchAutomationRecord:
        patch as unknown as LumenClipMcpServices["patchAutomationRecord"],
    })

    const result = await client.callTool({
      name: "lumenclip_automation_update",
      arguments: { automationId: current.id, action: "pause" },
    })

    expect(result.structuredContent).toMatchObject({
      id: current.id,
      status: "paused",
      schedule: { paused: true },
    })
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: current.id,
        status: "paused",
        schema: expect.objectContaining({
          schedule: expect.objectContaining({ paused: true }),
        }),
      })
    )
  })

  it("generates a manual slideshow draft and returns a concise run", async () => {
    const current = automationRecord()
    const run = generatedRun(current.id)
    const generate = vi.fn(async () => ({
      created: [run],
      results: [],
      skipped: [],
    }))
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      runDueAutomations:
        generate as unknown as LumenClipMcpServices["runDueAutomations"],
    })

    const result = await client.callTool({
      name: "lumenclip_slideshow_generate",
      arguments: {
        automationId: current.id,
        requestId: "request-1",
      },
    })

    expect(generate).toHaveBeenCalledWith({
      automationId: current.id,
      force: true,
      requestId: "request-1",
    })
    expect(result.structuredContent).toMatchObject({
      automationId: current.id,
      requestId: "request-1",
      runs: [
        {
          runId: "run-1",
          slideshowId: "slideshow-1",
          status: "succeeded",
          slideCount: 1,
        },
      ],
    })
  })

  it("lists standard and social automations before mutation", async () => {
    const standard = automationRecord()
    const social = defaultXAutomation({ id: "threads-1", platform: "threads" })
    const client = await connectClient({
      listAutomationRecords: vi.fn(async () => [standard]),
      listXAutomations: vi.fn(async () => [social]),
      listAutomationRuns: vi.fn(async () => [generatedRun(standard.id)]),
      listXAutomationRuns: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_automations_list",
      arguments: { limit: 20 },
    })

    expect(result.structuredContent).toMatchObject({
      total: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ id: standard.id, kind: "slideshow" }),
        expect.objectContaining({ id: social.id, kind: "threads" }),
      ]),
    })
  })

  it("runs a slideshow through the general retry-safe automation tool", async () => {
    const current = automationRecord()
    const run = generatedRun(current.id)
    const generate = vi.fn(async () => ({
      created: [run],
      results: [],
      skipped: [],
    }))
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => []),
      runDueAutomations: generate,
    })

    const result = await client.callTool({
      name: "lumenclip_automation_run",
      arguments: {
        automationId: current.id,
        requestId: "general-run-1",
      },
    })

    expect(generate).toHaveBeenCalledWith({
      automationId: current.id,
      force: true,
      requestId: "general-run-1",
    })
    expect(result.structuredContent).toMatchObject({
      operation: { id: run.id, status: "succeeded" },
      outputs: [{ id: run.slideshowId, publicationState: "not_published" }],
    })
  })

  it("returns no_images as a structured non-error skip from automation_run", async () => {
    const current = automationRecord()
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => []),
      runDueAutomations: vi.fn(async () => ({
        created: [],
        results: [],
        skipped: [{ automationId: current.id, reason: "no_images" as const }],
      })),
      now: () => new Date("2026-07-19T12:00:00.000Z"),
    })

    const result = await client.callTool({
      name: "lumenclip_automation_run",
      arguments: {
        automationId: current.id,
        requestId: "no-images-1",
      },
    })

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      automationId: current.id,
      requestId: "no-images-1",
      operation: { status: "failed", stage: "precondition" },
      outputs: [],
      skipped: [{ automationId: current.id, reason: "no_images" }],
      errors: [{ code: "COLLECTION_EMPTY", retryable: true }],
    })
  })

  it("creates an empty image collection so MCP can bootstrap generation", async () => {
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

  it("soft-deletes an unreferenced collection for 30 days", async () => {
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
      listAutomationRecords: vi.fn(async () => []),
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
      dependencies: [],
    })
  })

  it("requires an explicit override before deleting a referenced collection", async () => {
    const collection: StoredImageCollection = {
      name: "Referenced collection",
      created_at: "2026-07-19T12:00:00.000Z",
      images: [],
    }
    const current = automationRecord()
    const referencing = {
      ...current,
      schema: schemaWithAutomationCollectionId(
        current.schema,
        "hook",
        collection.name
      ),
    }
    const deleteCollection = vi.fn()
    const client = await connectClient({
      listImageCollections: vi.fn(async () => [collection]),
      listAutomationRecords: vi.fn(async () => [referencing]),
      deleteImageCollections: deleteCollection,
    })

    const result = await client.callTool({
      name: "lumenclip_collection_delete",
      arguments: {
        collectionId: collection.name,
        requestId: "delete-referenced-1",
        confirmDelete: true,
      },
    })

    expect(result.isError).toBe(true)
    expect(deleteCollection).not.toHaveBeenCalled()
  })

  it("permanently deletes an unpublished slideshow output", async () => {
    const run = generatedRun("automation-1")
    const deleteRuns = vi.fn(async () => [run])
    const deletePublications = vi.fn(async () => [])
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      listPostFastPostRecords: vi.fn(async () => []),
      listSlideshowRecords: vi.fn(async () => []),
      deleteAutomationRuns: deleteRuns,
      deletePostFastPostRecords: deletePublications,
    })

    const result = await client.callTool({
      name: "lumenclip_output_delete",
      arguments: {
        outputId: run.slideshowId,
        requestId: "delete-output-1",
        confirmDelete: true,
      },
    })

    expect(result.isError).not.toBe(true)
    expect(deleteRuns).toHaveBeenCalledWith({ runIds: [run.id] })
    expect(deletePublications).toHaveBeenCalledTimes(2)
    expect(result.structuredContent).toEqual({
      requestId: "delete-output-1",
      outputId: run.slideshowId,
      outputType: "slideshow",
      deleted: true,
      recoverable: false,
    })
  })

  it("refuses to delete published outputs", async () => {
    const run = {
      ...generatedRun("automation-1"),
      manuallyPublishedAt: "2026-07-19T13:00:00.000Z",
    }
    const deleteRuns = vi.fn()
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      listPostFastPostRecords: vi.fn(async () => []),
      deleteAutomationRuns: deleteRuns,
    })

    const result = await client.callTool({
      name: "lumenclip_output_delete",
      arguments: {
        outputId: run.slideshowId,
        requestId: "delete-output-published",
        confirmDelete: true,
      },
    })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Published outputs cannot be deleted"),
        }),
      ])
    )
    expect(deleteRuns).not.toHaveBeenCalled()
  })

  it("suppresses a duplicate external publication for the same output and account", async () => {
    const current = automationRecord()
    const run = generatedRun(current.id)
    const existingPublication = {
      id: "publication-1",
      sourceType: "slideshow" as const,
      sourceId: run.slideshowId!,
      integrationId: "account-1",
      provider: "tiktok",
      status: "published" as const,
      content: "Already published",
      media: [],
      createdAt: "2026-07-18T01:00:00.000Z",
      updatedAt: "2026-07-18T01:01:00.000Z",
    }
    const publish = vi.fn()
    const upload = vi.fn(async () => [])
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      listAccounts: vi.fn(async () => [
        {
          integration_id: "account-1",
          provider: "tiktok" as const,
          name: "TikTok account",
        },
      ]),
      listPostFastPostRecords: vi.fn(async () => [existingPublication]),
      uploadPostFastMediaSources: upload,
      publishPost: publish,
    })

    const result = await client.callTool({
      name: "lumenclip_output_publish",
      arguments: {
        outputId: run.slideshowId,
        targets: [{ accountId: "account-1", mode: "now" }],
        requestId: "publish-1",
        confirmPublish: true,
      },
    })

    expect(publish).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      published: 1,
      reused: 1,
      failed: 0,
    })
  })

  it("publishes a reviewed output only after explicit confirmation", async () => {
    const run = generatedRun("automation-1")
    const publication = {
      id: "publication-2",
      sourceType: "slideshow" as const,
      sourceId: run.slideshowId!,
      integrationId: "account-1",
      provider: "tiktok",
      status: "published" as const,
      content: "Generated caption",
      media: [{ key: "uploaded-1", type: "IMAGE" as const }],
      createdAt: "2026-07-18T01:00:00.000Z",
      updatedAt: "2026-07-18T01:01:00.000Z",
    }
    const publish = vi.fn(async () => ({ ok: true, record: publication }))
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      listAccounts: vi.fn(async () => [
        {
          integration_id: "account-1",
          provider: "tiktok" as const,
          name: "TikTok account",
        },
      ]),
      listPostFastPostRecords: vi.fn(async () => []),
      uploadPostFastMediaSources: vi.fn(async () => publication.media),
      publishPost: publish,
    })

    const result = await client.callTool({
      name: "lumenclip_output_publish",
      arguments: {
        outputId: run.slideshowId,
        targets: [{ accountId: "account-1", mode: "now" }],
        requestId: "publish-2",
        confirmPublish: true,
      },
    })

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "now",
        integrationId: "account-1",
        sourceType: "slideshow",
        sourceId: run.slideshowId,
      })
    )
    expect(result.structuredContent).toMatchObject({
      published: 1,
      reused: 0,
      failed: 0,
    })
  })
})

describe("MCP analytics report", () => {
  it("uses the latest snapshot per post and calculates follower change", () => {
    const report = buildAnalyticsReport({
      snapshots: [
        metricSnapshot("snapshot-old", "2026-07-17T00:00:00.000Z", 100),
        metricSnapshot("snapshot-new", "2026-07-18T00:00:00.000Z", 250),
      ],
      followerSnapshots: [
        followerSnapshot("followers-old", "2026-07-17T00:00:00.000Z", 1000),
        followerSnapshot("followers-new", "2026-07-18T00:00:00.000Z", 1025),
      ],
      now: new Date("2026-07-18T12:00:00.000Z"),
      days: 7,
      postLimit: 10,
    })

    expect(report.totals).toMatchObject({
      views: 250,
      interactions: 25,
      engagementRate: 10,
    })
    expect(report.accounts[0]).toMatchObject({
      integrationId: "integration-1",
      postCount: 1,
      followers: 1025,
      followerChange: 25,
    })
    expect(report.posts).toHaveLength(1)
    expect(report.posts[0].capturedAt).toBe("2026-07-18T00:00:00.000Z")
  })
})

async function connectClient(overrides: Partial<LumenClipMcpServices> = {}) {
  const server = createLumenClipMcpServer("owner-1", overrides)
  const client = new Client({ name: "lumenclip-test", version: "1.0.0" })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  clients.push(client)
  servers.push(server)
  return client
}

function automationRecord() {
  const record = createLocalAutomationRecord({ name: "Daily slideshow" })
  return {
    ...record,
    id: "automation-1",
    updatedAt: "2026-07-18T01:00:00.000Z",
    schema: {
      ...record.schema,
      automationKind: "slideshow" as const,
      schedule: {
        timezone: "Asia/Singapore",
        posting_times: [{ time: "8:00 AM" as const, days: ["Sun" as const] }],
        paused: false,
      },
    },
  }
}

function generatedRun(automationId: string): AutomationRunRecord {
  return {
    id: "run-1",
    automationId,
    automationTitle: "Daily slideshow",
    scheduledFor: "2026-07-18T01:00:00.000Z",
    generationSource: "manual",
    requestId: "request-1",
    status: "succeeded",
    slideshowId: "slideshow-1",
    plan: {
      title: "Generated title",
      caption: "Generated caption",
      hashtags: "#topic",
      hook: "Generated hook",
      imageCollectionIds: ["collection-1"],
      slides: [
        {
          id: "slide-1",
          role: "hook",
          imageUrl: "https://example.com/image.jpg",
          imageCaption: "Image",
          text: "Generated hook",
          textPlacement: "center",
        },
      ],
      slideCount: { mode: "static", count: 1 },
      publishType: "slideshow",
      autoMusic: false,
      autoPost: false,
      language: "English",
    },
    outputImages: ["https://example.com/output.jpg"],
    createdAt: "2026-07-18T01:00:00.000Z",
    updatedAt: "2026-07-18T01:01:00.000Z",
  }
}

function metricSnapshot(
  id: string,
  capturedAt: string,
  views: number
): PostFastMetricSnapshot {
  return {
    id,
    postId: "post-1",
    integrationId: "integration-1",
    provider: "tiktok",
    capturedAt,
    metrics: { views, interactions: views / 10 },
    latestMetric: {},
    rawMetrics: {},
    observedKeys: ["views", "interactions"],
  }
}

function followerSnapshot(
  id: string,
  capturedAt: string,
  followers: number
): AccountFollowerSnapshot {
  return {
    id,
    integrationId: "integration-1",
    provider: "tiktok",
    capturedAt,
    followers,
  }
}
