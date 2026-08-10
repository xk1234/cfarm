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
  diffAutomationSchemas,
  mergeAutomationSchemaPatch,
  type LumenClipMcpServices,
} from "@/lib/mcp/lumenclip-server"
import { LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"
import type { Job } from "@/lib/queue"
import type {
  AccountFollowerSnapshot,
  PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import {
  automationSlideDesigns,
  schemaWithAutomationCollectionId,
} from "@/lib/realfarm-automation"
import { verifySlideshowShareToken } from "@/lib/slideshow-share"
import type { SlideshowRecord } from "@/lib/slideshows"
import { defaultXAutomation } from "@/lib/x-automation"
import type { WordCollectionRecord } from "@/lib/word-collections"

const clients: Client[] = []
const servers: ReturnType<typeof createLumenClipMcpServer>[] = []

describe("automation schema patches", () => {
  it("preserves omitted nested fields and replaces only supplied arrays", () => {
    expect(
      mergeAutomationSchemaPatch(
        {
          tone: "direct",
          formatting: [{ id: "hook" }, { id: "body" }],
          schedule: { timezone: "Asia/Singapore", paused: false },
        },
        {
          formatting: [{ id: "body", slideCount: 7 }],
          schedule: { paused: true },
        }
      )
    ).toEqual({
      tone: "direct",
      formatting: [{ id: "body", slideCount: 7 }],
      schedule: { timezone: "Asia/Singapore", paused: true },
    })
  })

  it("reports added, changed, and removed schema paths", () => {
    expect(
      diffAutomationSchemas(
        { tone: "direct", nested: { keep: true, remove: 1 } },
        { tone: "warm", nested: { keep: true, add: 2 } }
      )
    ).toEqual({
      added: [{ path: "nested.add", after: 2 }],
      changed: [{ path: "tone", before: "direct", after: "warm" }],
      removed: [{ path: "nested.remove", before: 1 }],
    })
  })
})

afterEach(async () => {
  vi.unstubAllEnvs()
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
    const pipelineRun = tools.tools.find(
      (tool) => tool.name === "lumenclip_pipeline_run"
    )

    expect(toolNames.sort()).toEqual([...LUMENCLIP_MCP_TOOL_NAMES].sort())
    expect(toolNames).toContain("lumenclip_tiktok_studio_analytics_report")
    expect(toolNames).not.toContain("lumenclip_tiktok_studio_analytics_preview")
    expect(toolNames).not.toContain(
      "lumenclip_tiktok_studio_analytics_batch_preview"
    )
    expect(pipelineRun?.inputSchema).not.toHaveProperty("properties.requestId")
    expect(pipelineRun?.inputSchema).not.toHaveProperty("properties.startAt")
    expect(pipelineRun?.inputSchema).not.toHaveProperty("properties.stopAfter")
  })

  it("runs a named production workflow", async () => {
    const queuePipelineWorkflow = vi.fn(
      async (
        input: Parameters<LumenClipMcpServices["queuePipelineWorkflow"]>[0]
      ) => ({
        workflowId: input.workflowId,
        requestId: "pipeline-test",
        status: "queued" as const,
        jobId: "windmill-job-1",
        flowPath: "f/lumenclip/linkedin_generation",
      })
    )
    const client = await connectClient({ queuePipelineWorkflow })
    const stageInput = {
      niche: "B2B SaaS onboarding",
      persona: "practitioner",
      proof: ["Reduced activation time from 9 days to 3 days"],
      count: 2,
    }

    const catalog = await client.callTool({
      name: "lumenclip_pipeline_catalog",
      arguments: {},
    })
    expect(catalog.structuredContent).toMatchObject({
      workflows: expect.arrayContaining([
        expect.objectContaining({
          id: "slideshow-generation",
          inputs: [
            "automation_id",
            "hook",
            "scheduled_for",
            "generation_source",
          ],
          stages: expect.arrayContaining([
            expect.objectContaining({
              id: "slideshow-generation.select-one-slide-image",
              granularity: "atomic",
              sideEffect: "network",
              operation: "conditional OpenRouter image choice",
              maxExternalCalls: 1,
              workflowStep: false,
            }),
          ]),
        }),
        expect.objectContaining({ id: "ugc-video-generation" }),
        expect.objectContaining({ id: "linkedin-generation" }),
        expect.objectContaining({ id: "x-threads-generation" }),
      ]),
    })

    const workflow = await client.callTool({
      name: "lumenclip_pipeline_run",
      arguments: {
        workflowId: "linkedin-generation",
        input: stageInput,
      },
    })
    expect(workflow.structuredContent).toMatchObject({
      workflowId: "linkedin-generation",
      status: "queued",
      jobId: "windmill-job-1",
      flowPath: "f/lumenclip/linkedin_generation",
    })
    expect(queuePipelineWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "linkedin-generation",
        ownerId: "owner-1",
        workflowInput: stageInput,
      })
    )
  })

  it("inspects and runs read-only automation experiments through injected services", async () => {
    const dimensions = {
      automationId: "automation-1",
      automationDimensions: [
        {
          dimension: "contentDirection",
          name: "body",
          label: "Body content direction",
          currentValue: "One practical recommendation",
          sampleValues: [],
        },
        {
          dimension: "tone",
          label: "Tone",
          currentValue: "Educational & Informative",
          sampleValues: ["Bold & Provocative"],
        },
        {
          dimension: "model",
          label: "Model",
          currentValue: "anthropic/claude-sonnet-5",
          sampleValues: ["anthropic/claude-sonnet-5"],
        },
      ],
      variables: [],
      fixed: [],
      enabledHookCount: 2,
    }
    const experiment = {
      experimentId: "automation-experiment-1",
      automationId: "automation-1",
      seed: 42,
      cells: [],
    }
    const getDimensions = vi.fn(async () => dimensions)
    const runExperiment = vi.fn(async () => experiment)
    const client = await connectClient({
      getAutomationExperimentDimensions:
        getDimensions as LumenClipMcpServices["getAutomationExperimentDimensions"],
      runAutomationExperiment:
        runExperiment as LumenClipMcpServices["runAutomationExperiment"],
    })

    const inspected = await client.callTool({
      name: "lumenclip_template_experiment_dimensions",
      arguments: { templateId: "automation-1" },
    })
    const run = await client.callTool({
      name: "lumenclip_template_experiment_run",
      arguments: {
        templateId: "automation-1",
        vary: [
          {
            dimension: "contentDirection",
            name: "body",
            slideIndex: 2,
            values: ["One concrete tip", "One surprising stat"],
          },
        ],
        allHooks: true,
        repeats: 2,
        seed: 42,
        textOnly: true,
      },
    })

    expect(inspected.structuredContent).toEqual(dimensions)
    expect(run.structuredContent).toEqual(experiment)
    expect(runExperiment).toHaveBeenCalledWith({
      automationId: "automation-1",
      vary: [
        {
          dimension: "contentDirection",
          name: "body",
          slideIndex: 2,
          values: ["One concrete tip", "One surprising stat"],
        },
      ],
      allHooks: true,
      repeats: 2,
      seed: 42,
      textOnly: true,
    })
  })

  it("analyzes a TikTok slideshow through injected read-only services", async () => {
    const transcript = {
      postId: "7662360324313517330",
      url: "https://www.tiktok.com/@lumenclip/photo/7662360324313517330",
      authorUsername: "lumenclip",
      caption: "A concise caption",
      hashtags: [],
      publishedAt: "2026-07-14T12:31:26.000Z",
      slides: [{ index: 1, text: "Stop making this layout mistake" }],
      transcriptionFallback: false,
    }
    const analysis = {
      tone: { value: "Bold & Provocative", preset: "bold" },
      structure: { hookSlides: 1, bodySlides: 0, ctaSlides: 0 },
      wordRange: { min: 5, max: 5 },
      wordRangeByRole: {
        hook: { min: 5, max: 5 },
        body: { min: 5, max: 5 },
        cta: { min: 5, max: 5 },
      },
      language: "English",
      observations: ["Direct second person.", "Short imperative sentence."],
      seedHook: transcript.slides[0].text,
    }
    const client = await connectClient({
      transcribeTikTokSlideshow: vi.fn(async () => transcript),
      analyzeSlideshowTone: vi.fn(async () => analysis),
      slideshowToneToAutomationFields: vi.fn(() => ({
        tone: analysis.tone,
      })),
    })

    const result = await client.callTool({
      name: "lumenclip_slideshow_analyze",
      arguments: { url: transcript.url },
    })

    expect(result.structuredContent).toMatchObject({
      transcript: { postId: transcript.postId },
      analysis: { tone: analysis.tone },
      suggestedFields: { tone: analysis.tone },
    })
  })

  it.each([
    {
      name: "lumenclip_templates_list",
      arguments: {},
      overrides: {
        listAutomationRecords: vi.fn(async () => {
          throw appwriteReadQuotaError()
        }),
        listXAutomations: vi.fn(async () => []),
        listAutomationRuns: vi.fn(async () => []),
        listXAutomationRuns: vi.fn(async () => []),
      },
    },
    {
      name: "lumenclip_collections_list",
      arguments: {},
      overrides: {
        listImageCollections: vi.fn(async () => {
          throw appwriteReadQuotaError()
        }),
        listWordCollections: vi.fn(async () => []),
        listProductCollections: vi.fn(async () => []),
      },
    },
    {
      name: "lumenclip_outputs_list",
      arguments: {},
      overrides: {
        listAutomationRuns: vi.fn(async () => {
          throw appwriteReadQuotaError()
        }),
        listGeneratedVideoExports: vi.fn(async () => []),
        listXAutomationRuns: vi.fn(async () => []),
        listPostFastPostRecords: vi.fn(async () => []),
        listMetricSnapshots: vi.fn(async () => []),
      },
    },
    {
      name: "lumenclip_template_get",
      arguments: { templateId: "automation-just-written" },
      overrides: {
        getAutomationRecord: vi.fn(async () => {
          throw appwriteReadQuotaError()
        }),
      },
    },
  ])(
    "returns a distinct MCP error instead of empty or not-found for $name",
    async ({ name, arguments: args, overrides }) => {
      const client = await connectClient(
        overrides as Partial<LumenClipMcpServices>
      )
      const result = await client.callTool({ name, arguments: args })
      const text = JSON.stringify(result.content)

      expect(result.isError).toBe(true)
      expect(text).toContain("Appwrite quota")
      expect(text).toContain("not an empty result")
      expect(text).not.toContain('"total": 0')
      expect(text).not.toContain("Automation not found")
    }
  )

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

  it("updates template metadata without a schedule mutation surface", async () => {
    const current = automationRecord()
    const patch = vi.fn(
      async (input: {
        name?: string
        hidden?: boolean
        status?: string
        schema?: unknown
      }) => ({
        ...current,
        name: input.name ?? current.name,
        hidden: input.hidden ?? current.hidden,
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
      name: "lumenclip_template_update",
      arguments: {
        templateId: current.id,
        name: "Renamed template",
        hidden: true,
      },
    })

    expect(result.structuredContent).toMatchObject({
      id: current.id,
      name: "Renamed template",
      hidden: true,
    })
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: current.id,
        name: "Renamed template",
        hidden: true,
      })
    )
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
      listWordCollections: vi.fn(async () => []),
      now: () => new Date("2026-07-23T12:00:00.000Z"),
    })

    const read = await client.callTool({
      name: "lumenclip_template_hooks_get",
      arguments: { templateId: current.id },
    })
    expect(read.structuredContent).toMatchObject({
      templateId: current.id,
      total: 3,
      duplicateSlotCount: 1,
      duplicateGroups: [
        expect.objectContaining({
          hookIds: ["cusp-aries", "cusp-pisces"],
        }),
      ],
    })

    const update = await client.callTool({
      name: "lumenclip_template_hooks_update",
      arguments: {
        templateId: current.id,
        expectedUpdatedAt: current.updatedAt,
        deduplicateNearMatches: true,
        hooks: current.schema.hooks,
      },
    })
    expect(update.structuredContent).toMatchObject({
      templateId: current.id,
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
      listWordCollections: vi.fn(async () => []),
      listImageCollections: vi.fn(async () => []),
      now: () => new Date("2026-07-23T12:00:00.000Z"),
    })

    const read = await client.callTool({
      name: "lumenclip_template_get",
      arguments: { templateId: current.id },
    })
    expect(read.structuredContent).toMatchObject({
      template: {
        schema: {
          automationKind: "slideshow",
          formatting: expect.any(Array),
          image_collection_ids: expect.anything(),
        },
      },
    })

    const upserted = await client.callTool({
      name: "lumenclip_template_hook_upsert",
      arguments: {
        templateId: current.id,
        hooks: [
          {
            id: "hook-new",
            text: "A new hook",
            tone: "Shadow voice",
          },
        ],
      },
    })
    expect(upserted.structuredContent).toMatchObject({
      total: 2,
      hookWarnings: [],
      hooks: expect.arrayContaining([
        expect.objectContaining({
          id: "hook-new",
          enabled: true,
          tone: "Shadow voice",
        }),
      ]),
    })

    const malformed = await client.callTool({
      name: "lumenclip_template_hook_upsert",
      arguments: {
        templateId: current.id,
        hooks: [
          {
            id: "hook-malformed",
            text: "[[SLIDE_COUNT]] destined for wealth in [[CURRENT_YEAR]]",
          },
        ],
      },
    })
    expect(malformed.isError).toBe(true)
    expect(malformed.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining(
          "Dynamic slide-count hooks are no longer supported"
        ),
      }),
    ])

    const disabled = await client.callTool({
      name: "lumenclip_template_hook_set_enabled",
      arguments: {
        templateId: current.id,
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
      name: "lumenclip_template_hook_delete",
      arguments: {
        templateId: current.id,
        hookIds: ["hook-new"],
        confirmDelete: true,
      },
    })
    expect(deleted.structuredContent).toMatchObject({
      deletedHookIds: ["hook-new"],
      total: 1,
    })
  })

  it("surfaces dangling media references and a run-blocking next step on read", async () => {
    const current = automationRecord()
    current.schema.image_collection_ids.all_slides =
      "collection-mystical-pictures-deleted"
    const body = current.schema.formatting.find((block) => block.id === "body")!
    body.imageOverrides = [
      { slideIndex: 2, collectionId: "collection-deleted-override" },
    ]
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => []),
      listWordCollections: vi.fn(async () => []),
      listImageCollections: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_template_get",
      arguments: { templateId: current.id },
    })

    expect(result.structuredContent).toMatchObject({
      template: {
        unresolvedCollectionReferences: [
          "collection-mystical-pictures-deleted",
          "collection-deleted-override",
        ],
      },
      nextSteps: [
        expect.objectContaining({
          id: "replace-missing-collection-references",
          severity: "required",
          tool: "lumenclip_collections_list",
          blocks: ["lumenclip_template_run"],
        }),
      ],
    })
  })

  it("surfaces repair actions for collapsed body layers and voice rules in style", async () => {
    const current = automationRecord()
    current.schema.tone = {
      value: "Educational & Informative",
      preset: "educational",
    }
    current.schema.prompt_formatting.style =
      "Use 2-3 word headings followed by one paragraph. Write in a witty, conversational voice with all lowercase text."
    const body = current.schema.formatting.find((block) => block.id === "body")!
    const base = body.textItems[0]!
    body.textItems = [
      {
        ...base,
        id: "body-heading",
        contentDirection:
          "Write the complete personal explanation for this slide.",
        wordLengthMin: 20,
        wordLengthMax: 30,
      },
      {
        ...base,
        id: "body-paragraph",
        contentDirection: "",
        textMode: "static",
        staticText: "",
      },
    ]
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => []),
      listWordCollections: vi.fn(async () => []),
      listImageCollections: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_template_get",
      arguments: { templateId: current.id },
    })

    expect(result.structuredContent).toMatchObject({
      template: {
        configurationWarnings: expect.arrayContaining([
          expect.objectContaining({
            code: "BODY_TEXT_LAYERS_COLLAPSED",
            path: "formatting.body.textItems",
          }),
          expect.objectContaining({
            code: "STYLE_CONTAINS_VOICE_RULES",
            path: "prompt_formatting.style",
          }),
        ]),
      },
      nextSteps: expect.arrayContaining([
        expect.objectContaining({
          id: "restore-body-heading-and-paragraph-layers",
          tool: "lumenclip_template_schema_update",
          args: expect.objectContaining({
            mode: "patch",
            schema: {
              formatting: expect.arrayContaining([
                expect.objectContaining({
                  id: "body",
                  textItems: expect.arrayContaining([
                    expect.objectContaining({
                      id: "body-heading",
                      wordLengthMin: 2,
                      wordLengthMax: 3,
                    }),
                    expect.objectContaining({
                      id: "body-paragraph",
                      textMode: "prompt",
                      contentDirection:
                        "Write the complete personal explanation for this slide.",
                    }),
                  ]),
                }),
              ]),
            },
          }),
        }),
        expect.objectContaining({
          id: "move-voice-rules-out-of-structural-style",
          args: expect.objectContaining({
            schema: {
              prompt_formatting: {
                style: "Use 2-3 word headings followed by one paragraph.",
              },
            },
          }),
        }),
      ]),
    })
  })

  it("deep-clones an automation into a paused copy without run history", async () => {
    const source = automationRecord()
    source.schema.hooks = [
      {
        id: "all-signs",
        text: "[[SLIDE_COUNT]] zodiac signs, ranked",
        enabled: true,
        bodySlideCount: 12,
        tone: "Shadow voice",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    source.schema.image_collection_ids.all_slides = "mystical-pictures"
    let records = [source]
    const upsert = vi.fn(async ({ records: incoming }) => {
      records = [...incoming, ...records]
      return records
    })
    const client = await connectClient({
      listAutomationRecords: vi.fn(async () => records),
      upsertAutomationRecords:
        upsert as unknown as LumenClipMcpServices["upsertAutomationRecords"],
    })

    const first = await client.callTool({
      name: "lumenclip_template_clone",
      arguments: {
        sourceTemplateId: source.id,
        name: "Astrology rankings",
        expectedUpdatedAt: source.updatedAt,
        requestId: "clone-rankings-1",
      },
    })
    const second = await client.callTool({
      name: "lumenclip_template_clone",
      arguments: {
        sourceTemplateId: source.id,
        name: "Astrology rankings",
        expectedUpdatedAt: source.updatedAt,
        requestId: "clone-rankings-1",
      },
    })

    expect(first.structuredContent).toMatchObject({
      created: true,
      sourceTemplateId: source.id,
      template: {
        name: "Astrology rankings",
        status: "paused",
        schema: {
          hooks: [
            expect.objectContaining({
              bodySlideCount: 12,
              tone: "Shadow voice",
            }),
          ],
          image_collection_ids: {
            all_slides: "mystical-pictures",
          },
        },
      },
    })
    expect(second.structuredContent).toMatchObject({
      created: false,
      reused: true,
    })
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it("patches slide designs and their text items without replacing the schema", async () => {
    let current = automationRecord()
    const initialUpdatedAt = current.updatedAt
    current.schema.hooks = [
      {
        id: "hook-existing",
        text: "Existing hook",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    const originalSocialSettings = current.schema.social_post_settings
    const firstDesign = automationSlideDesigns(current.schema)[0]!
    const textItemId = firstDesign.textItems[0]!.id
    current.schema.slide_designs = automationSlideDesigns(current.schema).map(
      (design) =>
        design.id === firstDesign.id
          ? {
              ...design,
              textItems: design.textItems.map((item) =>
                item.id === textItemId
                  ? { ...item, wordLengthMin: 20, wordLengthMax: 25 }
                  : item
              ),
            }
          : design
    )
    const patch = vi.fn(
      async ({
        schema,
        expectedUpdatedAt,
        now,
      }: {
        schema?: typeof current.schema
        expectedUpdatedAt?: string
        now?: Date
      }) => {
        expect(expectedUpdatedAt).toBe(current.updatedAt)
        expect(now?.toISOString()).toBe("2026-07-23T12:00:00.000Z")
        current = {
          ...current,
          schema: schema ?? current.schema,
          updatedAt: new Date(Date.parse(current.updatedAt) + 1).toISOString(),
        }
        return current
      }
    )
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      patchAutomationRecord:
        patch as unknown as LumenClipMcpServices["patchAutomationRecord"],
      now: () => new Date("2026-07-23T12:00:00.000Z"),
    })

    const designResult = await client.callTool({
      name: "lumenclip_template_slide_design_update",
      arguments: {
        templateId: current.id,
        designId: firstDesign.id,
        expectedUpdatedAt: current.updatedAt,
        patch: {
          name: "Opening claim",
          instructions: "Use for a concise first claim.",
          collectionId: "mystical-pictures",
          overlay: false,
        },
      },
    })
    expect(designResult.structuredContent).toMatchObject({
      templateId: current.id,
      slideDesign: {
        id: firstDesign.id,
        name: "Opening claim",
        instructions: "Use for a concise first claim.",
        collectionId: "mystical-pictures",
        overlay: false,
      },
    })

    const textResult = await client.callTool({
      name: "lumenclip_template_slide_text_item_update",
      arguments: {
        templateId: current.id,
        designId: firstDesign.id,
        textItemId,
        expectedUpdatedAt: current.updatedAt,
        patch: { wordLengthMin: 15, wordLengthMax: 18 },
      },
    })
    expect(textResult.structuredContent).toMatchObject({
      templateId: current.id,
      designId: firstDesign.id,
      textItem: {
        id: textItemId,
        wordLengthMin: 15,
        wordLengthMax: 18,
      },
    })
    expect(current.schema.hooks).toHaveLength(1)
    expect(current.schema.social_post_settings).toEqual(originalSocialSettings)
    expect(current.updatedAt).not.toBe(initialUpdatedAt)
    expect(patch).toHaveBeenCalledTimes(2)
  })

  it("exposes derived hook slots separately from explicit overrides", async () => {
    const current = automationRecord()
    current.schema.hooks = [
      {
        id: "hook-bound",
        text: "[[SIGN]] needs [[SLIDE_COUNT]] reminders for [[CURRENT_SIGN_CUSP]]",
        enabled: true,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]
    current.schema.hook_slots = { SIGN: "zodiac", ZODIAC_CUSP: "cusp" }
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => []),
      listWordCollections: vi.fn(async () => [wordCollection()]),
      listImageCollections: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_template_get",
      arguments: { templateId: current.id },
    })

    expect(result.structuredContent).toMatchObject({
      template: {
        schema: {
          hook_slots: { sign: "zodiac" },
          hook_slot_overrides: { SIGN: "zodiac" },
        },
        variableBindings: {
          bindings: expect.arrayContaining([
            expect.objectContaining({
              token: "[[SIGN]]",
              source: "override",
              collectionId: "zodiac",
            }),
            expect.objectContaining({
              token: "[[SLIDE_COUNT]]",
              source: "runtime",
            }),
            expect.objectContaining({
              token: "[[CURRENT_SIGN_CUSP]]",
              source: "runtime",
            }),
          ]),
          missingTokens: [],
          unusedExplicitOverrides: ["ZODIAC_CUSP"],
        },
      },
      nextSteps: [
        expect.objectContaining({
          id: "remove-unused-hook-slot-overrides",
          tool: "lumenclip_template_schema_update",
          args: expect.objectContaining({
            templateId: current.id,
            schema: { hook_slots: { ZODIAC_CUSP: null } },
          }),
        }),
      ],
    })

    const bindings = await client.callTool({
      name: "lumenclip_template_variable_bindings_get",
      arguments: { templateId: current.id },
    })
    expect(bindings.structuredContent).toMatchObject({
      templateId: current.id,
      bindings: [
        expect.objectContaining({ token: "[[SIGN]]", source: "override" }),
        expect.objectContaining({
          token: "[[SLIDE_COUNT]]",
          source: "runtime",
        }),
        expect.objectContaining({
          token: "[[CURRENT_SIGN_CUSP]]",
          source: "runtime",
        }),
      ],
      runtimeVariables: expect.arrayContaining([
        expect.objectContaining({
          token: "[[CURRENT_SIGN]]",
          source: "runtime",
        }),
        expect.objectContaining({
          token: "[[CURRENT_MONTH]]",
          source: "runtime",
        }),
        expect.objectContaining({
          token: "[[NEXT_YEAR]]",
          source: "runtime",
        }),
      ]),
      missingTokens: [],
      unusedExplicitOverrides: ["ZODIAC_CUSP"],
    })
  })

  it("rejects unresolved hook tokens before mutating the pool", async () => {
    const current = automationRecord()
    const patch = vi.fn()
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      patchAutomationRecord:
        patch as unknown as LumenClipMcpServices["patchAutomationRecord"],
      listWordCollections: vi.fn(async () => [wordCollection()]),
    })

    const result = await client.callTool({
      name: "lumenclip_template_hook_upsert",
      arguments: {
        templateId: current.id,
        hooks: [{ id: "bad-sign", text: "Why [[SIGN]] always wins" }],
      },
    })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("did you mean [[ZODIAC]]"),
        }),
      ])
    )
    expect(patch).not.toHaveBeenCalled()
  })

  it("creates automations idempotently and exposes hook performance and run plans", async () => {
    let records: ReturnType<typeof automationRecord>[] = [
      { ...automationRecord(), id: "automation-seed" },
    ]
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
        attribution: {
          attributedPosts: 2,
          unattributedPublishedPosts: 0,
          publishedOutputsWithoutPublication: 0,
          snapshotRecoveredPosts: 0,
        },
        dataWarnings: [],
        dataWarning: undefined,
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
      name: "lumenclip_template_create",
      arguments: {
        name: "Created by MCP",
        kind: "slideshow",
        status: "paused",
        requestId: "create-1",
      },
    })
    const second = await client.callTool({
      name: "lumenclip_template_create",
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
      nextSteps: [
        expect.objectContaining({
          severity: "recommended",
          tool: "lumenclip_template_clone",
          args: expect.objectContaining({
            sourceTemplateId: "automation-seed",
          }),
        }),
      ],
    })
    expect(second.structuredContent).toMatchObject({
      created: false,
      reused: true,
    })
    expect(upsert).toHaveBeenCalledTimes(1)

    const performance = await client.callTool({
      name: "lumenclip_hook_performance",
      arguments: { templateId: "automation-1", days: 30 },
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
      type: "run-template",
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
      linkState: "unlinked" as const,
      statsSources: [],
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
      listImageCollections: vi.fn(async () => []),
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
      linkState: "postfast_published" as const,
      statsSources: ["tiktok_studio" as const],
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
    const awaitingPublication = {
      ...publication,
      id: "publication-output-2",
      integrationId: "tiktok-2",
    }
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      listGeneratedVideoExports: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
      listPostFastPostRecords: vi.fn(async () => [
        publication,
        awaitingPublication,
      ]),
      listMetricSnapshots: vi.fn(async () => [snapshot]),
      listTikTokStudioAnalyticsImports: vi.fn(async () => [
        {
          id: "studio-import-failed",
          status: "failed" as const,
          targetPostId: awaitingPublication.id,
          externalPostId: "7355555555555555555",
          integrationId: awaitingPublication.integrationId,
          studioUrl:
            "https://www.tiktok.com/tiktokstudio/analytics/7355555555555555555/overview",
          createdAt: "2026-07-21T00:00:00.000Z",
          expiresAt: "2026-07-21T01:00:00.000Z",
          updatedAt: "2026-07-21T00:05:00.000Z",
          capturedSections: [],
          failure: {
            section: "overview" as const,
            reason: "Overview did not load after retry",
            failedAt: "2026-07-21T00:05:00.000Z",
          },
        },
      ]),
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
            awaitingCapture: 1,
            metrics: expect.objectContaining({
              views: 1200,
              interactions: 120,
            }),
            newFollowers: 29,
            reportTools: [
              "lumenclip_analytics_report",
              "lumenclip_tiktok_studio_analytics_report",
            ],
            captureAttempts: expect.arrayContaining([
              expect.objectContaining({
                publicationId: awaitingPublication.id,
                status: "failed",
                reason: "Overview did not load after retry",
                section: "overview",
              }),
            ]),
          }),
        }),
      ],
      nextSteps: [
        expect.objectContaining({
          severity: "recommended",
          tool: "lumenclip_tiktok_studio_analytics_batch_start",
          args: expect.objectContaining({
            integrationIds: ["tiktok-2"],
          }),
        }),
      ],
    })
  })

  it("distinguishes manually published outputs with no publication record", async () => {
    const run = {
      ...generatedRun("automation-1"),
      manuallyPublishedAt: "2026-07-23T00:00:00.000Z",
    }
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      listGeneratedVideoExports: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
      listPostFastPostRecords: vi.fn(async () => []),
      listMetricSnapshots: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_outputs_list",
      arguments: { limit: 20 },
    })

    expect(result.structuredContent).toMatchObject({
      items: [
        expect.objectContaining({
          id: run.slideshowId,
          publicationState: "published_unlinked",
          analytics: expect.objectContaining({
            available: false,
            publicationIds: [],
          }),
        }),
      ],
    })
  })

  it("inspects rendered slideshow content and returns deterministic QA", async () => {
    vi.stubEnv("BASE_URL", "https://studio.example.com")
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "test-secret")
    const automation = automationRecord()
    const run = generatedRun(automation.id)
    run.plan.hook = "7 things Cancer hides"
    run.plan.hookTemplate = "7 things [[ZODIAC]] hides"
    run.plan.hookId = "hook-7"
    run.plan.hookSubstitutions = { ZODIAC: "Cancer" }
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      listGeneratedVideoExports: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
      listPostFastPostRecords: vi.fn(async () => []),
      listMetricSnapshots: vi.fn(async () => []),
      getAutomationRecord: vi.fn(async () => automation),
      listSlideshowRecords: vi.fn(async () => []),
    })

    const inspected = await client.callTool({
      name: "lumenclip_output_get",
      arguments: { outputId: run.slideshowId },
    })
    expect(inspected.structuredContent).toMatchObject({
      id: run.slideshowId,
      resolvedHookText: run.plan.hook,
      hookId: "hook-7",
      tokenValues: { ZODIAC: "Cancer" },
      previewUrl: expect.stringMatching(
        /^https:\/\/studio\.example\.com\/share\/slideshows\//
      ),
      workflowUrl: expect.stringMatching(
        /^https:\/\/studio\.example\.com\/share\/workflows\//
      ),
      downloadUrl: expect.stringMatching(
        /^https:\/\/studio\.example\.com\/api\/public\/slideshows\/.+\/download\?token=/
      ),
      actualSlideCount: 1,
      slides: [
        expect.objectContaining({
          index: 1,
          heading: "Generated hook",
        }),
      ],
      qa: {
        valid: false,
        actualSlideCount: 1,
      },
      nextSteps: expect.arrayContaining([
        expect.objectContaining({
          tool: "lumenclip_output_publish",
          blocks: ["lumenclip_analytics_report"],
        }),
      ]),
    })
    expect(inspected.structuredContent).not.toHaveProperty("shareUrl")

    const validated = await client.callTool({
      name: "lumenclip_output_validate",
      arguments: { outputId: run.slideshowId },
    })
    expect(validated.structuredContent).toMatchObject({
      outputId: run.slideshowId,
      qa: { valid: false },
    })
  })

  it("exposes a complete workflow trace and every addressed stage", async () => {
    vi.stubEnv("BASE_URL", "https://studio.example.com")
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "test-secret")
    const automation = automationRecord()
    const run = generatedRun(automation.id)
    run.plan.debug = {
      textModelPrompt: {
        messages: [{ role: "user", content: "Generate the slideshow" }],
      } as never,
    }
    const slideshow = generatedSlideshow(run)
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      getAutomationRecord: vi.fn(async () => automation),
      listSlideshowRecords: vi.fn(async () => [slideshow]),
    })

    const trace = await client.callTool({
      name: "lumenclip_workflow_trace_get",
      arguments: { outputId: run.slideshowId },
    })
    const traceContent = trace.structuredContent as {
      workflowId: string
      runId: string
      outputId: string
      workflowUrl: string
      stages: Array<{
        id: string
        input: unknown
        output: unknown
      }>
    }
    expect(traceContent.workflowId).toBe("slideshow-generation")
    expect(traceContent.runId).toBe(run.id)
    expect(traceContent.outputId).toBe(run.slideshowId)
    expect(traceContent.workflowUrl).toMatch(
      /^https:\/\/studio\.example\.com\/share\/workflows\//
    )
    expect(traceContent.stages).toHaveLength(11)
    expect(traceContent.stages.map((stage) => stage.id)).not.toEqual(
      expect.arrayContaining([
        "slideshow-generation.research-hook",
        "slideshow-generation.retry-text-similarity",
        "slideshow-generation.derive-visual-concepts",
        "slideshow-generation.translate-plan",
        "slideshow-generation.render-store-mp4",
      ])
    )
    expect(
      traceContent.stages.find(
        (candidate) => candidate.id === "slideshow-generation.build-text-prompt"
      )
    ).toMatchObject({
      id: "slideshow-generation.build-text-prompt",
      input: expect.any(Object),
      output: {
        promptPayload: {
          messages: [{ role: "user", content: "Generate the slideshow" }],
        },
      },
    })

    const stage = await client.callTool({
      name: "lumenclip_workflow_stage_get",
      arguments: {
        outputId: run.slideshowId,
        stageId: "slideshow-generation.generate-slide-text",
      },
    })
    expect(stage.structuredContent).toMatchObject({
      runId: run.id,
      outputId: run.slideshowId,
      stage: {
        id: "slideshow-generation.generate-slide-text",
        input: expect.any(Object),
        output: expect.objectContaining({ title: run.plan.title }),
      },
    })
  })

  it("edits addressed slide text with an optimistic lock and returns fresh QA", async () => {
    const automation = automationRecord()
    let run = generatedRun(automation.id)
    run.plan.slides[0].textItems = [
      {
        id: "hook-heading",
        text: "facts about capricorn",
        fontSize: "12px",
        textSize: { width: 80, height: 18 },
        textStyle: "outline",
        textAlign: "center",
        textAnchor: "padded",
        textPosition: { x: 50, y: 45 },
      },
    ]
    run.plan.slides[0].text = "facts about capricorn"
    run.plan.hook = "facts about capricorn"
    let slideshow = generatedSlideshow(run, "facts about capricorn")
    const updateSlide = vi.fn(
      async ({
        edits,
      }: {
        edits: Array<{ textItemId: string; text: string }>
      }) => {
        slideshow = {
          ...slideshow,
          updated_at: "2026-07-28T12:00:00.000Z",
          images: slideshow.images.map((slide) => ({
            ...slide,
            textItems: slide.textItems.map((item) => ({
              ...item,
              text:
                edits.find(
                  (edit: { textItemId: string }) => edit.textItemId === item.id
                )?.text ?? item.text,
            })),
          })),
        }
        return slideshow
      }
    )
    const updateRun = vi.fn(async () => {
      const text = slideshow.images[0].textItems[0].text
      run = {
        ...run,
        updatedAt: "2026-07-28T12:00:01.000Z",
        plan: {
          ...run.plan,
          hook: text,
          slides: run.plan.slides.map((slide) => ({
            ...slide,
            text,
            textItems: slideshow.images[0].textItems,
          })),
        },
      }
      return run
    })
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => automation),
      listAutomationRecords: vi.fn(async () => [automation]),
      listAutomationRuns: vi.fn(async () => [run]),
      listGeneratedVideoExports: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
      listPostFastPostRecords: vi.fn(async () => []),
      listMetricSnapshots: vi.fn(async () => []),
      listSlideshowRecords: vi.fn(async () => [slideshow]),
      updateSlideshowSlideText:
        updateSlide as LumenClipMcpServices["updateSlideshowSlideText"],
      updateAutomationRunSlideText:
        updateRun as LumenClipMcpServices["updateAutomationRunSlideText"],
    })

    const edited = await client.callTool({
      name: "lumenclip_output_slide_text_update",
      arguments: {
        outputId: run.slideshowId,
        slideIndex: 1,
        edits: [
          {
            textItemId: "hook-heading",
            text: "capricorn behavior nobody warns you about",
          },
        ],
        expectedUpdatedAt: run.updatedAt,
      },
    })

    expect(updateSlide).toHaveBeenCalledWith({
      id: run.slideshowId,
      slideIndex: 0,
      edits: [
        {
          textItemId: "hook-heading",
          text: "capricorn behavior nobody warns you about",
        },
      ],
    })
    expect(edited.structuredContent).toMatchObject({
      output: {
        updatedAt: "2026-07-28T12:00:01.000Z",
        resolvedHookText: "capricorn behavior nobody warns you about",
        slides: [
          expect.objectContaining({
            index: 1,
            heading: "capricorn behavior nobody warns you about",
          }),
        ],
      },
      editedSlide: expect.objectContaining({
        heading: "capricorn behavior nobody warns you about",
      }),
    })

    const stale = await client.callTool({
      name: "lumenclip_output_slide_text_update",
      arguments: {
        outputId: run.slideshowId,
        slideIndex: 1,
        edits: [{ textItemId: "hook-heading", text: "another hook" }],
        expectedUpdatedAt: "2026-07-18T01:01:00.000Z",
      },
    })
    expect(stale.isError).toBe(true)
    expect(updateSlide).toHaveBeenCalledTimes(1)
  })

  it("absolutises per-slide and delivery URLs in slideshow_generate against BASE_URL", async () => {
    vi.stubEnv("BASE_URL", "https://studio.example.com/")
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "test-secret")
    const current = automationRecord()
    const run = relativeRun(current.id)
    const runWorkflow = vi.fn(async () => completedWorkflow(run, "request-1"))
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => [run]),
      runPipelineWorkflow: runWorkflow,
    })

    const result = await client.callTool({
      name: "lumenclip_slideshow_generate",
      arguments: {
        templateId: current.id,
        requestId: "request-1",
        hook: "My exact slideshow hook",
      },
    })

    expect(runWorkflow).toHaveBeenCalledWith({
      workflowId: "slideshow-generation",
      ownerId: "owner-1",
      requestId: "request-1",
      workflowInput: {
        automationId: current.id,
        generationSource: "manual",
        hook: "My exact slideshow hook",
      },
    })

    const summary = (
      result.structuredContent as { runs: Array<Record<string, unknown>> }
    ).runs[0]
    expect(summary.outputImages).toEqual([
      "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
    ])
    expect(summary.slides).toEqual([
      {
        index: 1,
        role: "hook",
        text: run.plan.slides[0].text,
        renderedImageUrl:
          "https://studio.example.com/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
        sourceImageUrl:
          "https://studio.example.com/api/local-assets/slideshows/sources/img-1.png",
      },
    ])
    const previewUrl = summary.previewUrl as string
    expect(summary.downloadUrl).toMatch(
      /^https:\/\/studio\.example\.com\/api\/public\/slideshows\/slideshow-1\/download\?token=/
    )
    expect(previewUrl).toMatch(
      /^https:\/\/studio\.example\.com\/share\/slideshows\/slideshow-1\?token=/
    )
    expect(summary).not.toHaveProperty("shareUrl")
    const token = new URL(previewUrl).searchParams.get("token") ?? ""
    expect(verifySlideshowShareToken(token, "slideshow-1")).toMatchObject({
      ownerId: "owner-1",
      outputId: "slideshow-1",
    })
    expect(verifySlideshowShareToken(token, "other-slideshow")).toBeNull()
  })

  it("falls back to relative slide URLs in slideshow_generate when BASE_URL is unset", async () => {
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "test-secret")
    const current = automationRecord()
    const run = relativeRun(current.id)
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => [run]),
      runPipelineWorkflow: vi.fn(async () =>
        completedWorkflow(run, "request-1")
      ),
    })

    const result = await client.callTool({
      name: "lumenclip_slideshow_generate",
      arguments: { templateId: current.id, requestId: "request-1" },
    })

    const summary = (
      result.structuredContent as { runs: Array<Record<string, unknown>> }
    ).runs[0]
    expect(summary.slides).toEqual([
      {
        index: 1,
        role: "hook",
        text: run.plan.slides[0].text,
        renderedImageUrl:
          "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
        sourceImageUrl: "/api/local-assets/slideshows/sources/img-1.png",
      },
    ])
    const previewUrl = summary.previewUrl as string
    expect(summary.downloadUrl).toMatch(
      /^\/api\/public\/slideshows\/slideshow-1\/download\?token=/
    )
    expect(previewUrl.startsWith("/share/slideshows/slideshow-1?token=")).toBe(
      true
    )
    expect(summary).not.toHaveProperty("shareUrl")
    const token = previewUrl.split("token=")[1] ?? ""
    expect(verifySlideshowShareToken(token, "slideshow-1")).toMatchObject({
      ownerId: "owner-1",
      outputId: "slideshow-1",
    })
  })

  it("omits delivery URLs when sharing is not configured", async () => {
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "")
    vi.stubEnv("APPWRITE_API_KEY", "")
    const current = automationRecord()
    const run = relativeRun(current.id)
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => [run]),
      runPipelineWorkflow: vi.fn(async () =>
        completedWorkflow(run, "request-1")
      ),
    })

    const result = await client.callTool({
      name: "lumenclip_slideshow_generate",
      arguments: { templateId: current.id, requestId: "request-1" },
    })

    const summary = (
      result.structuredContent as { runs: Array<Record<string, unknown>> }
    ).runs[0]
    expect(summary.previewUrl).toBeUndefined()
    expect(summary.downloadUrl).toBeUndefined()
    expect(summary).not.toHaveProperty("shareUrl")
  })

  it("normalizes automation collection names to stable IDs and reports unresolved references", async () => {
    const current = automationRecord()
    const standard = {
      ...current,
      schema: schemaWithAutomationCollectionId(
        current.schema,
        "content",
        "Mystical Pictures"
      ),
    }
    const collection: StoredImageCollection = {
      name: "Mystical Pictures",
      created_at: "2026-07-14T03:55:21.813Z",
      images: [],
    }
    const client = await connectClient({
      listAutomationRecords: vi.fn(async () => [standard]),
      listImageCollections: vi.fn(async () => [collection]),
      listXAutomations: vi.fn(async () => []),
      listAutomationRuns: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_templates_list",
      arguments: { limit: 20 },
    })

    expect(result.structuredContent).toMatchObject({
      items: [
        {
          id: standard.id,
          collectionIds: ["mystical-pictures"],
          unresolvedCollectionReferences: [],
        },
      ],
    })
  })

  it("lists starter definitions through the same hidden template contract", async () => {
    const starter = {
      ...automationRecord(),
      id: "starter-astrology",
      name: "Astrology starter",
      hidden: true,
      status: "paused" as const,
    }
    const upsert = vi.fn(
      async (input: { records: (typeof starter)[] }) => input.records
    )
    const client = await connectClient({
      listAutomationRecords: vi.fn(async () => []),
      listAutomationTemplateRecords: vi.fn(async () => [starter]),
      upsertAutomationRecords:
        upsert as unknown as LumenClipMcpServices["upsertAutomationRecords"],
      listImageCollections: vi.fn(async () => []),
      listXAutomations: vi.fn(async () => []),
      listAutomationRuns: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_templates_list",
      arguments: { visibility: "hidden" },
    })

    expect(result.structuredContent).toMatchObject({
      total: 1,
      items: [
        {
          id: "starter-astrology",
          name: "Astrology starter",
          hidden: true,
          kind: "slideshow",
        },
      ],
    })
    expect(upsert).toHaveBeenCalledWith({ records: [starter] })
  })

  it("runs a slideshow through the general retry-safe automation tool", async () => {
    const current = automationRecord()
    const run = generatedRun(current.id)
    run.plan.slides[0].text = Array.from({ length: 20 }, () => "word").join(" ")
    const runWorkflow = vi.fn(async () =>
      completedWorkflow(run, "general-run-1")
    )
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => [run]),
      runPipelineWorkflow: runWorkflow,
    })

    const result = await client.callTool({
      name: "lumenclip_template_run",
      arguments: {
        templateId: current.id,
        requestId: "general-run-1",
        hook: "My exact MCP hook",
      },
    })

    expect(runWorkflow).toHaveBeenCalledWith({
      workflowId: "slideshow-generation",
      ownerId: "owner-1",
      requestId: "general-run-1",
      workflowInput: {
        automationId: current.id,
        generationSource: "manual",
        hook: "My exact MCP hook",
      },
    })
    expect(result.structuredContent).toMatchObject({
      operation: { id: run.id, status: "succeeded" },
      outputs: [
        {
          id: run.slideshowId,
          publicationState: "not_published",
          qaValid: false,
          qaFindings: [
            expect.objectContaining({ code: "WORD_LENGTH_VIOLATION" }),
          ],
        },
      ],
      nextSteps: [
        expect.objectContaining({
          severity: "required",
          tool: "lumenclip_template_run",
          blocks: ["lumenclip_output_publish"],
        }),
      ],
    })
  })

  it("generates 2-10 hook variants with the text of every slide", async () => {
    const current = automationRecord()
    const variants = [
      {
        index: 1,
        hook: "First random hook",
        hookId: "hook-1",
        title: "First title",
        caption: "First caption",
        hashtags: "#first",
        slides: [
          { index: 1, role: "hook" as const, text: "First random hook" },
          { index: 2, role: "content" as const, text: "First body" },
        ],
      },
      {
        index: 2,
        hook: "Second random hook",
        hookId: "hook-2",
        title: "Second title",
        caption: "Second caption",
        hashtags: "#second",
        slides: [
          { index: 1, role: "hook" as const, text: "Second random hook" },
          { index: 2, role: "content" as const, text: "Second body" },
        ],
      },
    ]
    const generateVariants = vi.fn(async () => variants)
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      previewAutomationHookVariants:
        generateVariants as LumenClipMcpServices["previewAutomationHookVariants"],
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    })

    const result = await client.callTool({
      name: "lumenclip_hook_variants_generate",
      arguments: { templateId: current.id, count: 2 },
    })

    expect(generateVariants).toHaveBeenCalledWith(current.schema, {
      automationId: current.id,
      automationTitle: current.name,
      count: 2,
      now: new Date("2026-08-01T12:00:00.000Z"),
    })
    expect(result.structuredContent).toMatchObject({
      templateId: current.id,
      count: 2,
      variants,
      nextAction: { tool: "lumenclip_hook_variant_select" },
    })

    const invalid = await client.callTool({
      name: "lumenclip_hook_variants_generate",
      arguments: { templateId: current.id, count: 1 },
    })
    expect(invalid.isError).toBe(true)

    const tooMany = await client.callTool({
      name: "lumenclip_hook_variants_generate",
      arguments: { templateId: current.id, count: 11 },
    })
    expect(tooMany.isError).toBe(true)
    expect(generateVariants).toHaveBeenCalledTimes(1)
  })

  it("persists the selected hook variant and returns its slide text", async () => {
    const current = automationRecord()
    const run = generatedRun(current.id)
    run.plan.hook = "Selected exact hook"
    run.plan.slides[0].text = "Selected exact hook"
    const runWorkflow = vi.fn(async () =>
      completedWorkflow(run, "selected-hook-1")
    )
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => [run]),
      runPipelineWorkflow: runWorkflow,
    })

    const result = await client.callTool({
      name: "lumenclip_hook_variant_select",
      arguments: {
        templateId: current.id,
        selectedHook: "Selected exact hook",
        requestId: "selected-hook-1",
      },
    })

    expect(runWorkflow).toHaveBeenCalledWith({
      workflowId: "slideshow-generation",
      ownerId: "owner-1",
      requestId: "selected-hook-1",
      workflowInput: {
        automationId: current.id,
        generationSource: "manual",
        hook: "Selected exact hook",
      },
    })
    expect(result.structuredContent).toMatchObject({
      outputs: [
        {
          hook: "Selected exact hook",
          slides: [
            {
              index: 1,
              role: "hook",
              text: "Selected exact hook",
            },
          ],
        },
      ],
    })
  })

  it("polls a persisted slideshow run before the UGC fallback resolver", async () => {
    const current = automationRecord()
    const run = generatedRun(current.id)
    const client = await connectClient({
      getJob: vi.fn(async () => null),
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => [run]),
      getUgcRunStatus: vi.fn(async (): Promise<UgcRunStatus> => ({
        id: run.id,
        automationId: current.id,
        scheduledFor: run.scheduledFor,
        status: "failed",
        error: "Generation job was lost.",
        checkpoints: {},
        stages: [],
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      })),
    })

    const result = await client.callTool({
      name: "lumenclip_operation_get",
      arguments: { operationId: run.id },
    })

    expect(result.structuredContent).toMatchObject({
      operation: {
        id: run.id,
        kind: "automation.run",
        status: "succeeded",
      },
      outputs: [{ id: run.slideshowId }],
      errors: [],
    })
  })

  it("discovers UGC automations as manually runnable", async () => {
    const current = ugcAutomationRecord()
    const client = await connectClient({
      listAutomationRecords: vi.fn(async () => [current]),
      listAutomationRuns: vi.fn(async () => []),
      listXAutomations: vi.fn(async () => []),
      listXAutomationRuns: vi.fn(async () => []),
      listImageCollections: vi.fn(async () => []),
    })

    const result = await client.callTool({
      name: "lumenclip_templates_list",
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

  it("runs draft-only UGC generation through Windmill", async () => {
    const current = ugcAutomationRecord()
    const video = {
      id: "ugc-output-1",
      type: "ugc_ad" as const,
      status: "ready" as const,
      createdAt: "2026-07-22T12:00:00.000Z",
      updatedAt: "2026-07-22T12:01:00.000Z",
      title: "UGC draft",
      description: "",
      hashtags: [],
      sourceAutomationId: current.id,
      sourceConfig: {
        templateId: current.id,
        requestId: "ugc-request-1",
      },
    }
    const runWorkflow = vi.fn(async () => ({
      workflowId: "ugc-video-generation" as const,
      requestId: "ugc-request-1",
      status: "succeeded" as const,
      jobId: "windmill-ugc-request-1",
      flowPath: "f/lumenclip/ugc_video_generation",
      result: {},
    }))
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      runPipelineWorkflow: runWorkflow,
      listGeneratedVideoExports: vi.fn(async () => [video]),
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    })

    const result = await client.callTool({
      name: "lumenclip_template_run",
      arguments: {
        templateId: current.id,
        requestId: "ugc-request-1",
      },
    })

    expect(runWorkflow).toHaveBeenCalledWith({
      workflowId: "ugc-video-generation",
      ownerId: "owner-1",
      requestId: "ugc-request-1",
      workflowInput: { templateId: current.id },
    })
    expect(result.structuredContent).toMatchObject({
      operation: {
        id: video.id,
        kind: "video.generate",
        status: "succeeded",
      },
      outputs: [{ id: video.id, outputType: "video" }],
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
      arguments: {
        templateId: current.id,
        actorSource: "collection",
        actorCollectionId: "actor-portraits",
        lipSyncTier: "premium",
      },
    })

    expect(enqueue).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      templateId: current.id,
      estimate: { currency: "USD", tier: "premium" },
      assumptions: { actorSource: "collection", lipSyncTier: "premium" },
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
        variableName: "zodiac",
        token: "[[ZODIAC]]",
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

  it("routes a manual link through the shared writer and advances the same stamp intent", async () => {
    const run = generatedRun("automation-1")
    const publication = {
      id: "publication-manual-1",
      sourceType: "slideshow" as const,
      sourceId: run.slideshowId!,
      integrationId: "manual-tiktok",
      provider: "tiktok",
      status: "published" as const,
      publishedAt: "2026-07-30T12:00:00.000Z",
      releaseUrl: "https://www.tiktok.com/@creator/photo/7662360324313517330",
      externalPostId: "7662360324313517330",
      linkState: "manually_linked" as const,
      statsSources: [],
      content: "Generated caption",
      media: [],
      createdAt: "2026-07-30T12:00:00.000Z",
      updatedAt: "2026-07-30T12:00:00.000Z",
    }
    const link = vi.fn(async () => publication)
    const stamp = vi.fn(async () => run)
    const client = await connectClient({
      listAutomationRuns: vi.fn(async () => [run]),
      linkPublishedOutput: link,
      markAutomationRunPublished: stamp,
    })

    const result = await client.callTool({
      name: "lumenclip_output_mark_published",
      arguments: {
        outputId: run.slideshowId,
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
        sourceId: run.slideshowId,
        integrationId: "manual-tiktok",
      })
    )
    expect(stamp).toHaveBeenCalledWith({
      slideshowId: run.slideshowId,
      runId: run.id,
      publishedAt: new Date(publication.publishedAt),
      publication,
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

  it("blocks a new publication on QA errors unless a reasoned override is supplied", async () => {
    const current = automationRecord()
    const run = generatedRun(current.id)
    run.plan.slides[0].text = Array.from({ length: 20 }, () => "word").join(" ")
    const publication = {
      id: "publication-qa-override",
      sourceType: "slideshow" as const,
      sourceId: run.slideshowId!,
      integrationId: "account-1",
      provider: "tiktok",
      linkState: "postfast_published" as const,
      statsSources: [],
      status: "published" as const,
      content: "Generated caption",
      media: [],
      createdAt: "2026-07-18T01:00:00.000Z",
      updatedAt: "2026-07-18T01:01:00.000Z",
    }
    const publish = vi.fn(async () => ({ ok: true, record: publication }))
    const client = await connectClient({
      getAutomationRecord: vi.fn(async () => current),
      listAutomationRuns: vi.fn(async () => [run]),
      listAccounts: vi.fn(async () => [
        {
          integration_id: "account-1",
          provider: "tiktok" as const,
          name: "TikTok account",
        },
      ]),
      listPostFastPostRecords: vi.fn(async () => []),
      uploadPostFastMediaSources: vi.fn(async () => []),
      publishPost: publish,
    })

    const blocked = await client.callTool({
      name: "lumenclip_output_publish",
      arguments: {
        outputId: run.slideshowId,
        targets: [{ accountId: "account-1", mode: "now" }],
        requestId: "publish-qa-blocked",
        confirmPublish: true,
      },
    })
    expect(blocked.isError).toBe(true)
    expect(publish).not.toHaveBeenCalled()

    const accepted = await client.callTool({
      name: "lumenclip_output_publish",
      arguments: {
        outputId: run.slideshowId,
        targets: [{ accountId: "account-1", mode: "now" }],
        requestId: "publish-qa-accepted",
        overrideQaFailure: true,
        qaOverrideReason: "Reviewed the intentional long-form slide.",
        confirmPublish: true,
      },
    })
    expect(accepted.isError).not.toBe(true)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(accepted.structuredContent).toMatchObject({
      published: 1,
      warnings: [expect.stringContaining("QA override accepted")],
    })
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
      linkState: "postfast_published" as const,
      statsSources: [],
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
      linkState: "postfast_published" as const,
      statsSources: [],
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
          linkState: "postfast_published",
          statsSources: ["tiktok_studio"],
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

  it("counts every publication while separating posts awaiting metrics", () => {
    const captured = metricSnapshot(
      "snapshot-captured",
      "2026-07-18T00:00:00.000Z",
      250
    )
    const publications = [
      {
        id: captured.postId,
        externalPostId: "7000000000000000001",
        sourceType: "slideshow" as const,
        sourceId: "slideshow-1",
        integrationId: "integration-1",
        provider: "tiktok",
        linkState: "manually_linked" as const,
        statsSources: ["tiktok_studio" as const],
        status: "published" as const,
        publishedAt: "2026-07-17T00:00:00.000Z",
        content: "Cancer secrets",
        media: [],
        createdAt: "2026-07-17T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
      ...[2, 3, 4].map((index) => ({
        id: `publication-${index}`,
        externalPostId: `700000000000000000${index}`,
        sourceType: "slideshow" as const,
        sourceId: `slideshow-${index}`,
        integrationId: "integration-1",
        provider: "tiktok",
        linkState: "manually_linked" as const,
        statsSources: [],
        status: "published" as const,
        publishedAt: `2026-07-${16 - index}T00:00:00.000Z`,
        content: `Post ${index}`,
        media: [],
        createdAt: `2026-07-${16 - index}T00:00:00.000Z`,
        updatedAt: `2026-07-${16 - index}T00:00:00.000Z`,
      })),
    ]

    const report = buildAnalyticsReport({
      snapshots: [captured],
      followerSnapshots: [],
      publications,
      captureImports: [
        {
          id: "capture-publication-2",
          status: "failed",
          targetPostId: "publication-2",
          externalPostId: "7000000000000000002",
          integrationId: "integration-1",
          studioUrl:
            "https://www.tiktok.com/tiktokstudio/analytics/7000000000000000002/overview",
          createdAt: "2026-07-15T00:00:00.000Z",
          expiresAt: "2026-07-15T01:00:00.000Z",
          updatedAt: "2026-07-15T00:05:00.000Z",
          capturedSections: [],
          failure: {
            section: "overview",
            reason: "Studio returned an empty overview",
            failedAt: "2026-07-15T00:05:00.000Z",
          },
        },
      ],
      now: new Date("2026-07-18T12:00:00.000Z"),
      days: 30,
      postLimit: 10,
    })

    expect(report).toMatchObject({
      postCount: 4,
      withMetrics: 1,
      awaitingCapture: 3,
      accounts: [
        {
          postCount: 4,
          withMetrics: 1,
          awaitingCapture: 3,
        },
      ],
    })
    expect(report.posts).toHaveLength(4)
    expect(report.posts.filter((post) => post.hasMetrics)).toHaveLength(1)
    expect(
      report.posts.filter((post) => post.metricsStatus === "awaiting_capture")
    ).toHaveLength(3)
    expect(
      report.posts.find((post) => post.postId === "publication-2")?.capture
    ).toMatchObject({
      status: "failed",
      reason: "Studio returned an empty overview",
      section: "overview",
    })
    expect(
      report.posts.find((post) => post.postId === "publication-3")?.capture
    ).toMatchObject({
      status: "not_started",
      reason: "No TikTok Studio capture attempt has been recorded.",
    })
  })
})

async function connectClient(overrides: Partial<LumenClipMcpServices> = {}) {
  const server = createLumenClipMcpServer("owner-1", {
    getAutomationRecord: vi.fn(async () => null),
    listAutomationRecords: vi.fn(async () => []),
    listAutomationTemplateRecords: vi.fn(async () => []),
    listAutomationRuns: vi.fn(async () => []),
    listTikTokStudioAnalyticsImports: vi.fn(async () => []),
    ...overrides,
  })
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
    type: "run-ugc-template",
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

function completedWorkflow(
  run: AutomationRunRecord,
  requestId = run.requestId || "request-1",
  workflowId:
    "slideshow-generation" | "ugc-video-generation" = "slideshow-generation"
) {
  return {
    workflowId,
    requestId,
    status: "succeeded" as const,
    jobId: `windmill-${requestId}`,
    flowPath:
      workflowId === "ugc-video-generation"
        ? "f/lumenclip/ugc_video_generation"
        : "f/lumenclip/slideshow_generation",
    result: { run: { id: run.id } },
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

function generatedSlideshow(
  run: AutomationRunRecord,
  text = "Generated hook"
): SlideshowRecord {
  return {
    id: run.slideshowId!,
    runId: run.id,
    automationId: run.automationId,
    title: run.plan.title,
    caption: run.plan.caption,
    hashtags: run.plan.hashtags,
    prompt: "",
    image_collection: "collection-1",
    slideshow_type: "automation",
    created_at: run.createdAt,
    updated_at: run.updatedAt,
    status: "exported",
    output_dir: `/api/local-assets/slideshows/outputs/${run.slideshowId}`,
    output_images: [
      `/api/local-assets/slideshows/outputs/${run.slideshowId}/slide-001.png`,
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
        image_url: `/api/local-assets/slideshows/outputs/${run.slideshowId}/slide-001.png`,
        source_image_url: "https://example.com/image.jpg",
        textItems: [
          {
            id: "hook-heading",
            text,
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

function relativeRun(automationId: string): AutomationRunRecord {
  const run = generatedRun(automationId)
  return {
    ...run,
    requestId: "general-run-1",
    plan: {
      ...run.plan,
      slides: [
        {
          id: "slide-1",
          role: "hook",
          imageUrl: "/api/local-assets/slideshows/sources/img-1.png",
          imageCaption: "Image",
          text: "Generated hook",
          textPlacement: "center",
        },
      ],
    },
    outputImages: [
      "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
    ],
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

function appwriteReadQuotaError() {
  return {
    code: 402,
    type: "limit_databases_reads_exceeded",
    message: "Resource limit for your project has exceeded.",
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
