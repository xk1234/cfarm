import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createLocalAutomationRecord } from "@/lib/automations"
import type { UgcRunStatus } from "@/lib/ugc-run-status"
import type { AutomationRunRecord } from "@/lib/automation-runner"
import type { StoredImageCollection } from "@/lib/image-collections"
import {
  buildAnalyticsReport,
  buildScheduleReport,
  createLumenClipMcpServer,
  type LumenClipMcpServices,
} from "@/lib/mcp/lumenclip-server"
import { LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"
import type { Job } from "@/lib/queue"
import type {
  AccountFollowerSnapshot,
  PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import { schemaWithAutomationCollectionId } from "@/lib/realfarm-automation"
import { defaultXAutomation } from "@/lib/x-automation"
import type { WordCollectionRecord } from "@/lib/word-collections"

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
    const toolNames = tools.tools.map((tool) => tool.name)

    expect(toolNames.sort()).toEqual([...LUMENCLIP_MCP_TOOL_NAMES].sort())
    expect(toolNames).toContain("lumenclip_tiktok_studio_analytics_report")
    expect(toolNames).not.toContain("lumenclip_tiktok_studio_analytics_preview")
    expect(toolNames).not.toContain(
      "lumenclip_tiktok_studio_analytics_batch_preview"
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

  it("deletes a standard automation and its generated history", async () => {
    const current = automationRecord()
    const remove = vi.fn(async ({ id }: { id: string }) =>
      id === current.id
        ? {
            record: current,
            automation: { id: current.id, name: current.name },
            alreadyDeleted: false,
            deletedSlideshows: [],
            deletedSlideshowsCount: 0,
            deletedResultsCount: 0,
            deletedRuns: [{ id: "run-1" }],
            deletedRunsCount: 1,
            deletedJobs: [{ id: "job-1" }],
            deletedJobsCount: 1,
            deletedPostFastPosts: [],
            deletedPostFastPostsCount: 0,
          }
        : null
    )
    const client = await connectClient({
      deleteAutomationCascade:
        remove as unknown as LumenClipMcpServices["deleteAutomationCascade"],
    })

    const result = await client.callTool({
      name: "lumenclip_automation_delete",
      arguments: {
        automationId: current.id,
        requestId: "delete-automation-1",
        confirmDelete: true,
      },
    })

    expect(result.structuredContent).toMatchObject({
      requestId: "delete-automation-1",
      deleted: true,
      alreadyDeleted: false,
      deletedRunsCount: 1,
      deletedJobsCount: 1,
    })
    expect(remove).toHaveBeenCalledWith({ id: current.id })
  })

  it("exposes and replaces the canonical hook pool with duplicate analysis", async () => {
    const current = automationRecord()
    current.schema.hooks = [
      {
        id: "cusp-aries",
        text: "The dark side of being an Aries cusp",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "cusp-pisces",
        text: "The dark side of being a Pisces cusp",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "unique",
        text: "Why Virgos remember every detail",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    const patch = vi.fn(
      async ({ schema }: { schema?: typeof current.schema }) => ({
        ...current,
        schema: schema ?? current.schema,
        updatedAt: "2026-07-23T12:00:00.000Z",
      })
    )
    const client = await connectClient({
      getAutomationRecord: vi.fn(async (id: string) =>
        id === current.id ? current : null
      ) as LumenClipMcpServices["getAutomationRecord"],
      patchAutomationRecord:
        patch as unknown as LumenClipMcpServices["patchAutomationRecord"],
      now: () => new Date("2026-07-23T12:00:00.000Z"),
    })

    const read = await client.callTool({
      name: "lumenclip_automation_hooks_get",
      arguments: { automationId: current.id },
    })
    expect(read.structuredContent).toMatchObject({
      automationId: current.id,
      total: 3,
      duplicateSlotCount: 1,
      duplicateGroups: [
        expect.objectContaining({
          hookIds: ["cusp-aries", "cusp-pisces"],
        }),
      ],
    })

    const update = await client.callTool({
      name: "lumenclip_automation_hooks_update",
      arguments: {
        automationId: current.id,
        expectedUpdatedAt: current.updatedAt,
        deduplicateNearMatches: true,
        hooks: current.schema.hooks,
      },
    })
    expect(update.structuredContent).toMatchObject({
      automationId: current.id,
      total: 2,
      duplicateSlotCount: 0,
    })
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: current.id,
        schema: expect.objectContaining({
          hooks: expect.arrayContaining([
            expect.objectContaining({ id: "cusp-aries" }),
            expect.objectContaining({ id: "unique" }),
          ]),
        }),
      })
    )
  })

  it("exposes the full schema and supports granular hook mutations", async () => {
    let current = automationRecord()
    current.schema.hooks = [
      {
        id: "hook-existing",
        text: "Existing hook",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    const patch = vi.fn(
      async ({ schema }: { schema?: typeof current.schema }) => {
        current = {
          ...current,
          schema: schema ?? current.schema,
          updatedAt: "2026-07-23T12:00:00.000Z",
        }
        return current
      }
    )
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      patchAutomationRecord:
        patch as unknown as LumenClipMcpServices["patchAutomationRecord"],
      listAutomationRuns: vi.fn(async () => []),
      now: () => new Date("2026-07-23T12:00:00.000Z"),
    })

    const read = await client.callTool({
      name: "lumenclip_automation_get",
      arguments: { automationId: current.id },
    })
    expect(read.structuredContent).toMatchObject({
      automation: {
        schema: {
          automationKind: "slideshow",
          formatting: expect.any(Array),
          image_collection_ids: expect.anything(),
        },
      },
    })

    const upserted = await client.callTool({
      name: "lumenclip_automation_hook_upsert",
      arguments: {
        automationId: current.id,
        hooks: [{ id: "hook-new", text: "A new hook" }],
      },
    })
    expect(upserted.structuredContent).toMatchObject({
      total: 2,
      hooks: expect.arrayContaining([
        expect.objectContaining({ id: "hook-new", enabled: true }),
      ]),
    })

    const disabled = await client.callTool({
      name: "lumenclip_automation_hook_set_enabled",
      arguments: {
        automationId: current.id,
        hookIds: ["hook-new"],
        enabled: false,
      },
    })
    expect(disabled.structuredContent).toMatchObject({
      disabled: 1,
      hooks: expect.arrayContaining([
        expect.objectContaining({ id: "hook-new", enabled: false }),
      ]),
    })

    const deleted = await client.callTool({
      name: "lumenclip_automation_hook_delete",
      arguments: {
        automationId: current.id,
        hookIds: ["hook-new"],
        confirmDelete: true,
      },
    })
    expect(deleted.structuredContent).toMatchObject({
      deletedHookIds: ["hook-new"],
      total: 1,
    })
  })

  it("creates automations idempotently and exposes hook performance and run plans", async () => {
    let records: ReturnType<typeof automationRecord>[] = []
    const upsert = vi.fn(async ({ records: incoming }) => {
      records = [...incoming] as typeof records
      return records
    })
    const run = {
      ...generatedRun("automation-1"),
      plan: {
        ...generatedRun("automation-1").plan,
        hookId: "hook-1",
        hookTemplate: "Why [[ZODIAC]] remembers",
        hookSubstitutions: { ZODIAC: "Virgo" },
      },
    }
    const client = await connectClient({
      listAutomationRecords: vi.fn(async () => records),
      upsertAutomationRecords:
        upsert as unknown as LumenClipMcpServices["upsertAutomationRecords"],
      listAutomationRuns: vi.fn(async () => [run]),
      hookAnalyticsReport: vi.fn(async () => ({
        automationId: "automation-1",
        days: 30,
        since: "2026-06-23T12:00:00.000Z",
        hooks: [],
        rows: [],
        performance: [
          {
            hookId: "hook-1",
            text: "Why [[ZODIAC]] remembers",
            enabled: true,
            publishedPosts: 2,
            publishCount: 2,
            lastPublishedAt: "2026-07-23T00:00:00.000Z",
            providers: ["tiktok"],
            metrics: { views: 1_000, shares: 20, saves: 30 },
            views: 1_000,
            shares: 20,
            saves: 30,
            shareRate: 2,
            meanSlide1To2RetentionPercent: 75,
          },
        ],
      })),
    })

    const first = await client.callTool({
      name: "lumenclip_automation_create",
      arguments: {
        name: "Created by MCP",
        kind: "slideshow",
        status: "paused",
        requestId: "create-1",
      },
    })
    const second = await client.callTool({
      name: "lumenclip_automation_create",
      arguments: {
        name: "Created by MCP",
        kind: "slideshow",
        status: "paused",
        requestId: "create-1",
      },
    })
    expect(first.structuredContent).toMatchObject({
      created: true,
      reused: false,
    })
    expect(second.structuredContent).toMatchObject({
      created: false,
      reused: true,
    })
    expect(upsert).toHaveBeenCalledTimes(1)

    const performance = await client.callTool({
      name: "lumenclip_hook_performance",
      arguments: { automationId: "automation-1", days: 30 },
    })
    expect(performance.structuredContent).toMatchObject({
      performance: [
        expect.objectContaining({
          hookId: "hook-1",
          publishCount: 2,
          shareRate: 2,
          meanSlide1To2RetentionPercent: 75,
        }),
      ],
    })

    const plan = await client.callTool({
      name: "lumenclip_run_plan_get",
      arguments: { runId: run.id },
    })
    expect(plan.structuredContent).toMatchObject({
      runId: run.id,
      plan: {
        hookId: "hook-1",
        hookTemplate: "Why [[ZODIAC]] remembers",
        hookSubstitutions: { ZODIAC: "Virgo" },
      },
    })
  })

  it("returns materialized calendar lifecycle states, assets, jobs, products, and members", async () => {
    const current = automationRecord()
    const failedJob = {
      ...ugcJob(current.id),
      id: "job-failed",
      type: "run-automation",
      status: "failed" as const,
      error: "Generation failed",
      payload: {
        automationId: current.id,
        scheduledFor: "2026-07-19T00:00:00.000Z",
      },
    }
    const publication = {
      id: "publication-review",
      sourceType: "slideshow" as const,
      sourceId: "slideshow-review",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "ready_for_review" as const,
      content: "Review me",
      media: [],
      createdAt: "2026-07-19T01:00:00.000Z",
      updatedAt: "2026-07-19T01:00:00.000Z",
      automationId: current.id,
    }
    const client = await connectClient({
      listAutomationRecords: vi.fn(async () => [current]),
      listXAutomations: vi.fn(async () => []),
      listJobs: vi.fn(async () => [failedJob]),
      listPostFastPostRecords: vi.fn(async () => [publication]),
      listAutomationRuns: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
      listGeneratedVideoExports: vi.fn(async () => []),
      listAssetRecords: vi.fn(async () => [
        {
          id: "asset-1",
          kind: "image" as const,
          source: "upload" as const,
          status: "ready" as const,
          scope: "global" as const,
          name: "Product photo",
          caption: "Photo",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ]),
      listMediaLibraryAssets: vi.fn(async () => [
        {
          id: "music-1",
          name: "Track",
          path: "music/track.mp3",
          url: "/api/local-assets/music/track.mp3",
          kind: "audio" as const,
          collection: "music" as const,
        },
      ]),
      listProductCollections: vi.fn(async () => [
        {
          id: "products-1",
          name: "Products",
          description: "Catalog",
          items: [
            {
              id: "product-1",
              marketplace: "amazon",
              marketplaceUrl: "https://example.com/product",
              name: "Journal",
              currency: "SGD",
              price: 20,
              priceLabel: "S$20",
              commissionRate: 0.1,
              estimatedCommission: 2,
              storeImageUrl: "https://example.com/store.jpg",
              generatedImageUrl: "https://example.com/generated.jpg",
              useCase: "Astrology journaling",
              sourcedAt: "2026-07-01T00:00:00.000Z",
            },
          ],
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          commissionDisclaimer: "Estimated",
        },
      ]) as unknown as LumenClipMcpServices["listProductCollections"],
      listWorkspaceMembers: vi.fn(async () => [
        {
          id: "member-1",
          email: "member@example.com",
          status: "accepted" as const,
          memberUserId: "user-1",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ]),
      postfastRequest: vi.fn(
        async () => []
      ) as unknown as LumenClipMcpServices["postfastRequest"],
      now: () => new Date("2026-07-18T00:00:00.000Z"),
    })

    const schedule = await client.callTool({
      name: "lumenclip_schedule_get",
      arguments: { from: "2026-07-18T00:00:00.000Z", days: 2, limit: 50 },
    })
    expect(schedule.structuredContent).toMatchObject({
      calendarItems: {
        items: expect.arrayContaining([
          expect.objectContaining({ status: "generation_failed" }),
          expect.objectContaining({ status: "needs_action" }),
        ]),
        summary: expect.objectContaining({
          generation_failed: 1,
          needs_action: 1,
        }),
      },
    })

    const assets = await client.callTool({
      name: "lumenclip_assets_list",
      arguments: { limit: 20 },
    })
    expect(assets.structuredContent).toMatchObject({ total: 2 })

    const operations = await client.callTool({
      name: "lumenclip_operations_list",
      arguments: { limit: 20 },
    })
    expect(operations.structuredContent).toMatchObject({
      items: [expect.objectContaining({ id: "job-failed", attempts: 0 })],
    })

    const products = await client.callTool({
      name: "lumenclip_product_collection_get",
      arguments: { collectionId: "products-1" },
    })
    expect(products.structuredContent).toMatchObject({
      collection: { items: [expect.objectContaining({ name: "Journal" })] },
    })

    const members = await client.callTool({
      name: "lumenclip_workspace_members_list",
      arguments: {},
    })
    expect(members.structuredContent).toMatchObject({
      items: [expect.objectContaining({ email: "member@example.com" })],
    })
  })

  it("includes stored metric summaries and Studio guidance in outputs_list", async () => {
    const run = generatedRun("automation-1")
    const publication = {
      id: "publication-output-1",
      sourceType: "slideshow" as const,
      sourceId: run.slideshowId!,
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published" as const,
      content: "Cancer secrets",
      media: [],
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T01:00:00.000Z",
    }
    const snapshot = {
      ...metricSnapshot("snapshot-output-1", "2026-07-23T00:00:00.000Z", 1200),
      postId: publication.id,
      integrationId: publication.integrationId,
      source: "tiktok_studio" as const,
      rawMetrics: { newFollowers: 29 },
    }
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      listGeneratedVideoExports: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
      listPostFastPostRecords: vi.fn(async () => [publication]),
      listMetricSnapshots: vi.fn(async () => [snapshot]),
    })

    const result = await client.callTool({
      name: "lumenclip_outputs_list",
      arguments: { limit: 20 },
    })

    expect(result.structuredContent).toMatchObject({
      items: [
        expect.objectContaining({
          id: run.slideshowId,
          publicationState: "published",
          analytics: expect.objectContaining({
            available: true,
            postCount: 1,
            metrics: expect.objectContaining({
              views: 1200,
              interactions: 120,
            }),
            newFollowers: 29,
            reportTools: [
              "lumenclip_analytics_report",
              "lumenclip_tiktok_studio_analytics_report",
            ],
          }),
        }),
      ],
    })
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

  it("discovers UGC automations as manually runnable", async () => {
    const current = ugcAutomationRecord()
    const client = await connectClient({
      listAutomationRecords: vi.fn(async () => [current]),
      listAutomationRuns: vi.fn(async () => []),
      listXAutomations: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_automations_list",
      arguments: { kind: "ugc", limit: 20 },
    })

    expect(result.structuredContent).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: current.id,
          kind: "ugc",
          manualRunSupported: true,
        }),
      ],
    })
  })

  it("queues draft-only UGC generation through the general automation tool", async () => {
    const current = ugcAutomationRecord()
    const job = ugcJob(current.id)
    const enqueue = vi.fn(async () => ({
      id: job.id,
      status: "enqueued" as const,
    }))
    const slideshowRunner = vi.fn()
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      enqueueJob: enqueue,
      getJob: vi.fn(async () => job),
      runDueAutomations: slideshowRunner,
      ugcGenerationEnabled: () => true,
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    })

    const result = await client.callTool({
      name: "lumenclip_automation_run",
      arguments: {
        automationId: current.id,
        requestId: "ugc-request-1",
      },
    })

    expect(slideshowRunner).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run-ugc-automation",
        dedupeKey: `ugc-mcp:${current.id}:ugc-request-1`,
        payload: expect.objectContaining({
          automationId: current.id,
          requestId: "ugc-request-1",
          draftOnly: true,
        }),
      })
    )
    expect(result.structuredContent).toMatchObject({
      automationId: current.id,
      requestId: "ugc-request-1",
      expectedOutputId: expect.stringMatching(/^ugc-/),
      estimate: { currency: "USD", totalUsd: expect.any(Number) },
      operation: { id: job.id, kind: "ugc.generate", status: "running" },
      outputs: [],
      nextActions: [
        {
          tool: "lumenclip_operation_get",
          arguments: { operationId: job.id },
        },
      ],
    })
  })

  it("estimates a saved UGC automation without enqueuing work", async () => {
    const current = ugcAutomationRecord()
    const enqueue = vi.fn()
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      enqueueJob: enqueue,
    })

    const result = await client.callTool({
      name: "lumenclip_ugc_estimate",
      arguments: { automationId: current.id, lipSyncTier: "premium" },
    })

    expect(enqueue).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      automationId: current.id,
      estimate: { currency: "USD", tier: "premium" },
      assumptions: { lipSyncTier: "premium" },
    })
  })

  it("reads progress for a queued UGC operation", async () => {
    const current = ugcAutomationRecord()
    const job = { ...ugcJob(current.id), status: "processing" as const }
    const client = await connectClient({
      getJob: vi.fn(async () => job),
      getUgcRunStatus: vi.fn(async (): Promise<UgcRunStatus> => ({
        id: "ugcrun-progress",
        automationId: current.id,
        scheduledFor: String(
          (job.payload as Record<string, unknown>).scheduledFor
        ),
        status: "voice",
        error: null,
        checkpoints: {},
        stages: [
          { name: "analysis", status: "done", assetPaths: [] },
          { name: "script", status: "done", assetPaths: [] },
          { name: "actor", status: "done", assetPaths: [] },
          { name: "voice", status: "active", assetPaths: [] },
          { name: "motion", status: "pending", assetPaths: [] },
          { name: "lipsync", status: "pending", assetPaths: [] },
          { name: "broll", status: "pending", assetPaths: [] },
          { name: "composite", status: "pending", assetPaths: [] },
          { name: "store", status: "pending", assetPaths: [] },
          { name: "publish", status: "pending", assetPaths: [] },
        ],
        createdAt: "2026-07-22T12:00:01.000Z",
        updatedAt: "2026-07-22T12:00:10.000Z",
      })),
      getGeneratedVideoExport: vi.fn(async () => null),
    })

    const result = await client.callTool({
      name: "lumenclip_operation_get",
      arguments: { operationId: job.id },
    })

    expect(result.structuredContent).toMatchObject({
      operation: {
        id: job.id,
        kind: "ugc.generate",
        status: "running",
        stage: "voice",
        progress: 30,
      },
      outputs: [],
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

  it("reads a complete variable collection by name", async () => {
    const variable = wordCollection()
    const client = await connectClient({
      listWordCollections: vi.fn(async () => [variable]),
    })

    const result = await client.callTool({
      name: "lumenclip_variable_get",
      arguments: { variableId: "Zodiac signs" },
    })

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toEqual({
      variable: {
        id: "zodiac",
        name: "Zodiac signs",
        description: "Signs used in astrology hooks",
        values: ["aries", "taurus", "gemini"],
        valueCount: 3,
        source: "manual",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        resourceUri: "lumenclip://collections/zodiac",
      },
    })
  })

  it("creates a variable collection with explicit values", async () => {
    const saved = wordCollection()
    const save = vi.fn(async () => saved)
    const client = await connectClient({
      listWordCollections: vi.fn(async () => []),
      upsertWordCollection:
        save as unknown as LumenClipMcpServices["upsertWordCollection"],
    })

    const result = await client.callTool({
      name: "lumenclip_variable_save",
      arguments: {
        name: "Zodiac signs",
        description: "Signs used in astrology hooks",
        values: ["aries", "taurus", "gemini"],
        requestId: "variable-create-1",
      },
    })

    expect(save).toHaveBeenCalledWith({
      collection: {
        name: "Zodiac signs",
        description: "Signs used in astrology hooks",
        words: ["aries", "taurus", "gemini"],
        source: "manual",
        created_at: undefined,
      },
    })
    expect(result.structuredContent).toMatchObject({
      requestId: "variable-create-1",
      created: true,
      variable: { id: "zodiac", valueCount: 3 },
    })
  })

  it("updates a variable collection without clearing omitted metadata", async () => {
    const variable = wordCollection()
    const save = vi.fn(async ({ collection }) => ({
      ...variable,
      ...collection,
      words: collection.words ?? variable.words,
      updated_at: "2026-07-03T00:00:00.000Z",
    }))
    const client = await connectClient({
      listWordCollections: vi.fn(async () => [variable]),
      upsertWordCollection:
        save as unknown as LumenClipMcpServices["upsertWordCollection"],
    })

    const result = await client.callTool({
      name: "lumenclip_variable_save",
      arguments: {
        variableId: "zodiac",
        values: ["cancer", "leo"],
        requestId: "variable-update-1",
      },
    })

    expect(save).toHaveBeenCalledWith({
      collection: {
        id: "zodiac",
        name: "Zodiac signs",
        description: "Signs used in astrology hooks",
        words: ["cancer", "leo"],
        source: "manual",
        created_at: "2026-07-01T00:00:00.000Z",
      },
    })
    expect(result.structuredContent).toMatchObject({
      requestId: "variable-update-1",
      created: false,
      variable: {
        id: "zodiac",
        values: ["cancer", "leo"],
        valueCount: 2,
      },
    })
  })

  it("permanently deletes a confirmed variable collection", async () => {
    const variable = wordCollection()
    const remove = vi.fn(async () => variable)
    const client = await connectClient({
      listWordCollections: vi.fn(async () => [variable]),
      deleteWordCollection:
        remove as unknown as LumenClipMcpServices["deleteWordCollection"],
    })

    const result = await client.callTool({
      name: "lumenclip_variable_delete",
      arguments: {
        variableId: "zodiac",
        requestId: "variable-delete-1",
        confirmDelete: true,
      },
    })

    expect(remove).toHaveBeenCalledWith({ id: "zodiac" })
    expect(result.structuredContent).toMatchObject({
      requestId: "variable-delete-1",
      deleted: true,
      variable: { id: "zodiac", values: variable.words },
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

  it("uses publication ownership for integration filtering and reports followers gained", () => {
    const snapshot = {
      ...metricSnapshot("snapshot-studio", "2026-07-18T00:00:00.000Z", 250),
      integrationId: "stale-integration",
      rawMetrics: { newFollowers: 29 },
      source: "tiktok_studio" as const,
    }
    const report = buildAnalyticsReport({
      snapshots: [snapshot],
      followerSnapshots: [],
      publications: [
        {
          id: snapshot.postId,
          sourceType: "slideshow",
          sourceId: "slideshow-1",
          integrationId: "tiktok-current",
          provider: "tiktok",
          status: "published",
          content: "Cancer secrets",
          media: [],
          createdAt: "2026-07-17T00:00:00.000Z",
          updatedAt: "2026-07-18T00:00:00.000Z",
        },
      ],
      now: new Date("2026-07-18T12:00:00.000Z"),
      days: 7,
      integrationIds: ["tiktok-current"],
      postLimit: 10,
    })

    expect(report.accounts[0]).toMatchObject({
      integrationId: "tiktok-current",
      postCount: 1,
      newFollowers: 29,
    })
    expect(report.posts[0]).toMatchObject({
      integrationId: "tiktok-current",
      newFollowers: 29,
      studioReportTool: "lumenclip_tiktok_studio_analytics_report",
    })
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

function ugcAutomationRecord() {
  const record = automationRecord()
  return {
    ...record,
    name: "AI UGC product demo",
    schema: {
      ...record.schema,
      automationKind: "ugc" as const,
      status: "live" as const,
      ugc: {
        ...record.schema.ugc,
        enabled: true,
        productBrief: "A lightweight astrology journaling app",
        actorSource: "generate" as const,
        voiceId: "voice-1",
        lipSyncTier: "standard" as const,
        targetDurationSeconds: 30,
        brollCount: 3,
        captions: {
          enabled: true,
          style: "clean",
          fallback: "drawtext" as const,
        },
        hookOverlay: { enabled: true, durationMs: 1500, style: "bold" },
      },
    },
  }
}

function ugcJob(automationId: string): Job {
  return {
    id: "job-ugc-1",
    type: "run-ugc-automation",
    status: "queued",
    payload: {
      automationId,
      scheduledFor: "2026-07-22T12:00:00.000Z",
      requestId: "ugc-request-1",
      draftOnly: true,
    },
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    availableAt: "2026-07-22T12:00:00.000Z",
    createdAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-22T12:00:00.000Z",
    ownerId: "owner-1",
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

function wordCollection(): WordCollectionRecord {
  return {
    id: "zodiac",
    name: "Zodiac signs",
    description: "Signs used in astrology hooks",
    words: ["aries", "taurus", "gemini"],
    source: "manual",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
  }
}
