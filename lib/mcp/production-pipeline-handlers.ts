import { clean, isRecord } from "@/lib/guards"
import { automationGenerationBlockers } from "@/lib/automation-readiness"
import {
  automationFormatSection,
  automationHookItems,
  automationPublishType,
  automationTotalSlideCount,
  updateAutomationFormatSection,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import {
  legacyStoredCollectionId,
  storedCollectionId,
} from "@/lib/realfarm-collections"
import {
  selectContentSlideCount,
  automationSlideshowSettings,
  upsertRecoveredAutomationRun,
  type AutomationRunPlan,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import { automationSchemaToTempSlideTestingAutomation } from "@/lib/temp-slide-testing"
import {
  generateSlideshowTextAttemptFromPayload,
  researchSelectedHookAttempt,
  selectSlideshowHook,
} from "@/lib/slideshow-generation-engine"
import { slideshowTextGenerationPayload } from "@/lib/slideshow-text-generation-payload"
import {
  deriveSlideVisualConcepts,
  rankImageCandidates,
  selectSlideshowImageWithAi,
  type SlideshowImageCandidate,
} from "@/lib/slideshow-image-matching"
import { translateTextsWithDeepL } from "@/lib/deepl-translate"
import {
  createSlideshowResultRecord,
  finalizeStoredSlideshowVideo,
  prepareStoredSlideshowVideo,
} from "@/lib/slideshows"
import { validateAutomationRunOutput } from "@/lib/automation-output-qa"
import {
  appendUsageRecords,
  listUsageRecords,
  usageRecordsForPublishedRuns,
  type UsageRecord,
} from "@/lib/usage-ledger"
import {
  hasNearDuplicateText,
  normalizedTextSignature,
} from "@/lib/text-similarity"
import {
  buildLinkedInGenerationRequest,
  composePost,
  deriveLinkedInBrief,
  generateLinkedInSlotsAttempt,
  selectLinkedInPlan,
  validateLinkedInDraft,
  type LinkedInBrief,
  type LinkedInDraft,
  type LinkedInDraftValidation,
  type LinkedInGenerationRequest,
} from "@/lib/linkedin-automation-generation"
import type { LinkedInPostPlan } from "@/lib/linkedin-post-presets"
import {
  analyzeUgcProductFacts,
  fetchProductPageResponse,
  generateUgcScript,
  resolvePublicProductUrl,
} from "@/lib/ugc-video-generation"
import {
  falCreateTask,
  falGetTaskResult,
  falGetTaskStatus,
  normalizeFalAsset,
} from "@/lib/fal-client"
import { estimateUgcCost } from "@/lib/ugc-cost"
import { ugcExportId, ugcRunId } from "@/lib/ugc-automation-runner"
import {
  buildXAutomationRun,
  buildXGenerationRequest,
  composeXStructuredPost,
  deriveXBriefAttempt,
  generateXStructuredAttempt,
  normalizeStructuredOutput,
  selectPostPlan,
  validateGeneratedPost,
  type PostPlan,
} from "@/lib/x-automation-generation"
import type { XAutomationRecord, XAutomationRun } from "@/lib/x-automation"
import { buildXAutomationUsageUpdate } from "@/lib/x-automation-runner"
import type { BrandProfile } from "@/lib/brand-profile"
import { humanizeContent, reviewContent } from "@/lib/generation-chain"
import { generationModelRegistry } from "@/lib/realfarm-generation-model-registry"
import { getGenerationModelSettings } from "@/lib/generation-model-settings"
import { synthesizeElevenLabsSpeechToTemp } from "@/lib/elevenlabs-tts"
import {
  completeRendiSessionUpload,
  discardRendiUploadSession,
  downloadRendiOutputToTemp,
  getRendiFfmpegStatus,
  getRendiUploadStatus,
  initializeRendiUploadSession,
  submitRendiFfmpeg,
  uploadRendiSessionPart,
} from "@/lib/pipeline-rendi"
import { getRendiApiKey } from "@/lib/rendi-client"
import { persistPipelineTempFile } from "@/lib/local-asset-download"
import { prepareUgcRendiComposite } from "@/lib/pipeline-ugc-rendi"
import {
  buildNanoBananaProPayload,
  createKieMarketTask,
  discardDownloadedImage,
  downloadRemoteImageToTemp,
  getKieMarketTask,
  getKieApiKey,
  persistDownloadedImage,
} from "@/lib/kie-image"
import { createHash } from "node:crypto"
import path from "node:path"
import {
  mergePipelineOutput,
  type PipelineHandlerMap,
} from "@/lib/pipeline-executor"
import {
  PIPELINE_STAGE_CATALOG,
  type PipelineStageContext,
} from "@/lib/pipeline-stages"
import type { AutomationRecord } from "@/lib/automations"
import type { StoredImageCollection } from "@/lib/image-collections"
import type { WordCollectionRecord } from "@/lib/word-collections"
import type { Job } from "@/lib/queue"
import type { ReminderSettings } from "@/lib/reminder-settings"

export type ProductionPipelineServices = {
  now: () => Date
  getAutomationRecord: (id: string) => Promise<AutomationRecord | null>
  listImageCollections: () => Promise<StoredImageCollection[]>
  listWordCollections: () => Promise<WordCollectionRecord[]>
  listAutomationRuns: (input: {
    automationId?: string
    limit?: number
  }) => Promise<AutomationRunRecord[]>
  getXAutomation: (id: string) => Promise<XAutomationRecord | null>
  generateStoredXAutomationRun: (input: {
    automation: XAutomationRecord
    topic?: string
    requestId?: string
  }) => Promise<Record<string, unknown>>
  persistGeneratedXAutomationRun: (input: {
    automation: XAutomationRecord
    run: XAutomationRun
    requestId?: string
  }) => Promise<XAutomationRun>
  upsertXAutomationRun: (run: XAutomationRun) => Promise<XAutomationRun>
  upsertXAutomation: (
    automation: XAutomationRecord
  ) => Promise<XAutomationRecord>
  getReminderSettings: () => Promise<ReminderSettings>
  enqueueJob: (input: {
    type: string
    payload: Record<string, unknown>
    dedupeKey?: string
    maxAttempts?: number
  }) => Promise<{ id: string; status: string } | null>
  getJob: (id: string) => Promise<Job | null>
  ugcGenerationEnabled: () => boolean
}

export function createProductionPipelineHandlers(
  services: ProductionPipelineServices
): PipelineHandlerMap {
  const handlers = new Map<
    string,
    PipelineHandlerMap extends ReadonlyMap<string, infer T> ? T : never
  >()
  const add = (
    id: string,
    handler: NonNullable<ReturnType<typeof handlers.get>>
  ) => handlers.set(id, handler)

  const registerRendiProtocol = (
    workflowId: "slideshow-generation" | "ugc-video-generation"
  ) => {
    const id = (name: string) => `${workflowId}.${name}`
    add(id("rendi-init-upload"), async (input, context) => {
      const initialized = await context.externalCall("Rendi init-upload", () =>
        initializeRendiUploadSession({
          apiKey: requiredRendiApiKey(),
          localFilePath: requiredString(input.localFilePath, "localFilePath"),
          fileName: clean(input.rendiFileName) || undefined,
        })
      )
      return mergePipelineOutput(input, {
        rendiUpload: {
          ...initialized,
          parts: [],
          phase: "uploading",
        },
        operation: rendiOperation(
          initialized.fileId,
          `${workflowId}.rendi.upload`,
          "running"
        ),
      })
    })

    add(id("rendi-upload-part"), async (input, context) => {
      const upload = requiredRecord(input.rendiUpload, "rendiUpload")
      const parts = requiredArray<{ part_number: number; etag: string }>(
        upload.parts,
        "rendiUpload.parts",
        true
      )
      const partNumber = numberValue(input.partNumber) || parts.length + 1
      const part = await context.externalCall("Rendi signed part PUT", () =>
        uploadRendiSessionPart({
          uploadSessionPath: requiredString(
            upload.uploadSessionPath,
            "rendiUpload.uploadSessionPath"
          ),
          localFilePath: requiredString(input.localFilePath, "localFilePath"),
          partNumber,
          fileSize: numberValue(upload.fileSize),
        })
      )
      return mergePipelineOutput(input, {
        rendiUpload: { ...upload, parts: [...parts, part] },
        operation: rendiOperation(
          clean(upload.fileId),
          `${workflowId}.rendi.upload`,
          "running"
        ),
      })
    })

    add(id("rendi-complete-upload"), async (input, context) => {
      const upload = requiredRecord(input.rendiUpload, "rendiUpload")
      const completed = await context.externalCall(
        "Rendi complete-upload",
        () =>
          completeRendiSessionUpload({
            apiKey: requiredRendiApiKey(),
            fileId: requiredString(upload.fileId, "rendiUpload.fileId"),
            parts: requiredArray(upload.parts, "rendiUpload.parts"),
          })
      )
      const succeeded =
        clean(completed.status) === "STORED" && Boolean(completed.storage_url)
      return mergePipelineOutput(input, {
        rendiUpload: {
          ...upload,
          phase: succeeded ? "complete" : "polling",
          storageUrl: clean(completed.storage_url) || undefined,
        },
        operation: rendiOperation(
          clean(upload.fileId),
          `${workflowId}.rendi.upload`,
          succeeded ? "succeeded" : "running"
        ),
      })
    })

    add(id("rendi-get-file"), async (input, context) => {
      const upload = requiredRecord(input.rendiUpload, "rendiUpload")
      const file = await context.externalCall("Rendi file status GET", () =>
        getRendiUploadStatus({
          apiKey: requiredRendiApiKey(),
          fileId: requiredString(upload.fileId, "rendiUpload.fileId"),
        })
      )
      const succeeded =
        clean(file.status) === "STORED" && Boolean(file.storage_url)
      return mergePipelineOutput(input, {
        rendiUpload: {
          ...upload,
          phase: succeeded ? "complete" : "polling",
          storageUrl: clean(file.storage_url) || undefined,
        },
        operation: rendiOperation(
          clean(upload.fileId),
          `${workflowId}.rendi.upload`,
          succeeded ? "succeeded" : "running"
        ),
      })
    })

    add(id("rendi-upload-file"), async (input, context) => {
      const upload = isRecord(input.rendiUpload) ? input.rendiUpload : null
      if (!upload?.fileId) {
        return (await context.runStage(id("rendi-init-upload"), input)).output
      }
      const parts = requiredArray(upload.parts, "rendiUpload.parts", true)
      if (parts.length < numberValue(upload.partCount)) {
        return (await context.runStage(id("rendi-upload-part"), input)).output
      }
      if (upload.phase === "uploading") {
        return (await context.runStage(id("rendi-complete-upload"), input))
          .output
      }
      if (!clean(upload.storageUrl)) {
        return (await context.runStage(id("rendi-get-file"), input)).output
      }
      return mergePipelineOutput(input, {
        operation: rendiOperation(
          clean(upload.fileId),
          `${workflowId}.rendi.upload`,
          "succeeded"
        ),
      })
    })

    add(id("rendi-submit-command"), async (input, context) => {
      const request = requiredRecord(
        input.rendiCommandRequest,
        "rendiCommandRequest"
      )
      const submitted = await context.externalCall(
        "Rendi run-ffmpeg-command",
        () =>
          submitRendiFfmpeg({
            apiKey: requiredRendiApiKey(),
            ffmpegCommand: requiredString(
              request.ffmpegCommand,
              "ffmpegCommand"
            ),
            inputFiles: requiredRecord(
              request.inputFiles,
              "inputFiles"
            ) as Record<string, string>,
            outputFiles: requiredRecord(
              request.outputFiles,
              "outputFiles"
            ) as Record<string, string>,
            maxCommandRunSeconds:
              numberValue(request.maxCommandRunSeconds) || undefined,
            vcpuCount: numberValue(request.vcpuCount) || undefined,
            metadata: isRecord(request.metadata)
              ? (request.metadata as never)
              : undefined,
          })
      )
      return mergePipelineOutput(input, {
        rendiCommandId: submitted.command_id,
        operation: rendiOperation(
          submitted.command_id,
          `${workflowId}.rendi.command`,
          "running"
        ),
      })
    })

    add(id("rendi-get-command"), async (input, context) => {
      const commandId = requiredString(input.rendiCommandId, "rendiCommandId")
      const command = await context.externalCall(
        "Rendi command status GET",
        () =>
          getRendiFfmpegStatus({
            apiKey: requiredRendiApiKey(),
            commandId,
          })
      )
      const succeeded = ["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(
        clean(command.status)
      )
      return mergePipelineOutput(input, {
        rendiCommandStatus: command,
        rendiOutputUrls: succeeded
          ? Object.fromEntries(
              Object.entries(command.output_files ?? {}).flatMap(
                ([name, file]) =>
                  clean(file.storage_url) ? [[name, file.storage_url]] : []
              )
            )
          : {},
        operation: rendiOperation(
          commandId,
          `${workflowId}.rendi.command`,
          succeeded ? "succeeded" : "running"
        ),
      })
    })

    add(id("rendi-download-output"), async (input, context) => {
      const downloaded = await context.externalCall(
        "Rendi output HTTP download",
        () =>
          downloadRendiOutputToTemp({
            remoteUrl: requiredString(input.remoteOutputUrl, "remoteOutputUrl"),
            commandId: requiredString(input.rendiCommandId, "rendiCommandId"),
            fileName: requiredString(input.outputFileName, "outputFileName"),
          })
      )
      return mergePipelineOutput(input, {
        tempRendiOutputPath: downloaded.tempPath,
        tempRendiOutputFileName: downloaded.fileName,
      })
    })

    add(id("rendi-persist-output"), async (input, context) => {
      const target = rendiPersistenceTarget(workflowId, context.ownerId, input)
      await context.externalCall("Appwrite Rendi output-file create", () =>
        persistPipelineTempFile({
          tempPath: requiredString(
            input.tempRendiOutputPath,
            "tempRendiOutputPath"
          ),
          outputPath: target.outputPath,
        })
      )
      return mergePipelineOutput(input, {
        persistedRendiOutputUrl: target.publicUrl,
        persistedRendiOutputKind: target.kind,
      })
    })

    add(id("rendi-discard-temp"), async (input) => {
      if (clean(input.uploadSessionPath)) {
        await discardRendiUploadSession(clean(input.uploadSessionPath))
      }
      if (clean(input.tempRendiOutputPath)) {
        await discardDownloadedImage(clean(input.tempRendiOutputPath))
      }
      return mergePipelineOutput(input, {
        uploadSessionPath: null,
        tempRendiOutputPath: null,
      })
    })
  }

  registerRendiProtocol("slideshow-generation")
  registerRendiProtocol("ugc-video-generation")

  add("slideshow-generation.load-automation-record", async (input, context) => {
    const automationRecord = await context.externalCall(
      "Appwrite automation read",
      () =>
        services.getAutomationRecord(
          requiredString(input.automationId, "automationId")
        )
    )
    return mergePipelineOutput(input, { automationRecord })
  })
  add("slideshow-generation.list-image-collections", async (input, context) =>
    mergePipelineOutput(input, {
      collections: await context.externalCall(
        "Appwrite image-collection list",
        () => services.listImageCollections()
      ),
    })
  )
  add("slideshow-generation.list-word-collections", async (input, context) =>
    mergePipelineOutput(input, {
      wordCollections: await context.externalCall(
        "Appwrite word-collection list",
        () => services.listWordCollections()
      ),
    })
  )
  add("slideshow-generation.list-usage-history", async (input, context) =>
    mergePipelineOutput(input, {
      usageHistory: await context.externalCall(
        "Appwrite usage-history list",
        () => listUsageRecords()
      ),
    })
  )
  add("slideshow-generation.list-prior-runs", async (input, context) =>
    mergePipelineOutput(input, {
      priorRuns: await context.externalCall(
        "Appwrite automation-run list",
        () =>
          services.listAutomationRuns({
            automationId: requiredString(input.automationId, "automationId"),
            limit: 500,
          })
      ),
    })
  )
  add("slideshow-generation.load-model-settings", async (input, context) =>
    mergePipelineOutput(input, {
      generationSettings: await context.externalCall(
        "generation-model settings read",
        () => getGenerationModelSettings()
      ),
    })
  )

  add("slideshow-generation.validate-input", async (input, context) => {
    let state = input
    if (clean(state.automationId) && !isRecord(state.automationRecord)) {
      state = (
        await context.runStage(
          "slideshow-generation.load-automation-record",
          state
        )
      ).output
    }
    const saved = isRecord(state.automationRecord)
      ? (state.automationRecord as unknown as AutomationRecord)
      : null
    if (clean(input.automationId) && !saved)
      throw new Error("Automation not found")
    const schema = requiredRecord(
      isRecord(state.schema) ? state.schema : saved?.schema,
      "schema"
    ) as unknown as AutomationSchema
    if (schema.automationKind !== "slideshow") {
      throw new Error("The selected automation is not a slideshow")
    }
    for (const [stageId, needed] of [
      [
        "slideshow-generation.list-image-collections",
        !Array.isArray(state.collections),
      ],
      [
        "slideshow-generation.list-word-collections",
        !Array.isArray(state.wordCollections),
      ],
      [
        "slideshow-generation.list-usage-history",
        !Array.isArray(state.usageHistory),
      ],
      [
        "slideshow-generation.list-prior-runs",
        Boolean(clean(state.automationId)) && !Array.isArray(state.priorRuns),
      ],
      [
        "slideshow-generation.load-model-settings",
        !isRecord(state.generationSettings),
      ],
    ] as const) {
      if (needed) state = (await context.runStage(stageId, state)).output
    }
    const collections = requiredArray<StoredImageCollection>(
      state.collections,
      "collections"
    )
    const wordCollections = requiredArray<WordCollectionRecord>(
      state.wordCollections,
      "wordCollections"
    )
    const usageRecords = requiredArray<UsageRecord>(
      state.usageHistory,
      "usageHistory"
    )
    const priorRuns = Array.isArray(state.priorRuns)
      ? (state.priorRuns as AutomationRunRecord[])
      : []
    const modelSettings = requiredRecord(
      state.generationSettings,
      "generationSettings"
    )
    const blockers = automationGenerationBlockers({
      schema,
      collections: collections.map((collection) => ({
        id: storedCollectionId(collection),
        name: collection.name,
        aliases: [
          storedCollectionId(collection),
          legacyStoredCollectionId(collection),
          collection.name,
        ],
        assetCount: collection.images.length,
        mediaType: "image" as const,
      })),
      wordCollections,
    })
    if (blockers.length) {
      throw new Error(blockers.map((blocker) => blocker.message).join("; "))
    }
    const automation = {
      id: saved?.id || clean(input.automationId) || "standalone-slideshow",
      name: saved?.name || clean(input.automationName) || "Slideshow",
    }
    const textAutomation = automationSchemaToTempSlideTestingAutomation(
      schema,
      automation
    )
    const publishedUsage = usageRecordsForPublishedRuns(
      usageRecords,
      automation.id
    )
    const usageFor = (kind: UsageRecord["kind"]) =>
      publishedUsage.filter((record) => record.kind === kind)
    return mergePipelineOutput(state, {
      automation,
      schema,
      collections,
      wordCollections,
      textAutomation,
      slideSpecs: textAutomation.slides.map((slide) => ({
        ...slide,
        textId:
          slide.textItems.find((item) => item.textMode === "prompt")?.id ||
          slide.textItems[0]?.id,
      })),
      publishType: automationPublishType(schema),
      language: schema.language,
      renderSettings: automationSlideshowSettings(schema),
      priorRuns,
      recentPublishedHookKeys: usageFor("hook_published").map(
        (record) => record.key
      ),
      recentPublishedHookCombinationKeys: usageFor(
        "hook_combination_published"
      ).map((record) => record.key),
      recentPublishedSignatures: usageFor("text").map((record) => record.key),
      recentHeadingExclusions: usageFor("heading").map((record) => record.key),
      recentImageUsage: Object.fromEntries(
        usageFor("image").map((record) => [record.key, record.used_at])
      ),
      textModel:
        clean(modelSettings.slideshowTextModel) ||
        generationModelRegistry.openRouter.slideshowText.model,
      firstSlidePinnedImageId:
        schema.image_collection_ids.first_slide.mode === "single_image"
          ? schema.image_collection_ids.first_slide.single_image
          : null,
      ctaPinnedImageId:
        automationFormatSection(schema, "cta").imageMode === "single_image"
          ? schema.image_collection_ids.cta_slide.image_id
          : null,
      scheduledFor: clean(input.scheduledFor) || services.now().toISOString(),
      requestId: context.requestId,
      runId: clean(input.runId) || context.requestId,
      blockers: [],
    })
  })

  add("slideshow-generation.resolve-slide-count", async (input) => {
    const schema = requiredSchema(input)
    const hook = automationFormatSection(schema, "hook").slideCount
    const content = automationFormatSection(schema, "content")
    const cta = automationFormatSection(schema, "cta").slideCount
    const selected = selectContentSlideCount({
      mode: content.slideCountMode ?? "static",
      count: content.slideCount,
      min: content.slideCountMin,
      max: content.slideCountMax,
    })
    return mergePipelineOutput(input, {
      slideCount: {
        mode: content.slideCountMode ?? "static",
        hook,
        body: selected.count,
        cta,
        total: hook + selected.count + cta,
        minimum: selected.min,
        maximum: selected.max,
      },
    })
  })

  add("slideshow-generation.select-expand-hook", async (input) => {
    let schema = requiredSchema(input)
    const selection = selectSlideshowHook({
      hookItems: automationHookItems(schema)
        .filter((item) => item.enabled)
        .map((item) => ({
          id: item.id,
          text: item.text,
          bodySlideCount: item.bodySlideCount,
          tone: item.tone,
        })),
      hookSlots: schema.hook_slots,
      wordCollections: requiredArray<WordCollectionRecord>(
        input.wordCollections,
        "wordCollections"
      ),
      usedHookKeys: new Set(stringArray(input.recentPublishedHookKeys)),
      usedHookCombinationKeys: new Set(
        stringArray(input.recentPublishedHookCombinationKeys)
      ),
      noDuplicateSlots: schema.distinct_variable_draws !== false,
      caseMode: schema.prompt_formatting.hook_case,
      now: new Date(clean(input.scheduledFor) || services.now()),
      timeZone: schema.schedule.timezone,
      slideCount: numberValue(asRecord(input.slideCount).body),
    })
    const additions: Record<string, unknown> = {
      hook: selection.expansion.text,
      hookId: selection.hookId,
      hookTemplate: selection.expansion.template,
      hookSubstitutions: selection.expansion.substitutions,
      hookToneOverride: selection.tone ?? null,
      bodySlideCountOverride: selection.bodySlideCount ?? null,
    }
    if (
      selection.bodySlideCount &&
      selection.bodySlideCount !== numberValue(asRecord(input.slideCount).body)
    ) {
      schema = updateAutomationFormatSection(schema, "content", {
        slideCount: selection.bodySlideCount,
        slideCountMode: "static",
      })
      const textAutomation = automationSchemaToTempSlideTestingAutomation(
        schema,
        requiredRecord(input.automation, "automation") as never
      )
      additions.schema = schema
      additions.textAutomation = textAutomation
      additions.slideSpecs = textAutomation.slides.map((slide) => ({
        ...slide,
        textId:
          slide.textItems.find((item) => item.textMode === "prompt")?.id ||
          slide.textItems[0]?.id,
      }))
      additions.slideCount = {
        ...asRecord(input.slideCount),
        body: selection.bodySlideCount,
        total: automationTotalSlideCount(schema),
      }
    }
    return mergePipelineOutput(input, additions)
  })

  add("slideshow-generation.research-hook-attempt", async (input, context) => {
    const apiKey = clean(process.env.OPENROUTER_API_KEY)
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
    const research = await context.externalCall(
      "OpenRouter chat completion with Exa",
      () =>
        researchSelectedHookAttempt({
          apiKey,
          model: clean(input.model) || "openai/gpt-5.4-mini",
          hook: requiredString(input.hook, "hook"),
          automationName:
            clean(input.automationName) ||
            clean(asRecord(input.automation).name) ||
            "Slideshow",
        })
    )
    return mergePipelineOutput(input, {
      research,
      webSearchSources: research.sources.map((source) => source.url),
    })
  })

  add("slideshow-generation.research-hook", async (input, context) => {
    const schema = requiredSchema(input)
    if (
      input.enabled === false ||
      input.researchEnabled === false ||
      !schema.web_search_enabled
    ) {
      return mergePipelineOutput(input, {
        research: null,
        webSearchSources: [],
      })
    }
    let lastError: unknown
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return (
          await context.runStage("slideshow-generation.research-hook-attempt", {
            ...input,
            attempt,
          })
        ).output
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  })

  add("slideshow-generation.build-text-prompt", async (input) => {
    const automation = requiredRecord(input.textAutomation, "textAutomation")
    const research = isRecord(input.research) ? input.research : null
    const promptPayload = slideshowTextGenerationPayload({
      automation: automation as never,
      model: clean(input.textModel) || undefined,
      selectedHook: requiredString(input.hook, "hook"),
      systemPrompt: clean(input.systemPrompt) || undefined,
      promptInstructions: [
        clean(input.promptInstructions),
        research
          ? `Exact-hook web research:\n${clean(research.content)}\n\nUse these sources only for claims that directly answer the selected hook.`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      avoidSimilarOutputs: stringArray(
        input.recentTextExclusions ?? input.recentPublishedSignatures
      ),
      avoidSimilarHeadings: stringArray(input.recentHeadingExclusions),
    })
    return mergePipelineOutput(input, {
      promptPayload,
      responseSchema: promptPayload.response_format.json_schema,
    })
  })

  add(
    "slideshow-generation.generate-slide-text-attempt",
    async (input, context) => {
      const apiKey = clean(process.env.OPENROUTER_API_KEY)
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
      const fixedHook = requiredString(input.hook, "hook")
      const generated = await context.externalCall(
        "OpenRouter chat completion",
        () =>
          generateSlideshowTextAttemptFromPayload({
            automation: requiredRecord(
              input.textAutomation,
              "textAutomation"
            ) as never,
            selectedHook: fixedHook,
            promptPayload: requiredRecord(
              input.promptPayload,
              "promptPayload"
            ) as never,
            repairFeedback: clean(input.repairFeedback) || undefined,
            finalAttempt: input.finalAttempt === true,
            apiKey,
          })
      )
      if (generated.selectedHook !== fixedHook) {
        throw new Error("The fixed slideshow hook cannot be overwritten")
      }
      return mergePipelineOutput(input, {
        generatedText: generated.result,
        textModel: generated.model,
        violations: generated.violations ?? [],
        transformations: generated.transformations ?? [],
        selectedHook: fixedHook,
      })
    }
  )

  add("slideshow-generation.generate-slide-text", async (input, context) => {
    let repairFeedback = ""
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return (
          await context.runStage(
            "slideshow-generation.generate-slide-text-attempt",
            mergePipelineOutput(input, {
              attempt,
              repairFeedback: repairFeedback || undefined,
              finalAttempt: attempt === 2,
            })
          )
        ).output
      } catch (error) {
        repairFeedback = error instanceof Error ? error.message : String(error)
        if (attempt === 2) throw error
      }
    }
    throw new Error("Slideshow text generation exhausted its attempts")
  })

  add("slideshow-generation.retry-text-similarity", async (input, context) => {
    const generatedText = requiredRecord(input.generatedText, "generatedText")
    const signature = normalizedTextSignature([
      clean(generatedText.title),
      clean(generatedText.caption),
      ...Object.values(asRecord(generatedText.text)).map(clean),
    ])
    const recent = stringArray(input.recentPublishedSignatures)
    if (
      !hasNearDuplicateText(signature, recent, {
        threshold: numberValue(input.similarityThreshold) || 0.85,
      })
    ) {
      return mergePipelineOutput(input, {
        generatedSignature: signature,
        textSimilarityRetry: false,
      })
    }
    const prompt = slideshowTextGenerationPayload({
      automation: requiredRecord(
        input.textAutomation,
        "textAutomation"
      ) as never,
      model: clean(input.textModel) || undefined,
      selectedHook: requiredString(input.hook, "hook"),
      promptInstructions: clean(input.promptInstructions) || undefined,
      avoidSimilarOutputs: recent,
      avoidSimilarHeadings: stringArray(input.recentHeadingExclusions),
    })
    const retry = await context.runStage(
      "slideshow-generation.generate-slide-text",
      mergePipelineOutput(input, { promptPayload: prompt })
    )
    return mergePipelineOutput(retry.output, { textSimilarityRetry: true })
  })

  add("slideshow-generation.derive-visual-concepts", async (input, context) => {
    const generatedText = asRecord(asRecord(input.generatedText).text)
    const slides = Array.isArray(input.visualSlides)
      ? (input.visualSlides as Record<string, unknown>[])
      : requiredArray<Record<string, unknown>>(
          asRecord(input.textAutomation).slides,
          "textAutomation.slides"
        ).map((slide) => {
          const promptItem = requiredArray<Record<string, unknown>>(
            slide.textItems,
            "slide.textItems"
          ).find((item) => item.textMode === "prompt")
          return {
            id: slide.id,
            aiImageSelection: Boolean(slide.aiImageSelection),
            text:
              clean(slide.section) === "hook"
                ? clean(input.hook)
                : clean(generatedText[clean(promptItem?.id)]),
          }
        })
    if (!slides.some((slide) => slide.aiImageSelection !== false)) {
      return mergePipelineOutput(input, { visualConceptsBySlide: [] })
    }
    const apiKey = clean(process.env.OPENROUTER_API_KEY)
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
    const concepts = await context.externalCall(
      "OpenRouter visual-concept derivation",
      () =>
        deriveSlideVisualConcepts({
          slideTexts: slides.map((slide) => clean(slide.text)),
          apiKey,
          model: clean(input.textModel) || undefined,
        })
    )
    return mergePipelineOutput(input, {
      visualConceptsBySlide: slides.map((slide, index) => ({
        slideId: clean(slide.id) || `slide-${index + 1}`,
        concepts: concepts[index] ?? [],
      })),
    })
  })

  add("slideshow-generation.build-image-shortlists", async (input) => {
    const textSlides = requiredArray<Record<string, unknown>>(
      asRecord(input.textAutomation).slides,
      "textAutomation.slides"
    )
    const generatedText = asRecord(asRecord(input.generatedText).text)
    const candidatesBySlide = Array.isArray(input.candidatesBySlide)
      ? (input.candidatesBySlide as Record<string, unknown>[])
      : textSlides.map((slide) => {
          const collectionId = clean(slide.collectionId)
          const collection = requiredArray<StoredImageCollection>(
            input.collections,
            "collections"
          ).find((candidate) =>
            [
              storedCollectionId(candidate),
              legacyStoredCollectionId(candidate),
              candidate.name,
            ].includes(collectionId)
          )
          if (!collection) {
            throw new Error(`Collection not found for slide ${clean(slide.id)}`)
          }
          const promptItem = requiredArray<Record<string, unknown>>(
            slide.textItems,
            "slide.textItems"
          ).find((item) => item.textMode === "prompt")
          return {
            slideId: slide.id,
            slideText:
              clean(slide.section) === "hook"
                ? clean(input.hook)
                : clean(generatedText[clean(promptItem?.id)]),
            aiImageSelection: Boolean(slide.aiImageSelection),
            candidates: collection.images.map((image, index) => ({
              id: image.hash || `${storedCollectionId(collection)}-${index}`,
              imageUrl: image.image_link,
              caption: image.caption,
            })),
          }
        })
    const conceptMap = new Map(
      requiredArray<Record<string, unknown>>(
        input.visualConceptsBySlide,
        "visualConceptsBySlide"
      ).map((item) => [clean(item.slideId), stringArray(item.concepts)])
    )
    const shortlists = candidatesBySlide.map((item, index) => {
      const slideId = requiredString(item.slideId, "slideId")
      const candidates = requiredArray<SlideshowImageCandidate>(
        item.candidates,
        `candidates for ${slideId}`
      )
      const pinnedId =
        index === 0
          ? clean(input.firstSlidePinnedImageId)
          : index === candidatesBySlide.length - 1
            ? clean(input.ctaPinnedImageId)
            : ""
      const pinned = pinnedId
        ? candidates.find(
            (candidate) =>
              candidate.id === pinnedId || candidate.imageUrl === pinnedId
          )
        : undefined
      const ranked = rankImageCandidates({
        concepts: conceptMap.get(slideId) ?? [],
        slideText: clean(item.slideText),
        candidates,
        limit: Math.min(12, numberValue(input.shortlistLimit) || 12),
      })
      const shortlistCandidates = pinned
        ? [
            pinned,
            ...ranked.filter(
              (candidate) =>
                candidate.id !== pinned.id &&
                candidate.imageUrl !== pinned.imageUrl
            ),
          ].slice(0, Math.min(12, numberValue(input.shortlistLimit) || 12))
        : ranked
      return {
        slideId,
        slideText: clean(item.slideText),
        aiImageSelection: Boolean(item.aiImageSelection),
        concepts: conceptMap.get(slideId) ?? [],
        candidates: shortlistCandidates.map((candidate, candidateIndex) => ({
          ...candidate,
          index: candidateIndex,
        })),
      }
    })
    return mergePipelineOutput(input, { shortlists })
  })

  add("slideshow-generation.select-one-slide-image", async (input, context) => {
    const shortlist = requiredRecord(input.shortlist, "shortlist")
    const candidates = requiredArray<SlideshowImageCandidate>(
      shortlist.candidates,
      "shortlist candidates"
    )
    if (!candidates.length) throw new Error("Image shortlist is empty")
    const recentUsage = asRecord(input.recentImageUsage)
    const usedIds = new Set(stringArray(input.usedImageIds))
    const usedUrls = new Set(stringArray(input.usedImageUrls))
    const pinnedId = clean(input.pinnedImageId)
    const pinned = pinnedId
      ? candidates.find(
          (candidate) =>
            candidate.id === pinnedId || candidate.imageUrl === pinnedId
        )
      : undefined
    const available = candidates.filter(
      (candidate) =>
        !usedIds.has(candidate.id) && !usedUrls.has(candidate.imageUrl)
    )
    const pool = available.length ? available : candidates
    const fresh = pool.filter(
      (candidate) =>
        !recentUsage[candidate.id] && !recentUsage[candidate.imageUrl]
    )
    const deterministic = (fresh.length ? fresh : pool).toSorted(
      (left, right) =>
        Date.parse(
          clean(recentUsage[left.id] ?? recentUsage[left.imageUrl]) || "0"
        ) -
        Date.parse(
          clean(recentUsage[right.id] ?? recentUsage[right.imageUrl]) || "0"
        )
    )[0]
    const selectedId =
      pinned?.id ??
      (shortlist.aiImageSelection === false || pool.length === 1
        ? deterministic.id
        : await context.externalCall("OpenRouter image choice", () =>
            selectSlideshowImageWithAi({
              slideText: clean(shortlist.slideText),
              candidates: pool,
              apiKey: requiredString(
                process.env.OPENROUTER_API_KEY,
                "OPENROUTER_API_KEY"
              ),
              concepts: stringArray(shortlist.concepts),
              model: clean(input.textModel) || undefined,
            })
          ))
    const selected =
      pool.find((candidate) => candidate.id === selectedId) ?? pinned
    if (!selected) throw new Error("Selected image is not in the shortlist")
    return mergePipelineOutput(input, {
      selectedImage: {
        slideId: clean(shortlist.slideId),
        id: selected.id,
        imageUrl: selected.imageUrl,
        imageCaption: selected.caption,
        reusedRecently: Boolean(
          recentUsage[selected.id] || recentUsage[selected.imageUrl]
        ),
      },
    })
  })

  add("slideshow-generation.select-slide-images", async (input, context) => {
    const shortlists = requiredArray<Record<string, unknown>>(
      input.shortlists,
      "shortlists"
    )
    const selectedImages: Record<string, unknown>[] = []
    for (const [index, shortlist] of shortlists.entries()) {
      const execution = await context.runStage(
        "slideshow-generation.select-one-slide-image",
        {
          shortlist,
          textModel: input.textModel,
          recentImageUsage: input.recentImageUsage,
          usedImageIds: selectedImages.map((image) => clean(image.id)),
          usedImageUrls: selectedImages.map((image) => clean(image.imageUrl)),
          pinnedImageId:
            index === 0
              ? input.firstSlidePinnedImageId
              : index === shortlists.length - 1
                ? input.ctaPinnedImageId
                : undefined,
        }
      )
      selectedImages.push(
        requiredRecord(execution.output.selectedImage, "selectedImage")
      )
    }
    return mergePipelineOutput(input, { selectedImages })
  })

  add("slideshow-generation.assemble-plan", async (input) => {
    const generated = requiredRecord(input.generatedText, "generatedText")
    const selected = requiredArray<Record<string, unknown>>(
      input.selectedImages,
      "selectedImages"
    )
    const slideSpecs = requiredArray<Record<string, unknown>>(
      input.slideSpecs,
      "slideSpecs"
    )
    const images = new Map(selected.map((item) => [clean(item.slideId), item]))
    const text = asRecord(generated.text)
    const slides = slideSpecs.map((spec, index) => {
      const id = clean(spec.id) || `slide-${index + 1}`
      const image = images.get(id) ?? selected[index]
      if (!image) throw new Error(`No selected image for ${id}`)
      const role = clean(spec.section) || "content"
      const displayed =
        role === "hook"
          ? requiredString(input.hook, "hook")
          : clean(text[clean(spec.textId)]) ||
            clean(
              requiredArray<Record<string, unknown>>(
                spec.textItems,
                "slideSpec.textItems"
              ).find((item) => item.textMode === "static")?.staticText
            ) ||
            clean(spec.text)
      return {
        id,
        role,
        imageUrl: clean(image.imageUrl),
        imageCaption: clean(image.imageCaption),
        text: displayed,
        textItems: [
          {
            id: clean(spec.textId) || `${id}-text`,
            text: displayed,
            fontSize: clean(spec.fontSize) || "10px",
            textSize: { width: 80, height: 18 },
            textStyle: clean(spec.textStyle) || "outline",
            textAlign: clean(spec.textAlign) || "center",
            textAnchor: clean(spec.textAnchor) || "padded",
            textVerticalAnchor: clean(spec.textVerticalAnchor) || "padded",
            textPosition: { x: 50, y: 45 },
          },
        ],
      }
    })
    const plan = {
      title: clean(generated.title),
      caption: clean(generated.caption),
      hashtags: clean(generated.hashtags),
      hook: requiredString(input.hook, "hook"),
      hookId: clean(input.hookId),
      hookTemplate: clean(input.hookTemplate),
      hookSubstitutions: asRecord(input.hookSubstitutions),
      textModel: clean(input.textModel),
      slides,
      slideCount: input.slideCount,
      imageCollectionIds: [
        ...new Set(
          slideSpecs.map((spec) => clean(spec.collectionId)).filter(Boolean)
        ),
      ],
      publishType: clean(input.publishType) || "slideshow",
      language: clean(input.language) || "English",
      autoMusic: false,
      autoPost: false,
      reuseWarnings: [],
      violations: stringArray(input.violations),
      hookCandidates: automationHookItems(requiredSchema(input)).map(
        (item) => item.text
      ),
    }
    return mergePipelineOutput(input, { plan })
  })

  add("slideshow-generation.translate-plan", async (input, context) => {
    const plan = requiredRecord(input.plan, "plan")
    const slides = requiredArray<Record<string, unknown>>(
      plan.slides,
      "plan.slides"
    )
    const language = clean(input.language) || "English"
    if (language === "English") {
      return mergePipelineOutput(input, { localizedPlan: plan })
    }
    const apiKey = clean(process.env.DEEPL_KEY)
    if (!apiKey) throw new Error("DEEPL_KEY is not configured")
    const texts = slides.map((slide) => clean(slide.text))
    const translated = await context.externalCall("DeepL translation", () =>
      translateTextsWithDeepL({
        apiKey,
        targetLanguage: language,
        texts,
      })
    )
    return mergePipelineOutput(input, {
      localizedPlan: {
        ...plan,
        language,
        slides: slides.map((slide, index) => ({
          ...slide,
          text: translated[index],
          textItems: requiredArray<Record<string, unknown>>(
            slide.textItems,
            "slide.textItems"
          ).map((item) => ({ ...item, text: translated[index] })),
        })),
      },
    })
  })

  add("slideshow-generation.render-store-pngs", async (input) => {
    const plan = requiredRecord(input.localizedPlan ?? input.plan, "plan")
    const slides = requiredArray<Record<string, unknown>>(
      plan.slides,
      "plan.slides"
    )
    const rendered = await createSlideshowResultRecord({
      runId: clean(input.runId) || contextId(input),
      automationId: clean(asRecord(input.automation).id) || undefined,
      title: clean(plan.title),
      caption: clean(plan.caption),
      hashtags: clean(plan.hashtags),
      prompt: `Hook: ${clean(plan.hook)}`,
      slideshow_type: "automation",
      settings: {
        ...(isRecord(input.renderSettings) ? input.renderSettings : {}),
        export_as_video: false,
      },
      images: slides.map((slide) => ({
        id: clean(slide.id),
        image_url: clean(slide.imageUrl),
        textItems: slide.textItems as never,
      })),
    })
    return mergePipelineOutput(input, {
      slideshowId: rendered.slideshow.id,
      resultId: rendered.result.id,
      outputImages: rendered.slideshow.output_images,
      thumbnailUrl: rendered.slideshow.thumbnail_url,
      renderedSlides: slides.map((slide, index) => ({
        id: clean(slide.id),
        role: clean(slide.role),
        imageUrl: rendered.slideshow.output_images[index],
        text: clean(slide.text),
      })),
    })
  })

  add("slideshow-generation.prepare-video-render", async (input) => {
    const prepared = await prepareStoredSlideshowVideo({
      id: requiredString(input.slideshowId, "slideshowId"),
      durationSeconds:
        numberValue(asRecord(input.renderSettings).duration) || undefined,
    })
    return mergePipelineOutput(input, {
      slideshowVideoPreparation: prepared,
      rendiLocalInputs: prepared.slideImagePaths.map(
        (localFilePath, index) => ({
          alias: `in_slide_${index + 1}`,
          localFilePath,
          fileName: path.basename(localFilePath),
        })
      ),
    })
  })

  add("slideshow-generation.build-rendi-video-command", async (input) => {
    const preparation = requiredRecord(
      input.slideshowVideoPreparation,
      "slideshowVideoPreparation"
    )
    const uploads = requiredArray<Record<string, unknown>>(
      input.rendiUploads,
      "rendiUploads"
    )
    const inputFiles = Object.fromEntries(
      uploads.map((upload, index) => [
        `in_slide_${index + 1}`,
        requiredString(upload.storageUrl, `rendiUploads.${index}.storageUrl`),
      ])
    )
    const duration = Math.max(1, numberValue(preparation.durationSeconds) || 5)
    const command: string[] = []
    uploads.forEach((_, index) => {
      const alias = `in_slide_${index + 1}`
      command.push("-loop", "1", "-t", String(duration), "-i", `{{${alias}}}`)
    })
    if (uploads.length === 1) {
      command.push("-vf", "fps=12,format=yuv420p")
    } else {
      const labels = uploads.map((_, index) => `[${index}:v]`).join("")
      command.push(
        "-filter_complex",
        `${labels}concat=n=${uploads.length}:v=1:a=0,fps=12,format=yuv420p[v]`,
        "-map",
        "[v]"
      )
    }
    command.push("-movflags", "+faststart", "{{out_video}}")
    return mergePipelineOutput(input, {
      rendiCommandRequest: {
        ffmpegCommand: command.join(" "),
        inputFiles,
        outputFiles: { out_video: "slideshow-export.mp4" },
        maxCommandRunSeconds: 300,
        vcpuCount: 4,
        metadata: { workflow: "slideshow_export" },
      },
    })
  })

  add("slideshow-generation.finalize-video-render", async (input) => {
    const preparation = requiredRecord(
      input.slideshowVideoPreparation,
      "slideshowVideoPreparation"
    )
    const rendered = await finalizeStoredSlideshowVideo({
      resultId: requiredString(preparation.resultId, "resultId"),
      resultRootDir: clean(preparation.resultRootDir) || undefined,
      videoUrl: requiredString(input.videoUrl, "videoUrl"),
      thumbnailUrl: requiredString(input.thumbnailUrl, "thumbnailUrl"),
    })
    if (clean(preparation.thumbnailPath)) {
      await discardDownloadedImage(clean(preparation.thumbnailPath))
    }
    return mergePipelineOutput(input, {
      videoUrl: rendered.video_url,
      thumbnailUrl: rendered.thumbnail_url,
      videoProvider: "rendi",
      videoProcessor: "ffmpeg",
      operation: rendiOperation(
        clean(input.rendiCommandId) || rendered.id,
        "slideshow-generation.rendi.command",
        "succeeded"
      ),
    })
  })

  add("slideshow-generation.render-store-mp4", async (input, context) => {
    if (clean(asRecord(input.plan).publishType) !== "video") {
      return mergePipelineOutput(input, { videoRenderSkipped: true })
    }
    let state = input
    if (!isRecord(state.slideshowVideoPreparation)) {
      state = (
        await context.runStage(
          "slideshow-generation.prepare-video-render",
          state
        )
      ).output
    }
    const localInputs = requiredArray<Record<string, unknown>>(
      state.rendiLocalInputs,
      "rendiLocalInputs"
    )
    const uploads = Array.isArray(state.rendiUploads)
      ? ([...state.rendiUploads] as Record<string, unknown>[])
      : localInputs.map(() => ({}))
    for (const [index, localInput] of localInputs.entries()) {
      const priorUpload = requiredRecord(
        uploads[index] ?? {},
        `rendiUploads.${index}`
      )
      if (clean(priorUpload.storageUrl)) continue
      const execution = await context.runStage(
        "slideshow-generation.rendi-upload-file",
        {
          ...state,
          localFilePath: localInput.localFilePath,
          rendiFileName: localInput.fileName,
          rendiUpload: uploads[index],
        }
      )
      uploads[index] = requiredRecord(
        execution.output.rendiUpload,
        "rendiUpload"
      )
      state = mergePipelineOutput(state, {
        rendiUploads: uploads,
        operation: execution.output.operation,
      })
      if (execution.status === "running") return state
      await context.runStage("slideshow-generation.rendi-discard-temp", {
        uploadSessionPath: requiredRecord(
          uploads[index],
          `rendiUploads.${index}`
        ).uploadSessionPath,
      })
    }
    if (!isRecord(state.rendiCommandRequest)) {
      state = (
        await context.runStage(
          "slideshow-generation.build-rendi-video-command",
          state
        )
      ).output
    }
    if (!clean(state.rendiCommandId)) {
      return (
        await context.runStage(
          "slideshow-generation.rendi-submit-command",
          state
        )
      ).output
    }
    if (!clean(asRecord(state.rendiOutputUrls).out_video)) {
      const execution = await context.runStage(
        "slideshow-generation.rendi-get-command",
        state
      )
      state = execution.output
      if (execution.status === "running") return state
    }
    if (!clean(state.videoUrl)) {
      state = (
        await context.runStage("slideshow-generation.rendi-download-output", {
          ...state,
          remoteOutputUrl: asRecord(state.rendiOutputUrls).out_video,
          outputFileName: "slideshow-export.mp4",
        })
      ).output
      state = (
        await context.runStage("slideshow-generation.rendi-persist-output", {
          ...state,
          outputKind: "video",
        })
      ).output
      state = mergePipelineOutput(state, {
        videoUrl: state.persistedRendiOutputUrl,
      })
      const discarded = await context.runStage(
        "slideshow-generation.rendi-discard-temp",
        {
          tempRendiOutputPath: state.tempRendiOutputPath,
        }
      )
      state = mergePipelineOutput(state, discarded.output)
    }
    if (!clean(state.rendiThumbnailUrl)) {
      const preparation = requiredRecord(
        state.slideshowVideoPreparation,
        "slideshowVideoPreparation"
      )
      const persisted = await context.runStage(
        "slideshow-generation.rendi-persist-output",
        {
          ...state,
          tempRendiOutputPath: preparation.thumbnailPath,
          outputKind: "thumbnail",
        }
      )
      state = mergePipelineOutput(persisted.output, {
        thumbnailUrl: persisted.output.persistedRendiOutputUrl,
        rendiThumbnailUrl: persisted.output.persistedRendiOutputUrl,
      })
    }
    return (
      await context.runStage(
        "slideshow-generation.finalize-video-render",
        state
      )
    ).output
  })

  add("slideshow-generation.validate-output", async (input) => {
    const plan = requiredRecord(
      input.plan,
      "plan"
    ) as unknown as AutomationRunPlan
    const now = services.now().toISOString()
    const run: AutomationRunRecord = {
      id: clean(input.runId) || contextId(input),
      automationId: clean(asRecord(input.automation).id) || "standalone",
      automationTitle: clean(asRecord(input.automation).name) || "Slideshow",
      scheduledFor: clean(input.scheduledFor) || now,
      status: "succeeded",
      plan,
      createdAt: now,
      updatedAt: now,
      slideshowId: clean(input.slideshowId) || undefined,
      outputImages: stringArray(input.outputImages),
    }
    const qa = validateAutomationRunOutput({
      run,
      schema: requiredSchema(input),
      priorRuns: Array.isArray(input.priorRuns)
        ? (input.priorRuns as AutomationRunRecord[])
        : [],
    })
    return mergePipelineOutput(input, {
      qa,
      runRecord: run,
    })
  })

  add(
    "slideshow-generation.append-one-usage-record",
    async (input, context) => {
      await context.externalCall("Appwrite usage-record create", () =>
        appendUsageRecords({
          records: [
            requiredRecord(
              input.usageRecord,
              "usageRecord"
            ) as unknown as UsageRecord,
          ],
        })
      )
      return mergePipelineOutput(input, { usageRecordPersisted: true })
    }
  )

  add("slideshow-generation.append-usage-records", async (input, context) => {
    const records = requiredArray<UsageRecord>(
      input.usageRecords,
      "usageRecords"
    )
    for (const usageRecord of records) {
      await context.runStage("slideshow-generation.append-one-usage-record", {
        usageRecord,
      })
    }
    return mergePipelineOutput(input, {
      usageRecordsPersisted: records.length,
    })
  })

  add("slideshow-generation.upsert-automation-run", async (input, context) => {
    await context.externalCall("Appwrite automation-run upsert", () =>
      upsertRecoveredAutomationRun(
        requiredRecord(input.runToPersist, "runToPersist") as never
      )
    )
    return mergePipelineOutput(input, { automationRunPersisted: true })
  })

  add("slideshow-generation.finalize-output", async (input, context) => {
    const plan = requiredRecord(input.plan, "plan")
    const runId = clean(input.runId) || contextId(input)
    const automationId = clean(asRecord(input.automation).id) || "standalone"
    const usedAt = services.now().toISOString()
    const records: UsageRecord[] = [
      ...requiredArray<Record<string, unknown>>(
        plan.slides,
        "plan.slides"
      ).flatMap((slide) =>
        clean(slide.imageUrl)
          ? [
              {
                automation_id: automationId,
                run_id: runId,
                kind: "image" as const,
                key: clean(slide.imageUrl),
                used_at: usedAt,
              },
            ]
          : []
      ),
      {
        automation_id: automationId,
        run_id: runId,
        kind: "text",
        key: normalizedTextSignature([
          clean(plan.title),
          clean(plan.caption),
          ...requiredArray<Record<string, unknown>>(
            plan.slides,
            "plan.slides"
          ).map((slide) => clean(slide.text)),
        ]),
        used_at: usedAt,
      },
      ...requiredArray<Record<string, unknown>>(
        plan.slides,
        "plan.slides"
      ).flatMap((slide) => {
        const key = normalizedTextSignature([clean(slide.text)])
        return clean(slide.role) === "content" && key
          ? [
              {
                automation_id: automationId,
                run_id: runId,
                kind: "heading" as const,
                key,
                used_at: usedAt,
              },
            ]
          : []
      }),
    ]
    const runRecord = requiredRecord(
      input.runRecord,
      "runRecord"
    ) as unknown as AutomationRunRecord
    await context.runStage("slideshow-generation.append-usage-records", {
      usageRecords: records,
    })
    await context.runStage("slideshow-generation.upsert-automation-run", {
      runToPersist: {
        ...runRecord,
        status: asRecord(input.qa).valid === false ? "failed" : "succeeded",
        slideshowId: clean(input.slideshowId) || undefined,
        outputImages: stringArray(input.outputImages),
        videoUrl: clean(input.videoUrl) || undefined,
        thumbnailUrl: clean(input.thumbnailUrl) || undefined,
        updatedAt: services.now().toISOString(),
      },
    })
    return {
      result: {
        id: clean(input.resultId),
        automationId,
        runId,
        workflowType: "slideshow",
        title: clean(plan.title),
        status: asRecord(input.qa).valid === false ? "failed" : "succeeded",
        artifacts: {
          slideshowId: clean(input.slideshowId),
          outputImages: stringArray(input.outputImages),
          videoUrl: clean(input.videoUrl) || undefined,
          thumbnailUrl: clean(input.thumbnailUrl) || undefined,
        },
        payload: {
          type: "slideshow",
          caption: clean(plan.caption),
          hashtags: clean(plan.hashtags),
        },
      },
      run: {
        id: runId,
        status: asRecord(input.qa).valid === false ? "failed" : "succeeded",
        slideshowId: clean(input.slideshowId),
        qa: input.qa,
      },
      reuseMemory: {
        images: records.filter((record) => record.kind === "image").length,
        textSignatures: 1,
        headingSignatures: records.filter((record) => record.kind === "heading")
          .length,
      },
    }
  })

  add("ugc-video-generation.resolve-product-host", async (input, context) => {
    const resolvedProductUrl = await context.externalCall(
      "public DNS lookup",
      () =>
        resolvePublicProductUrl(
          requiredString(
            input.currentProductUrl ?? input.productUrl,
            "productUrl"
          )
        )
    )
    return mergePipelineOutput(input, { resolvedProductUrl })
  })

  add(
    "ugc-video-generation.fetch-product-page-response",
    async (input, context) => {
      const result = await context.externalCall(
        "product-page HTTP request",
        () =>
          fetchProductPageResponse({
            url: requiredString(input.resolvedProductUrl, "resolvedProductUrl"),
          })
      )
      return mergePipelineOutput(input, {
        productPage: result.page,
        redirectUrl: result.redirectUrl,
      })
    }
  )

  add("ugc-video-generation.fetch-product-page", async (input, context) => {
    let state = mergePipelineOutput(input, {
      currentProductUrl: requiredString(input.productUrl, "productUrl"),
    })
    for (let redirects = 0; redirects <= 4; redirects += 1) {
      state = (
        await context.runStage(
          "ugc-video-generation.resolve-product-host",
          state
        )
      ).output
      state = (
        await context.runStage(
          "ugc-video-generation.fetch-product-page-response",
          state
        )
      ).output
      if (isRecord(state.productPage)) return state
      if (!clean(state.redirectUrl) || redirects === 4) {
        throw new Error("Product URL has too many or invalid redirects")
      }
      state = mergePipelineOutput(state, {
        currentProductUrl: state.redirectUrl,
      })
    }
    throw new Error("Product page redirect failure")
  })

  add("ugc-video-generation.analyze-product-facts", async (input, context) => {
    const apiKey = clean(process.env.OPENROUTER_API_KEY)
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
    const analysis = await context.externalCall(
      "OpenRouter product analysis",
      () =>
        analyzeUgcProductFacts({
          apiKey,
          productBrief: clean(input.productBrief) || undefined,
          page: isRecord(input.productPage)
            ? (input.productPage as never)
            : undefined,
        })
    )
    return mergePipelineOutput(input, {
      analysis,
      checkpoint: { stage: "analysis", status: "complete" },
    })
  })

  add(
    "ugc-video-generation.generate-script-attempt",
    async (input, context) => {
      const apiKey = clean(process.env.OPENROUTER_API_KEY)
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
      const plan = await context.externalCall(
        "OpenRouter UGC script generation",
        () =>
          generateUgcScript({
            apiKey,
            analysis: requiredRecord(input.analysis, "analysis") as never,
            targetDurationSeconds:
              numberValue(input.targetDurationSeconds) || 60,
          })
      )
      return mergePipelineOutput(input, {
        plan,
        checkpoint: { stage: "script", status: "complete" },
      })
    }
  )

  add("ugc-video-generation.enqueue-checkpoint-job", async (input, context) => {
    if (!services.ugcGenerationEnabled()) {
      throw new Error("AI UGC generation is disabled")
    }
    const automationId = requiredString(input.automationId, "automationId")
    const scheduledFor =
      clean(input.scheduledFor) || services.now().toISOString()
    const stopAfter = requiredString(input.stopAfter, "stopAfter")
    const queued = await context.externalCall("Appwrite job enqueue", () =>
      services.enqueueJob({
        type: "run-ugc-automation",
        payload: {
          automationId,
          scheduledFor,
          requestId: context.requestId,
          source: "mcp_pipeline_stage",
          draftOnly: true,
          stopAfter,
        },
        dedupeKey: `ugc-stage:${automationId}:${scheduledFor}:${stopAfter}:${context.requestId}`,
        maxAttempts: 3,
      })
    )
    if (!queued) throw new Error("The generation queue is unavailable")
    return mergePipelineOutput(input, {
      automationId,
      scheduledFor,
      runId: ugcRunId(automationId, scheduledFor),
      expectedOutputId: ugcExportId(automationId, scheduledFor),
      estimate: estimateUgcCost({}),
      operation: {
        id: queued.id,
        kind: `ugc.stage.${stopAfter}`,
        status: "running",
        stage: queued.status === "duplicate" ? "queued_existing" : "queued",
        createdAt: scheduledFor,
        updatedAt: scheduledFor,
        nextPollAfterMs: 5000,
        resourceUri: `lumenclip://operations/${encodeURIComponent(queued.id)}`,
      },
    })
  })

  add("ugc-video-generation.get-checkpoint-job", async (input, context) => {
    const job = await context.externalCall("Appwrite job read", () =>
      services.getJob(requiredString(input.jobId, "jobId"))
    )
    return mergePipelineOutput(input, { job })
  })

  add("ugc-video-generation.fal-create-task", async (input, context) => {
    const apiKey = requiredString(process.env.FAL_KEY, "FAL_KEY")
    const requestId = await context.externalCall("fal queue task submit", () =>
      falCreateTask({
        endpoint: requiredString(input.endpoint, "endpoint"),
        input: input.providerInput,
        apiKey,
      })
    )
    return mergePipelineOutput(input, { providerRequestId: requestId })
  })

  add("ugc-video-generation.fal-get-task-status", async (input, context) => {
    const status = await context.externalCall("fal queue status read", () =>
      falGetTaskStatus({
        endpoint: requiredString(input.endpoint, "endpoint"),
        requestId: requiredString(input.providerRequestId, "providerRequestId"),
        apiKey: requiredString(process.env.FAL_KEY, "FAL_KEY"),
      })
    )
    return mergePipelineOutput(input, { falStatus: status })
  })

  add("ugc-video-generation.fal-get-task-result", async (input, context) => {
    const raw = await context.externalCall("fal queue result read", () =>
      falGetTaskResult<Record<string, unknown>>({
        endpoint: requiredString(input.endpoint, "endpoint"),
        requestId: requiredString(input.providerRequestId, "providerRequestId"),
        apiKey: requiredString(process.env.FAL_KEY, "FAL_KEY"),
      })
    )
    return mergePipelineOutput(input, {
      providerAsset: normalizeFalAsset(
        raw,
        clean(input.assetKind) === "video" ? "video" : "image"
      ),
      operation: {
        id: requiredString(input.providerRequestId, "providerRequestId"),
        kind: "ugc.broll.fal",
        status: "succeeded",
      },
    })
  })

  add(
    "ugc-video-generation.download-one-broll-asset",
    async (input, context) => {
      const asset = requiredRecord(input.providerAsset, "providerAsset")
      const downloaded = await context.externalCall(
        "remote b-roll HTTP download",
        () =>
          downloadRemoteImageToTemp({
            imageUrl: requiredString(asset.url, "providerAsset.url"),
            taskId: requiredString(
              input.providerRequestId,
              "providerRequestId"
            ),
            fallbackName: "ugc-broll",
            failureMessage: "Failed to download generated UGC b-roll",
          })
      )
      return mergePipelineOutput(input, {
        tempBrollPath: downloaded.tempPath,
        tempBrollFileName: downloaded.fileName,
      })
    }
  )

  add(
    "ugc-video-generation.persist-one-broll-asset",
    async (input, context) => {
      const brollUrl = await context.externalCall(
        "Appwrite b-roll asset-file create",
        () =>
          persistDownloadedImage({
            tempPath: requiredString(input.tempBrollPath, "tempBrollPath"),
            fileName: requiredString(
              input.tempBrollFileName,
              "tempBrollFileName"
            ),
            folder: path.join(
              process.cwd(),
              "data",
              "ugc-automations",
              "broll"
            ),
            publicPrefix: "/api/local-assets/ugc-automations/broll",
          })
      )
      return mergePipelineOutput(input, { brollUrl })
    }
  )

  add("ugc-video-generation.discard-broll-temp-file", async (input) => {
    if (clean(input.tempBrollPath)) {
      await discardDownloadedImage(clean(input.tempBrollPath))
    }
    return mergePipelineOutput(input, {
      tempBrollPath: null,
      tempBrollFileName: null,
    })
  })

  add(
    "ugc-video-generation.generate-one-broll-image",
    async (input, context) => {
      let state = input
      if (!clean(state.providerRequestId)) {
        state = (
          await context.runStage("ugc-video-generation.fal-create-task", state)
        ).output
        return mergePipelineOutput(state, {
          operation: {
            id: clean(state.providerRequestId),
            kind: "ugc.broll.fal",
            status: "running",
            nextPollAfterMs: 2000,
          },
        })
      }
      state = (
        await context.runStage(
          "ugc-video-generation.fal-get-task-status",
          state
        )
      ).output
      const status = clean(asRecord(state.falStatus).status)
      if (status !== "COMPLETED") {
        if (status === "FAILED")
          throw new Error(
            clean(asRecord(state.falStatus).error) || "FAL b-roll task failed"
          )
        return mergePipelineOutput(state, {
          operation: {
            id: clean(state.providerRequestId),
            kind: "ugc.broll.fal",
            status: "running",
            nextPollAfterMs: 2000,
          },
        })
      }
      state = (
        await context.runStage(
          "ugc-video-generation.fal-get-task-result",
          state
        )
      ).output
      if (!clean(state.tempBrollPath) && !clean(state.brollUrl)) {
        state = (
          await context.runStage(
            "ugc-video-generation.download-one-broll-asset",
            state
          )
        ).output
      }
      if (!clean(state.brollUrl)) {
        state = (
          await context.runStage(
            "ugc-video-generation.persist-one-broll-asset",
            state
          )
        ).output
      }
      return (
        await context.runStage(
          "ugc-video-generation.discard-broll-temp-file",
          state
        )
      ).output
    }
  )

  add("ugc-video-generation.analyze-product", async (input, context) => {
    if (clean(input.automationId))
      return queueUgcStage(input, context, "analysis")
    let state = input
    if (clean(input.productUrl)) {
      state = (
        await context.runStage("ugc-video-generation.fetch-product-page", state)
      ).output
    }
    return (
      await context.runStage(
        "ugc-video-generation.analyze-product-facts",
        state
      )
    ).output
  })

  add("ugc-video-generation.generate-script-plan", async (input, context) => {
    if (clean(input.automationId))
      return queueUgcStage(input, context, "script")
    return (
      await context.runStage(
        "ugc-video-generation.generate-script-attempt",
        input
      )
    ).output
  })

  add(
    "ugc-video-generation.elevenlabs-synthesize-speech",
    async (input, context) => {
      const text =
        clean(input.voiceText) ||
        requiredArray<Record<string, unknown>>(
          asRecord(input.plan).segments,
          "plan.segments"
        )
          .map((segment) => clean(segment.spokenText))
          .filter(Boolean)
          .join(" ")
      if (!text) throw new Error("Voice synthesis text is required")
      const staged = await context.externalCall(
        "ElevenLabs speech with timestamps",
        () =>
          synthesizeElevenLabsSpeechToTemp({
            text,
            voiceId: requiredString(input.voiceId, "voiceId"),
            apiKey: requiredString(
              process.env.ELEVENLABS_API_KEY,
              "ELEVENLABS_API_KEY"
            ),
            modelId:
              clean(input.voiceModel) ||
              generationModelRegistry.ugc.elevenLabsModelId,
            endpoint:
              clean(input.elevenLabsEndpoint) ||
              generationModelRegistry.ugc.elevenLabsTimestampEndpoint,
          })
      )
      return mergePipelineOutput(input, {
        voiceText: text,
        tempVoiceAudioPath: staged.audioPath,
        tempVoiceTimingsPath: staged.timingsPath,
        voiceContentType: staged.contentType,
        voiceDurationMs: staged.durationMs,
        voiceWords: staged.words,
        provider: "ElevenLabs",
        model:
          clean(input.voiceModel) ||
          generationModelRegistry.ugc.elevenLabsModelId,
      })
    }
  )

  for (const [stageId, field, kind] of [
    ["ugc-video-generation.persist-voice-audio", "tempVoiceAudioPath", "voice"],
    [
      "ugc-video-generation.persist-voice-timings",
      "tempVoiceTimingsPath",
      "timings",
    ],
  ] as const) {
    add(stageId, async (input, context) => {
      const target = rendiPersistenceTarget(
        "ugc-video-generation",
        context.ownerId,
        {
          ...input,
          outputKind: kind,
        }
      )
      await context.externalCall(`Appwrite ${kind} asset-file create`, () =>
        persistPipelineTempFile({
          tempPath: requiredString(input[field], field),
          outputPath: target.outputPath,
        })
      )
      return mergePipelineOutput(input, {
        [kind === "voice" ? "voiceAudioUrl" : "voiceTimingsUrl"]:
          target.publicUrl,
      })
    })
  }

  add("ugc-video-generation.discard-voice-temp", async (input) => {
    const tempPath =
      clean(input.tempVoiceAudioPath) || clean(input.tempVoiceTimingsPath)
    if (tempPath) {
      await discardDownloadedImage(tempPath)
    }
    return mergePipelineOutput(input, {
      tempVoiceAudioPath: null,
      tempVoiceTimingsPath: null,
    })
  })

  add(
    "ugc-video-generation.synthesize-voice-assets",
    async (input, context) => {
      let state = input
      if (!clean(state.tempVoiceAudioPath) && !clean(state.voiceAudioUrl)) {
        state = (
          await context.runStage(
            "ugc-video-generation.elevenlabs-synthesize-speech",
            state
          )
        ).output
      }
      if (!clean(state.voiceAudioUrl)) {
        state = (
          await context.runStage(
            "ugc-video-generation.persist-voice-audio",
            state
          )
        ).output
      }
      if (!clean(state.voiceTimingsUrl)) {
        state = (
          await context.runStage(
            "ugc-video-generation.persist-voice-timings",
            state
          )
        ).output
      }
      return (
        await context.runStage("ugc-video-generation.discard-voice-temp", state)
      ).output
    }
  )

  add("ugc-video-generation.synthesize-voice", async (input, context) => {
    if (clean(input.automationId)) return queueUgcStage(input, context, "voice")
    return (
      await context.runStage(
        "ugc-video-generation.synthesize-voice-assets",
        input
      )
    ).output
  })

  add("ugc-video-generation.build-rendi-composite-command", async (input) =>
    mergePipelineOutput(input, await prepareUgcRendiComposite(input))
  )

  add("ugc-video-generation.render-rendi-composite", async (input, context) => {
    let state = input
    if (!isRecord(state.rendiCommandRequest)) {
      state = (
        await context.runStage(
          "ugc-video-generation.build-rendi-composite-command",
          state
        )
      ).output
    }
    const localInputs = requiredArray<Record<string, unknown>>(
      state.rendiLocalInputs,
      "rendiLocalInputs"
    )
    const uploads = Array.isArray(state.rendiUploads)
      ? ([...state.rendiUploads] as Record<string, unknown>[])
      : localInputs.map(() => ({}))
    for (const [index, localInput] of localInputs.entries()) {
      const priorUpload = requiredRecord(
        uploads[index] ?? {},
        `rendiUploads.${index}`
      )
      if (clean(priorUpload.storageUrl)) continue
      const execution = await context.runStage(
        "ugc-video-generation.rendi-upload-file",
        {
          ...state,
          localFilePath: localInput.localFilePath,
          rendiFileName: localInput.fileName,
          rendiUpload: priorUpload,
        }
      )
      uploads[index] = requiredRecord(
        execution.output.rendiUpload,
        "rendiUpload"
      )
      state = mergePipelineOutput(state, {
        rendiUploads: uploads,
        operation: execution.output.operation,
      })
      if (execution.status === "running") return state
      await context.runStage("ugc-video-generation.rendi-discard-temp", {
        uploadSessionPath: requiredRecord(
          uploads[index],
          `rendiUploads.${index}`
        ).uploadSessionPath,
      })
    }

    const commandRequest = requiredRecord(
      state.rendiCommandRequest,
      "rendiCommandRequest"
    )
    state = mergePipelineOutput(state, {
      rendiCommandRequest: {
        ...commandRequest,
        inputFiles: Object.fromEntries(
          localInputs.map((localInput, index) => [
            requiredString(localInput.alias, `rendiLocalInputs.${index}.alias`),
            requiredString(
              requiredRecord(uploads[index], `rendiUploads.${index}`)
                .storageUrl,
              `rendiUploads.${index}.storageUrl`
            ),
          ])
        ),
      },
    })
    if (!clean(state.rendiCommandId)) {
      return (
        await context.runStage(
          "ugc-video-generation.rendi-submit-command",
          state
        )
      ).output
    }
    const outputUrls = asRecord(state.rendiOutputUrls)
    if (!Object.keys(outputUrls).length) {
      const execution = await context.runStage(
        "ugc-video-generation.rendi-get-command",
        state
      )
      state = execution.output
      if (execution.status === "running") return state
    }

    const outputSpecs = requiredArray<Record<string, unknown>>(
      state.rendiOutputSpecs,
      "rendiOutputSpecs"
    )
    const persisted = { ...asRecord(state.rendiPersistedOutputs) }
    for (const [index, outputSpec] of outputSpecs.entries()) {
      const alias = requiredString(
        outputSpec.alias,
        `rendiOutputSpecs.${index}.alias`
      )
      if (clean(persisted[alias])) continue
      const downloaded = await context.runStage(
        "ugc-video-generation.rendi-download-output",
        {
          ...state,
          remoteOutputUrl: requiredString(
            asRecord(state.rendiOutputUrls)[alias],
            `rendiOutputUrls.${alias}`
          ),
          outputFileName: requiredString(
            outputSpec.fileName,
            `rendiOutputSpecs.${index}.fileName`
          ),
        }
      )
      const saved = await context.runStage(
        "ugc-video-generation.rendi-persist-output",
        {
          ...downloaded.output,
          outputKind: requiredString(
            outputSpec.outputKind,
            `rendiOutputSpecs.${index}.outputKind`
          ),
        }
      )
      persisted[alias] = saved.output.persistedRendiOutputUrl
      state = mergePipelineOutput(saved.output, {
        rendiPersistedOutputs: persisted,
      })
      state = mergePipelineOutput(
        state,
        (
          await context.runStage(
            "ugc-video-generation.rendi-discard-temp",
            state
          )
        ).output
      )
    }
    return mergePipelineOutput(state, {
      videoUrl: persisted["output.mp4"],
      thumbnailUrl: persisted["thumbnail.jpg"],
      provider: "Rendi",
      model: "FFmpeg",
      operation: rendiOperation(
        requiredString(state.rendiCommandId, "rendiCommandId"),
        "ugc-video-generation.rendi.command",
        "succeeded"
      ),
    })
  })

  add("ugc-video-generation.composite-output", async (input, context) => {
    if (
      Array.isArray(input.rendiLocalInputs) ||
      clean(input.actorLocalFilePath)
    ) {
      return (
        await context.runStage(
          "ugc-video-generation.render-rendi-composite",
          input
        )
      ).output
    }
    return queueUgcStage(input, context, "composite")
  })

  for (const [id, stage] of [
    ["ugc-video-generation.resolve-generate-actor", "actor"],
    ["ugc-video-generation.animate-actor", "motion"],
    ["ugc-video-generation.lip-sync-performance", "lipsync"],
    ["ugc-video-generation.generate-broll", "broll"],
    ["ugc-video-generation.store-final-output", "store"],
  ] as const) {
    add(id, async (input, context) => queueUgcStage(input, context, stage))
  }

  add("linkedin-generation.validate-input", async (input) => {
    const niche = requiredString(input.niche, "niche")
    const persona =
      input.persona === "practitioner" ? "practitioner" : "educator"
    return {
      normalizedInput: {
        niche,
        brief: isRecord(input.brief) ? input.brief : null,
        persona,
        archetypeId: clean(input.archetypeId) || null,
        hookStyleId: clean(input.hookStyleId) || null,
        pillar: clean(input.pillar) || null,
        topic: clean(input.topic) || null,
        excludedTopics: stringArray(input.excludedTopics),
        proof: stringArray(input.proof),
        count: Math.max(1, Math.min(4, numberValue(input.count) || 1)),
        briefModel: clean(input.briefModel) || "google/gemini-3.1-flash-lite",
        model: clean(input.model) || "openai/gpt-5.6-luna",
      },
      validationErrors: [],
    }
  })

  add("linkedin-generation.resolve-brief", async (input, context) => {
    const normalized = requiredRecord(input.normalizedInput, "normalizedInput")
    const supplied = isLinkedInBrief(normalized.brief)
    const brief = supplied
      ? normalized.brief
      : await context.externalCall("OpenRouter LinkedIn brief derivation", () =>
          deriveLinkedInBrief({
            niche: clean(normalized.niche),
            model: clean(normalized.briefModel),
          })
        )
    return mergePipelineOutput(input, {
      brief,
      briefSource: supplied ? "supplied" : "generated",
    })
  })

  add("linkedin-generation.select-post-plan", async (input) => {
    const normalized = requiredRecord(input.normalizedInput, "normalizedInput")
    const plan = selectLinkedInPlan({
      brief: requiredRecord(input.brief, "brief") as LinkedInBrief,
      persona:
        normalized.persona === "practitioner" ? "practitioner" : "educator",
      hasProof: stringArray(normalized.proof).length > 0,
      archetypeId: clean(normalized.archetypeId) || undefined,
      hookStyleId: clean(normalized.hookStyleId) || undefined,
      pillar: clean(normalized.pillar) || undefined,
      topic: clean(normalized.topic) || undefined,
      recentArchetypeIds: stringArray(
        asRecord(input.batchState).recentArchetypeIds
      ),
      recentHookIds: stringArray(asRecord(input.batchState).recentHookStyleIds),
    })
    return mergePipelineOutput(input, {
      plan,
      batchState: {
        postIndex: numberValue(asRecord(input.batchState).postIndex),
        recentArchetypeIds: [
          ...stringArray(asRecord(input.batchState).recentArchetypeIds),
          plan.archetype.id,
        ],
        recentHookStyleIds: [
          ...stringArray(asRecord(input.batchState).recentHookStyleIds),
          plan.hookStyle.id,
        ],
      },
    })
  })

  add("linkedin-generation.build-generation-request", async (input) => {
    const normalized = requiredRecord(input.normalizedInput, "normalizedInput")
    const request = buildLinkedInGenerationRequest({
      niche: clean(normalized.niche),
      brief: requiredRecord(input.brief, "brief") as LinkedInBrief,
      plan: requiredRecord(input.plan, "plan") as unknown as LinkedInPostPlan,
      personaVoiceId:
        normalized.persona === "practitioner" ? "practitioner" : "educator",
      model: clean(normalized.model),
      excludedTopics: stringArray(normalized.excludedTopics),
      proof: stringArray(normalized.proof),
    })
    return mergePipelineOutput(input, {
      generationRequest: request,
    })
  })

  add("linkedin-generation.generate-slots-attempt", async (input, context) => {
    const attempt = await context.externalCall(
      "OpenRouter LinkedIn post generation",
      () =>
        generateLinkedInSlotsAttempt({
          request: requiredRecord(
            input.generationRequest,
            "generationRequest"
          ) as unknown as LinkedInGenerationRequest,
          repairViolations: stringArray(input.repairViolations),
          attempt: numberValue(input.attempt) || 1,
        })
    )
    return mergePipelineOutput(input, {
      slotsAttempt: attempt,
      generation: {
        model: attempt.model,
        provider: attempt.provider,
        attempt: attempt.attempts,
      },
    })
  })

  add("linkedin-generation.compose-draft", async (input) => {
    const attempt = requiredRecord(input.slotsAttempt, "slotsAttempt")
    const plan = requiredRecord(
      input.plan,
      "plan"
    ) as unknown as LinkedInPostPlan
    const providerError = clean(attempt.providerError)
    const draft: LinkedInDraft = {
      slots: requiredRecord(attempt.slots, "slotsAttempt.slots"),
      post: providerError
        ? ""
        : composePost(
            plan.archetype,
            requiredRecord(attempt.slots, "slotsAttempt.slots")
          ),
      attempts: numberValue(attempt.attempts) || 1,
      provider: "OpenRouter",
      model: clean(attempt.model),
      ...(providerError ? { providerError } : {}),
    }
    return mergePipelineOutput(input, { draft })
  })

  add("linkedin-generation.generate-compose", async (input, context) => {
    const generated = await context.runStage(
      "linkedin-generation.generate-slots-attempt",
      input
    )
    return (
      await context.runStage(
        "linkedin-generation.compose-draft",
        generated.output
      )
    ).output
  })

  add("linkedin-generation.validate-draft", async (input) => {
    const validation = validateLinkedInDraft({
      plan: requiredRecord(input.plan, "plan") as unknown as LinkedInPostPlan,
      draft: requiredRecord(input.draft, "draft") as unknown as LinkedInDraft,
      proof: stringArray(asRecord(input.normalizedInput).proof),
    })
    return mergePipelineOutput(input, { validation })
  })

  add("linkedin-generation.repair-draft", async (input, context) => {
    let state = input
    let draft = requiredRecord(state.draft, "draft") as unknown as LinkedInDraft
    let validation = requiredRecord(
      state.validation,
      "validation"
    ) as unknown as LinkedInDraftValidation
    while (validation.needsRepair && draft.attempts < 3) {
      state = (
        await context.runStage("linkedin-generation.generate-compose", {
          ...state,
          repairViolations: validation.violations,
          attempt: draft.attempts + 1,
        })
      ).output
      state = (
        await context.runStage("linkedin-generation.validate-draft", state)
      ).output
      draft = requiredRecord(state.draft, "draft") as unknown as LinkedInDraft
      validation = requiredRecord(
        state.validation,
        "validation"
      ) as unknown as LinkedInDraftValidation
    }
    if (validation.needsRepair && draft.providerError) {
      throw new Error(draft.providerError)
    }
    const plan = requiredRecord(
      state.plan,
      "plan"
    ) as unknown as LinkedInPostPlan
    return mergePipelineOutput(state, {
      draft,
      validation,
      generatedPost: {
        post: draft.post,
        archetypeId: plan.archetype.id,
        archetypeLabel: plan.archetype.label,
        hookStyleId: plan.hookStyle.id,
        pillar: plan.pillar,
        violations: validation.violations,
        needsReview: validation.needsRepair,
        attempts: draft.attempts,
        characterCount: validation.characterCount,
      },
    })
  })

  add("linkedin-generation.complete-batch", async (input, context) => {
    const normalized = requiredRecord(input.normalizedInput, "normalizedInput")
    const posts = [
      ...requiredArray<Record<string, unknown>>(
        input.completedPosts,
        "completedPosts",
        true
      ),
      requiredRecord(input.generatedPost, "generatedPost"),
    ]
    let state = input
    while (posts.length < numberValue(normalized.count)) {
      for (const stageId of [
        "linkedin-generation.select-post-plan",
        "linkedin-generation.build-generation-request",
        "linkedin-generation.generate-compose",
        "linkedin-generation.validate-draft",
        "linkedin-generation.repair-draft",
      ]) {
        state = (await context.runStage(stageId, state)).output
      }
      posts.push(requiredRecord(state.generatedPost, "generatedPost"))
    }
    return {
      niche: clean(normalized.niche),
      model: clean(normalized.model),
      brief: input.brief,
      posts,
    }
  })

  add("x-threads-generation.validate-input", async (input, context) => {
    const automation = clean(input.automationId)
      ? await context.externalCall("Appwrite X-automation read", () =>
          services.getXAutomation(clean(input.automationId))
        )
      : isRecord(input.automation)
        ? (input.automation as unknown as XAutomationRecord)
        : null
    if (!automation) throw new Error("X/Threads automation not found")
    return mergePipelineOutput(input, {
      automation,
      topic: clean(input.topic),
      sourceCandidate: isRecord(input.sourceCandidate)
        ? input.sourceCandidate
        : null,
      validationErrors: [],
    })
  })

  add("x-threads-generation.resolve-brief-attempt", async (input, context) => {
    const brief = await context.externalCall(
      "OpenRouter X/Threads brief derivation",
      () =>
        deriveXBriefAttempt({
          niche: requiredString(input.niche, "niche"),
          model: requiredString(input.model, "model"),
        })
    )
    return mergePipelineOutput(input, { brief, selectedModel: input.model })
  })

  add("x-threads-generation.resolve-brief", async (input, context) => {
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    if (automation.brief)
      return mergePipelineOutput(input, {
        brief: automation.brief,
        briefSource: "persisted",
      })
    if (input.deriveBrief !== true) {
      throw new Error("Generate the niche strategy before creating a draft")
    }
    const models = [
      automation.generation.model,
      ...generationModelRegistry.openRouter.xPostGeneration.fallbackModels,
    ].filter((model, index, values) => model && values.indexOf(model) === index)
    const attempts: Record<string, unknown>[] = []
    for (const [modelIndex, model] of models.entries()) {
      const maximum = modelIndex === 0 ? 2 : 1
      for (let attempt = 1; attempt <= maximum; attempt += 1) {
        try {
          const result = await context.runStage(
            "x-threads-generation.resolve-brief-attempt",
            { niche: automation.niche.label, model, attempt }
          )
          const brief = requiredRecord(result.output.brief, "brief")
          return mergePipelineOutput(input, {
            automation: { ...automation, brief },
            brief,
            selectedModel: model,
            attempts,
          })
        } catch (error) {
          const retryable =
            isRecord(error) && typeof error.retryable === "boolean"
              ? error.retryable
              : true
          attempts.push({
            model,
            attempt,
            retryable,
            message: error instanceof Error ? error.message : String(error),
          })
          if (!retryable) throw error
        }
      }
    }
    throw new Error("X/Threads strategy derivation exhausted its attempts")
  })

  add("x-threads-generation.select-content-plan", async (input) => {
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    return mergePipelineOutput(input, {
      plan: selectPostPlan(automation, {
        platform: automation.platform,
        topic: clean(input.topic),
        now: services.now(),
      }),
    })
  })

  add("x-threads-generation.build-generation-request", async (input) => {
    const plan = requiredRecord(input.plan, "plan") as unknown as PostPlan
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    return mergePipelineOutput(input, {
      generationRequest: buildXGenerationRequest({ plan, record: automation }),
    })
  })

  add(
    "x-threads-generation.generate-structured-attempt",
    async (input, context) => {
      const generated = await context.externalCall(
        "OpenRouter X/Threads post generation",
        () =>
          generateXStructuredAttempt({
            request: requiredRecord(
              input.generationRequest,
              "generationRequest"
            ) as ReturnType<typeof buildXGenerationRequest>,
            repairErrors: stringArray(input.repairErrors),
          })
      )
      return mergePipelineOutput(input, { structuredAttempt: generated })
    }
  )

  add("x-threads-generation.compose-structured-draft", async (input) => {
    const generated = requiredRecord(
      input.structuredAttempt,
      "structuredAttempt"
    )
    const plan = requiredRecord(input.plan, "plan") as unknown as PostPlan
    const rawOutput = requiredRecord(
      generated.output,
      "structuredAttempt.output"
    )
    const output =
      input.normalize === true
        ? normalizeStructuredOutput(plan.archetype, rawOutput)
        : rawOutput
    return mergePipelineOutput(input, {
      draft: {
        output,
        posts: composeXStructuredPost(plan.archetype, output),
        provider: "OpenRouter",
        model: clean(generated.model),
        attempts: 1,
      },
      rawPosts: composeXStructuredPost(plan.archetype, output),
    })
  })

  add("x-threads-generation.generate-draft", async (input, context) => {
    try {
      const generated = await context.runStage(
        "x-threads-generation.generate-structured-attempt",
        input
      )
      return (
        await context.runStage(
          "x-threads-generation.compose-structured-draft",
          generated.output
        )
      ).output
    } catch (error) {
      if (!(error instanceof Error) || !/invalid json/i.test(error.message)) {
        throw error
      }
      const draft = {
        output: {},
        posts: [],
        provider: "OpenRouter" as const,
        model: clean(asRecord(input.generationRequest).model),
        providerError: error.message,
      }
      return mergePipelineOutput(input, {
        draft: { ...draft, attempts: 1 },
        rawPosts: draft.posts,
      })
    }
  })

  add("x-threads-generation.humanize-draft", async (input, context) => {
    const draft = requiredRecord(input.draft, "draft")
    if (!isRecord(input.brandProfile) || input.humanizeEnabled === false) {
      return mergePipelineOutput(input, {
        humanizedPosts: stringArray(draft.posts),
        humanizeSkipped: true,
      })
    }
    const apiKey = clean(process.env.OPENROUTER_API_KEY)
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
    const plan = requiredRecord(input.plan, "plan") as unknown as PostPlan
    const content = await context.externalCall(
      "OpenRouter brand humanization",
      () =>
        humanizeContent({
          stage: {
            model: generationModelRegistry.openRouter.contentHumanize.model,
          },
          apiKey,
          brandProfile: input.brandProfile as unknown as BrandProfile,
          content: joinSocialPosts(stringArray(draft.posts), plan),
        })
    )
    return mergePipelineOutput(input, {
      humanizedPosts: splitSocialPosts(content, plan),
      humanizeSkipped: false,
      trace: [
        {
          stage: "humanize",
          model: generationModelRegistry.openRouter.contentHumanize.model,
        },
      ],
    })
  })
  add("x-threads-generation.review-draft", async (input, context) => {
    const plan = requiredRecord(input.plan, "plan") as unknown as PostPlan
    const posts = stringArray(
      input.humanizedPosts ?? asRecord(input.draft).posts
    )
    if (!isRecord(input.brandProfile) || input.reviewEnabled === false) {
      return mergePipelineOutput(input, {
        reviewedPosts: posts,
        verdict: "pass",
        issues: [],
        reviewSkipped: true,
      })
    }
    const apiKey = clean(process.env.OPENROUTER_API_KEY)
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
    const reviewed = await context.externalCall("OpenRouter brand review", () =>
      reviewContent({
        stage: {
          model: generationModelRegistry.openRouter.contentReview.model,
        },
        apiKey,
        brandProfile: input.brandProfile as unknown as BrandProfile,
        content: joinSocialPosts(posts, plan),
      })
    )
    return mergePipelineOutput(input, {
      reviewedPosts: splitSocialPosts(reviewed.content, plan),
      verdict: reviewed.verdict,
      issues: reviewed.issues,
      reviewSkipped: false,
    })
  })
  add("x-threads-generation.validate-draft", async (input) => {
    const draft = requiredRecord(input.draft, "draft")
    const plan = requiredRecord(input.plan, "plan") as unknown as PostPlan
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    const posts = stringArray(input.reviewedPosts ?? draft.posts)
    const errors = validateGeneratedPost({
      plan,
      record: automation,
      output: requiredRecord(draft.output, "draft.output"),
      posts,
    })
    if (clean(draft.providerError)) errors.unshift(clean(draft.providerError))
    return mergePipelineOutput(input, {
      posts: posts.map((text, index) => ({
        index,
        text,
        characterCount: text.length,
      })),
      validation: { valid: errors.length === 0, errors },
    })
  })
  add("x-threads-generation.repair-draft", async (input, context) => {
    const validation = requiredRecord(input.validation, "validation")
    const current = requiredRecord(input.draft, "draft")
    if (validation.valid === true) {
      return mergePipelineOutput(input, {
        acceptedDraft: {
          ...current,
          posts: stringArray(input.reviewedPosts ?? current.posts),
          needsReview: false,
          errors: [],
        },
        attempts: numberValue(current.attempts) || 1,
        needsReview: false,
        reviewErrors: [],
      })
    }
    const plan = requiredRecord(input.plan, "plan") as unknown as PostPlan
    const retryState = (
      await context.runStage("x-threads-generation.generate-draft", {
        ...input,
        repairErrors: stringArray(validation.errors),
        normalize: true,
      })
    ).output
    const retry = requiredRecord(retryState.draft, "draft")
    const errors = validateGeneratedPost({
      plan,
      record: requiredRecord(
        input.automation,
        "automation"
      ) as unknown as XAutomationRecord,
      output: requiredRecord(retry.output, "draft.output"),
      posts: stringArray(retry.posts),
    })
    return mergePipelineOutput(input, {
      acceptedDraft: {
        ...retry,
        attempts: 2,
        needsReview: errors.length > 0,
        errors,
      },
      posts: stringArray(retry.posts),
      attempts: 2,
      needsReview: errors.length > 0,
      reviewErrors: errors,
    })
  })
  add("x-threads-generation.benchmark-build-run", async (input) => {
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    const plan = requiredRecord(input.plan, "plan") as unknown as PostPlan
    const accepted = requiredRecord(
      input.acceptedDraft ?? input.draft,
      "acceptedDraft"
    )
    const run = buildXAutomationRun({
      automation,
      topic: clean(input.topic) || plan.topic || plan.pillar.label,
      sourceCandidate: isRecord(input.sourceCandidate)
        ? (input.sourceCandidate as never)
        : undefined,
      plan,
      draft: {
        output: requiredRecord(accepted.output, "acceptedDraft.output"),
        posts: stringArray(accepted.posts),
        needsReview: Boolean(accepted.needsReview),
        errors: stringArray(accepted.errors),
      },
      now: services.now(),
    })
    return mergePipelineOutput(input, {
      run,
    })
  })
  add("x-threads-generation.persist-run", async (input, context) => {
    const run = requiredRecord(input.run, "run") as unknown as XAutomationRun
    await context.externalCall("Appwrite X-run upsert", () =>
      services.upsertXAutomationRun(run)
    )
    return mergePipelineOutput(input, { persistedRun: run.id })
  })

  add(
    "x-threads-generation.get-generated-reminder-policy",
    async (input, context) => {
      const settings = await context.externalCall(
        "Appwrite reminder-settings read",
        () => services.getReminderSettings()
      )
      return mergePipelineOutput(input, {
        reminderChannel: settings.events.generated.channel,
      })
    }
  )

  add("x-threads-generation.enqueue-reminder-job", async (input, context) => {
    const run = requiredRecord(input.run, "run") as unknown as XAutomationRun
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    const queued = await context.externalCall(
      "Appwrite reminder-job enqueue",
      () =>
        services.enqueueJob({
          type: "send-notification",
          payload: {
            event: "generated",
            sourceType: run.platform,
            sourceId: run.id,
            text: `Post generated\n${run.hook || automation.name}`,
          },
          dedupeKey: `reminder:generated:${run.platform}:${run.id}`,
          maxAttempts: 5,
        })
    )
    return mergePipelineOutput(input, {
      reminderEnqueued: Boolean(queued),
    })
  })

  add(
    "x-threads-generation.enqueue-generated-reminder",
    async (input, context) => {
      const policy = await context.runStage(
        "x-threads-generation.get-generated-reminder-policy",
        input
      )
      if (policy.output.reminderChannel !== "telegram") {
        return mergePipelineOutput(policy.output, {
          reminderEnqueued: false,
        })
      }
      return (
        await context.runStage(
          "x-threads-generation.enqueue-reminder-job",
          policy.output
        )
      ).output
    }
  )

  add("x-threads-generation.persist-usage-memory", async (input, context) => {
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    const run = requiredRecord(input.run, "run") as unknown as XAutomationRun
    const updatedAutomation = buildXAutomationUsageUpdate({ automation, run })
    await context.externalCall("Appwrite X-automation upsert", () =>
      services.upsertXAutomation(updatedAutomation)
    )
    return mergePipelineOutput(input, { automation: updatedAutomation })
  })

  add("x-threads-generation.persist-run-memory", async (input, context) => {
    const run = {
      ...(requiredRecord(input.run, "run") as unknown as XAutomationRun),
      requestId: context.requestId,
    }
    let state = mergePipelineOutput(input, { run })
    for (const stageId of [
      "x-threads-generation.persist-run",
      "x-threads-generation.enqueue-generated-reminder",
      "x-threads-generation.persist-usage-memory",
    ]) {
      state = (await context.runStage(stageId, state)).output
    }
    return mergePipelineOutput(state, {
      run,
      persistedRun: clean(run.id),
      usageMemory: {
        recentArchetypesAdded: (run.plans ?? []).map((plan) => plan.archetype),
        recentHookStylesAdded: (run.plans ?? []).map((plan) => plan.hookStyle),
        recentBodiesAdded: run.platform === "threads" && run.posts[0] ? 1 : 0,
      },
    })
  })

  add("x-threads-generation.build-image-task", async (input) => {
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    const run = requiredRecord(input.run, "run") as unknown as XAutomationRun
    if (
      automation.media.mode !== "generate" &&
      !clean(run.imagePrompt) &&
      !clean(input.imagePrompt)
    ) {
      return mergePipelineOutput(input, { imageGenerationSkipped: true })
    }
    const prompt = clean(input.imagePrompt) || clean(run.imagePrompt)
    if (!prompt) throw new Error("An image prompt is required")
    return mergePipelineOutput(input, {
      imagePrompt: prompt,
      imageTaskPayload: buildNanoBananaProPayload({
        prompt,
        imageUrls: [],
        aspectRatio: allowedImageRatio(input.aspectRatio),
      }),
    })
  })

  add("x-threads-generation.create-image-task", async (input, context) => {
    const apiKey = getKieApiKey()
    if (!apiKey) throw new Error("KIE_KEY is not configured")
    const providerTaskId = await context.externalCall("KIE createTask", () =>
      createKieMarketTask({
        apiKey,
        body: input.imageTaskPayload,
      })
    )
    return mergePipelineOutput(input, {
      providerTaskId,
      operation: {
        id: providerTaskId,
        kind: "x.image.kie",
        status: "running",
        nextPollAfterMs: 3000,
      },
    })
  })

  add("x-threads-generation.get-image-task", async (input, context) => {
    const providerTaskId = requiredString(
      input.providerTaskId,
      "providerTaskId"
    )
    const apiKey = getKieApiKey()
    if (!apiKey) throw new Error("KIE_KEY is not configured")
    const task = await context.externalCall("KIE recordInfo", () =>
      getKieMarketTask({ apiKey, taskId: providerTaskId })
    )
    return mergePipelineOutput(input, {
      ...(task.status === "succeeded" ? { remoteImageUrl: task.url } : {}),
      operation: {
        id: providerTaskId,
        kind: "x.image.kie",
        status: task.status,
        ...(task.status === "running" ? { nextPollAfterMs: 3000 } : {}),
      },
    })
  })

  add("x-threads-generation.download-image-asset", async (input, context) => {
    const downloaded = await context.externalCall(
      "remote image HTTP download",
      () =>
        downloadRemoteImageToTemp({
          imageUrl: requiredString(input.remoteImageUrl, "remoteImageUrl"),
          taskId: requiredString(input.providerTaskId, "providerTaskId"),
          fallbackName: "x-post-image",
          failureMessage: "Failed to save generated X image",
        })
    )
    return mergePipelineOutput(input, {
      tempImagePath: downloaded.tempPath,
      tempImageFileName: downloaded.fileName,
    })
  })

  add("x-threads-generation.persist-image-asset", async (input, context) => {
    const imageUrl = await context.externalCall(
      "Appwrite asset-file create",
      () =>
        persistDownloadedImage({
          tempPath: requiredString(input.tempImagePath, "tempImagePath"),
          fileName: requiredString(
            input.tempImageFileName,
            "tempImageFileName"
          ),
          folder: path.join(process.cwd(), "data", "x-automations", "images"),
          publicPrefix: "/api/local-assets/x-automations/images",
        })
    )
    return mergePipelineOutput(input, { imageUrl })
  })

  add("x-threads-generation.discard-image-temp-file", async (input) => {
    if (clean(input.tempImagePath)) {
      await discardDownloadedImage(clean(input.tempImagePath))
    }
    return mergePipelineOutput(input, {
      tempImagePath: null,
      tempImageFileName: null,
    })
  })

  add("x-threads-generation.persist-image-run", async (input, context) => {
    const run = requiredRecord(input.run, "run") as unknown as XAutomationRun
    const imageUrl = requiredString(input.imageUrl, "imageUrl")
    const updated = {
      ...run,
      imageUrls: [...run.imageUrls, imageUrl].slice(0, 4),
      updatedAt: services.now().toISOString(),
    }
    await context.externalCall("Appwrite X-run upsert", () =>
      services.upsertXAutomationRun(updated)
    )
    return mergePipelineOutput(input, {
      run: updated,
      imageUrl,
      provider: "KIE.ai",
      model: "nano-banana-pro",
      providerRequestId: input.providerTaskId,
    })
  })

  add("x-threads-generation.generate-image", async (input, context) => {
    let state = input
    if (input.imageGenerationSkipped === true) return input
    if (!isRecord(state.imageTaskPayload)) {
      state = (
        await context.runStage("x-threads-generation.build-image-task", state)
      ).output
      if (state.imageGenerationSkipped === true) return state
    }
    if (!clean(state.providerTaskId)) {
      return (
        await context.runStage("x-threads-generation.create-image-task", state)
      ).output
    }
    if (!clean(state.remoteImageUrl)) {
      state = (
        await context.runStage("x-threads-generation.get-image-task", state)
      ).output
      if (asRecord(state.operation).status === "running") return state
    }
    if (!clean(state.tempImagePath) && !clean(state.imageUrl)) {
      state = (
        await context.runStage(
          "x-threads-generation.download-image-asset",
          state
        )
      ).output
    }
    if (!clean(state.imageUrl)) {
      state = (
        await context.runStage(
          "x-threads-generation.persist-image-asset",
          state
        )
      ).output
    }
    state = (
      await context.runStage("x-threads-generation.persist-image-run", state)
    ).output
    return (
      await context.runStage(
        "x-threads-generation.discard-image-temp-file",
        state
      )
    ).output
  })

  for (const metadata of PIPELINE_STAGE_CATALOG) {
    if (!handlers.has(metadata.id)) {
      throw new Error(`Production pipeline handler missing: ${metadata.id}`)
    }
  }
  return handlers
}

async function queueUgcStage(
  input: Record<string, unknown>,
  context: PipelineStageContext,
  stopAfter: string
) {
  return (
    await context.runStage("ugc-video-generation.enqueue-checkpoint-job", {
      ...input,
      stopAfter,
    })
  ).output
}

function requiredSchema(input: Record<string, unknown>) {
  return requiredRecord(input.schema, "schema") as unknown as AutomationSchema
}

function requiredRecord(value: unknown, name: string) {
  if (!isRecord(value)) throw new Error(`${name} must be a JSON object`)
  return value
}

function requiredArray<T>(value: unknown, name: string, optional = false): T[] {
  if (optional && value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${name} must be a JSON array`)
  return value as T[]
}

function requiredString(value: unknown, name: string) {
  const result = clean(value)
  if (!result) throw new Error(`${name} is required`)
  return result
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function numberValue(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function contextId(input: Record<string, unknown>) {
  return clean(input.requestId) || `pipeline-${crypto.randomUUID()}`
}

function requiredRendiApiKey() {
  const apiKey = getRendiApiKey()
  if (!apiKey) throw new Error("RENDI_API_KEY is not configured")
  return apiKey
}

function rendiOperation(
  id: string,
  kind: string,
  status: "running" | "succeeded"
) {
  return {
    id,
    kind,
    status,
    ...(status === "running" ? { nextPollAfterMs: 3000 } : {}),
  }
}

function rendiPersistenceTarget(
  workflowId: "slideshow-generation" | "ugc-video-generation",
  ownerId: string,
  input: Record<string, unknown>
) {
  const kind = requiredString(input.outputKind, "outputKind")
  const ownerScope = ownerScopeSegment(ownerId)
  if (workflowId === "slideshow-generation") {
    const slideshowId = safePathSegment(
      requiredString(input.slideshowId, "slideshowId")
    )
    const fileName =
      kind === "video"
        ? "slideshow-export.mp4"
        : kind === "thumbnail"
          ? "slideshow-thumbnail.png"
          : ""
    if (!fileName) throw new Error("Unsupported slideshow Rendi output kind")
    return {
      kind,
      outputPath: path.join(
        process.cwd(),
        "data",
        "slideshows",
        "outputs",
        ownerScope,
        slideshowId,
        fileName
      ),
      publicUrl: `/api/local-assets/slideshows/outputs/${ownerScope}/${encodeURIComponent(slideshowId)}/${fileName}`,
    }
  }
  const automationId = safePathSegment(
    requiredString(input.automationId, "automationId")
  )
  const runId = safePathSegment(requiredString(input.runId, "runId"))
  const fileName =
    kind === "video"
      ? "video.mp4"
      : kind === "thumbnail"
        ? "thumbnail.jpg"
        : kind === "voice"
          ? "voice.mp3"
          : kind === "timings"
            ? "word-timings.json"
            : ""
  if (!fileName) throw new Error("Unsupported UGC output kind")
  return {
    kind,
    outputPath: path.join(
      process.cwd(),
      "data",
      "ugc-automations",
      ownerScope,
      automationId,
      runId,
      fileName
    ),
    publicUrl: `/api/local-assets/ugc-automations/${ownerScope}/${encodeURIComponent(automationId)}/${encodeURIComponent(runId)}/${fileName}`,
  }
}

function ownerScopeSegment(ownerId: string) {
  return createHash("sha256")
    .update(requiredString(ownerId, "ownerId"))
    .digest("hex")
    .slice(0, 24)
}

function safePathSegment(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(value)) {
    throw new Error("Invalid pipeline storage identifier")
  }
  return value
}

function isLinkedInBrief(value: unknown): value is LinkedInBrief {
  return (
    isRecord(value) &&
    typeof value.audience === "string" &&
    Array.isArray(value.pillars)
  )
}

function joinSocialPosts(posts: string[], plan: PostPlan) {
  return plan.archetype.kind === "thread"
    ? posts.join("\n---\n")
    : posts[0] || ""
}

function splitSocialPosts(content: string, plan: PostPlan) {
  return plan.archetype.kind === "thread"
    ? content
        .split(/\n\s*---\s*\n/)
        .map(clean)
        .filter(Boolean)
    : [clean(content)].filter(Boolean)
}

function allowedImageRatio(value: unknown): "1:1" | "4:5" | "16:9" {
  return value === "1:1" || value === "4:5" || value === "16:9" ? value : "16:9"
}
