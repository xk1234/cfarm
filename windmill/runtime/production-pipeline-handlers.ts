import { clean, isRecord } from "@/lib/guards"
import { automationGenerationBlockers } from "@/lib/automation-readiness"
import {
  automationFormatSection,
  automationHookItems,
  automationPublishType,
  automationSlideDesigns,
  type AutomationSchema,
  type AutomationVideoFormat,
  type TextItem,
} from "@/lib/realfarm-automation"
import {
  fixedSlideshowCount,
  hookUsesDynamicSlideCount,
} from "@/lib/fixed-slideshow-count"
import {
  legacyStoredCollectionId,
  storedCollectionId,
} from "@/lib/realfarm-collections"
import {
  automationSlideshowSettings,
  type AutomationRunPlan,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import { automationSchemaToTempSlideTestingAutomation } from "@/lib/temp-slide-testing"
import {
  generateSlideshowTextAttemptFromPayload,
  selectSlideshowHook,
} from "@/lib/slideshow-generation-engine"
import { slideshowTextGenerationPayload } from "@/lib/slideshow-text-generation-payload"
import {
  rankImageCandidates,
  selectSlideshowImageWithAi,
  type SlideshowImageCandidate,
} from "@/lib/slideshow-image-matching"
import {
  assembleSlideshowRenderRecord,
  discardSlideshowScratch,
  prepareSlideshowResultRender,
  renderOneStagedSlideshowSlide,
  slideshowAssetRequests,
  slideshowScratchFiles,
  stageOneRemoteSlideshowAsset,
  stageOneStoredSlideshowAsset,
  type SlideshowRecord,
  type StagedSlideshowAsset,
} from "@/lib/slideshows"
import { validateAutomationRunOutput } from "@/lib/automation-output-qa"
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
import type { BrandProfile } from "@/lib/brand-profile"
import { humanizeContent, reviewContent } from "@/lib/generation-chain"
import { generationModelRegistry } from "@/lib/realfarm-generation-model-registry"
import {
  defaultGenerationModelSettings,
  normalizeGenerationModelSettings,
} from "@/lib/generation-model-settings"
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
import {
  discardDownloadedTempFile,
  downloadRemoteFileToTemp,
  persistPipelineTempFile,
} from "@/lib/local-asset-download"
import { deleteAssetFromAppwrite } from "@/lib/asset-storage"
import {
  createDomainAssetOnce,
  createOutputMediaOnce,
  createPipelineDomainDocumentOnce,
  deleteDomainAssetOnce,
  deleteOutputMediaOnce,
  inspectDomainAssetOnce,
  pipelineDomainRowId,
  preparePipelineDomainDocument,
  readDomainAssetOnce,
  readOutputMediaPageOnce,
  readPipelineDomainDocumentOnce,
  readPipelineDomainPageOnce,
  updatePipelineDomainDocumentOnce,
  type PipelineStorageDomain,
} from "@/lib/pipeline-domain-storage"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import {
  createCanonicalPostOnce,
  createPostIdentityOnce,
  getCanonicalPostOnce,
  getPostIdentityOnce,
  updateCanonicalPostOnce,
} from "@/lib/post-repository-appwrite"
import { buildGeneratedPostIntents } from "@/lib/post-writer"
import { postRepositoryWriteMode } from "@/lib/post-repository-config"
import { postIdentityClaimsForPost, type Post } from "@/lib/posts"
import {
  hydrateOutputMedia,
  type OutputMediaDraft,
} from "@/lib/consolidated-records"
import type { ResultRecord } from "@/lib/results"
import { prepareUgcRendiComposite } from "@/lib/pipeline-ugc-rendi"
import { absoluteAssetUrl } from "@/lib/asset-urls"
import {
  buildFixedVideoRenderPlan,
  type FixedVideoFormat,
} from "@/lib/video-format-rendi"
import {
  buildNanoBananaProPayload,
  createKieMarketTask,
  discardDownloadedImage,
  downloadRemoteImageToTemp,
  getKieMarketTask,
  getKieApiKey,
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
import {
  normalizeAutomationRecord,
  type AutomationRecord,
} from "@/lib/automations"
import type { StoredImageCollection } from "@/lib/image-collections"
import type { WordCollectionRecord } from "@/lib/word-collections"
import type { ReminderSettings } from "@/lib/reminder-settings"
import { listMediaLibraryAssets } from "@/lib/media-library"
import { generateVideoCopy } from "@/lib/video-copy-generation"
import { videoSegmentPlaysFull } from "@/lib/video-automation-templates"
import { buildTemplateVideoRenderPlan } from "@/lib/template-video-rendi"
import { runWindmillWorkflow } from "@/lib/windmill-workflows"

export type ProductionPipelineServices = {
  now: () => Date
  getReminderSettings: () => Promise<ReminderSettings>
  sendGeneratedReminder: (text: string) => Promise<{ sent: boolean }>
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

  const addPageRead = (
    id: string,
    domain: PipelineStorageDomain,
    outputKey: string
  ) =>
    add(id, async (input, context) => {
      const page = await context.externalCall(
        `Appwrite ${domain} listRows`,
        () =>
          readPipelineDomainPageOnce({
            domain,
            ownerId: context.ownerId,
            cursor: clean(input.cursor) || undefined,
            limit: numberValue(input.pageSize) || 100,
          })
      )
      return mergePipelineOutput(input, { [outputKey]: page })
    })

  const addDocumentRead = (
    id: string,
    domain: PipelineStorageDomain,
    inputKey: string,
    outputKey: string
  ) =>
    add(id, async (input, context) => {
      const document = await context.externalCall(
        `Appwrite ${domain} getRow`,
        () =>
          readPipelineDomainDocumentOnce({
            domain,
            ownerId: context.ownerId,
            id: requiredString(input[inputKey], inputKey),
          })
      )
      return mergePipelineOutput(input, { [outputKey]: document })
    })

  const addDocumentWrite = (
    id: string,
    domain: PipelineStorageDomain,
    operation: "create" | "update",
    inputKey: string,
    outputKey: string
  ) =>
    add(id, async (input, context) => {
      const record = requiredRecord(input[inputKey], inputKey)
      const persisted = await context.externalCall(
        `Appwrite ${domain} ${operation}Row`,
        () =>
          (operation === "create"
            ? createPipelineDomainDocumentOnce
            : updatePipelineDomainDocumentOnce)({
            domain,
            ownerId: context.ownerId,
            record,
          })
      )
      return mergePipelineOutput(input, {
        [outputKey]: { rowId: persisted.rowId, media: persisted.media },
      })
    })

  addPageRead(
    "slideshow-generation.list-image-collections-page",
    "image-collections",
    "storagePage"
  )
  addPageRead(
    "slideshow-generation.list-word-collections-page",
    "word-collections",
    "storagePage"
  )
  addDocumentRead(
    "slideshow-generation.get-automation-document",
    "templates",
    "automationId",
    "automationDocument"
  )
  addDocumentRead(
    "slideshow-generation.get-model-settings-document",
    "model-settings",
    "modelSettingsId",
    "modelSettingsDocument"
  )
  addDocumentRead(
    "slideshow-generation.get-result-document",
    "results",
    "resultId",
    "resultDocument"
  )
  addDocumentWrite(
    "slideshow-generation.create-result-document",
    "results",
    "create",
    "resultRecord",
    "persistedResult"
  )
  addDocumentWrite(
    "slideshow-generation.update-result-document",
    "results",
    "update",
    "resultRecord",
    "persistedResult"
  )
  addDocumentRead(
    "ugc-video-generation.get-saved-run-document",
    "template-runs",
    "runId",
    "savedRunDocument"
  )
  addDocumentRead(
    "ugc-video-generation.get-saved-automation-document",
    "templates",
    "automationId",
    "savedAutomationDocument"
  )
  addDocumentRead(
    "ugc-video-generation.get-usage-document",
    "usage-history",
    "usageId",
    "usageDocument"
  )
  addDocumentWrite(
    "ugc-video-generation.create-usage-document",
    "usage-history",
    "create",
    "usageRecord",
    "persistedUsage"
  )
  addDocumentWrite(
    "ugc-video-generation.update-usage-document",
    "usage-history",
    "update",
    "usageRecord",
    "persistedUsage"
  )
  addDocumentRead(
    "slideshow-generation.get-automation-run-document",
    "template-runs",
    "runId",
    "automationRunDocument"
  )
  addDocumentWrite(
    "slideshow-generation.create-automation-run-document",
    "template-runs",
    "create",
    "runToPersist",
    "persistedAutomationRun"
  )
  addDocumentWrite(
    "slideshow-generation.update-automation-run-document",
    "template-runs",
    "update",
    "runToPersist",
    "persistedAutomationRun"
  )
  addDocumentWrite(
    "ugc-video-generation.create-saved-run-document",
    "template-runs",
    "create",
    "savedRun",
    "persistedSavedRun"
  )
  addDocumentWrite(
    "ugc-video-generation.update-saved-run-document",
    "template-runs",
    "update",
    "savedRun",
    "persistedSavedRun"
  )
  addDocumentRead(
    "ugc-video-generation.get-final-output-document",
    "ugc-outputs",
    "outputId",
    "finalOutputDocument"
  )
  addDocumentWrite(
    "ugc-video-generation.create-final-output-document",
    "ugc-outputs",
    "create",
    "finalOutput",
    "persistedFinalOutput"
  )
  addDocumentWrite(
    "ugc-video-generation.update-final-output-document",
    "ugc-outputs",
    "update",
    "finalOutput",
    "persistedFinalOutput"
  )
  addDocumentRead(
    "x-threads-generation.get-automation-document",
    "social-templates",
    "automationId",
    "xAutomationDocument"
  )
  addDocumentWrite(
    "x-threads-generation.create-automation-document",
    "social-templates",
    "create",
    "automation",
    "persistedAutomation"
  )
  addDocumentWrite(
    "x-threads-generation.update-automation-document",
    "social-templates",
    "update",
    "automation",
    "persistedAutomation"
  )
  addDocumentRead(
    "x-threads-generation.get-run-document",
    "social-template-runs",
    "runId",
    "xRunDocument"
  )
  addDocumentWrite(
    "x-threads-generation.create-run-document",
    "social-template-runs",
    "create",
    "run",
    "persistedRunDocument"
  )
  addDocumentWrite(
    "x-threads-generation.update-run-document",
    "social-template-runs",
    "update",
    "run",
    "persistedRunDocument"
  )

  const addMediaProtocol = (input: {
    workflowId:
      "slideshow-generation" | "ugc-video-generation" | "x-threads-generation"
    pageId: string
    createId: string
    deleteId: string
    rowKey: string
    mediaKey: string
    pageKey: string
    domain: Extract<
      PipelineStorageDomain,
      "results" | "ugc-outputs" | "social-template-runs"
    >
    idKey: string
  }) => {
    add(`${input.workflowId}.${input.pageId}`, async (state, context) => {
      const outputRowId = pipelineDomainRowId(
        input.domain,
        context.ownerId,
        requiredString(state[input.idKey], input.idKey)
      )
      const page = await context.externalCall(
        "Appwrite output_media listRows",
        () =>
          readOutputMediaPageOnce({
            ownerId: context.ownerId,
            outputRowId,
            cursor: clean(state.cursor) || undefined,
            limit: numberValue(state.pageSize) || 100,
          })
      )
      return mergePipelineOutput(state, {
        [input.rowKey]: outputRowId,
        [input.pageKey]: page,
      })
    })
    add(`${input.workflowId}.${input.createId}`, async (state, context) => {
      const media = requiredRecord(
        state[input.mediaKey],
        input.mediaKey
      ) as unknown as OutputMediaDraft
      const outputRowId = pipelineDomainRowId(
        input.domain,
        context.ownerId,
        requiredString(state[input.idKey], input.idKey)
      )
      const created = await context.externalCall(
        "Appwrite output_media createRow",
        () =>
          createOutputMediaOnce({
            ownerId: context.ownerId,
            outputRowId,
            media,
          })
      )
      return mergePipelineOutput(state, { createdMediaRowId: created.rowId })
    })
    add(`${input.workflowId}.${input.deleteId}`, async (state, context) => {
      const media = requiredRecord(
        state[input.mediaKey],
        input.mediaKey
      ) as unknown as OutputMediaDraft
      const outputRowId = pipelineDomainRowId(
        input.domain,
        context.ownerId,
        requiredString(state[input.idKey], input.idKey)
      )
      await context.externalCall("Appwrite output_media deleteRow", () =>
        deleteOutputMediaOnce({
          ownerId: context.ownerId,
          outputRowId,
          media,
        })
      )
      return mergePipelineOutput(state, { deletedMedia: media })
    })
  }
  addMediaProtocol({
    workflowId: "slideshow-generation",
    pageId: "list-result-media-page",
    createId: "create-one-result-media",
    deleteId: "delete-one-result-media",
    rowKey: "resultRowId",
    mediaKey: "resultMedia",
    pageKey: "resultMediaPage",
    domain: "results",
    idKey: "resultId",
  })
  addMediaProtocol({
    workflowId: "ugc-video-generation",
    pageId: "list-final-output-media-page",
    createId: "create-one-final-output-media",
    deleteId: "delete-one-final-output-media",
    rowKey: "outputRowId",
    mediaKey: "outputMedia",
    pageKey: "outputMediaPage",
    domain: "ugc-outputs",
    idKey: "outputId",
  })
  addMediaProtocol({
    workflowId: "x-threads-generation",
    pageId: "list-run-media-page",
    createId: "create-one-run-media",
    deleteId: "delete-one-run-media",
    rowKey: "runRowId",
    mediaKey: "runMedia",
    pageKey: "runMediaPage",
    domain: "social-template-runs",
    idKey: "runId",
  })

  const addMediaComposite = (input: {
    id: string
    pageId: string
    createId: string
    deleteId: string
    rowKey: string
    desiredKey: string
    childMediaKey: string
    pageKey: string
  }) =>
    add(input.id, async (state, context) => {
      let cursor: string | undefined
      do {
        const pageState = (
          await context.runStage(input.pageId, { ...state, cursor })
        ).output
        const page = requiredRecord(pageState[input.pageKey], input.pageKey)
        for (const row of requiredArray<Record<string, unknown>>(
          page.media,
          `${input.pageKey}.media`,
          true
        )) {
          await context.runStage(input.deleteId, {
            ...state,
            [input.rowKey]: state[input.rowKey],
            [input.childMediaKey]: row,
          })
        }
        cursor = clean(page.nextCursor) || undefined
      } while (cursor)
      for (const media of requiredArray<Record<string, unknown>>(
        state[input.desiredKey],
        input.desiredKey,
        true
      )) {
        await context.runStage(input.createId, {
          ...state,
          [input.childMediaKey]: media,
        })
      }
      return mergePipelineOutput(state, { mediaPersisted: true })
    })
  addMediaComposite({
    id: "slideshow-generation.persist-result-media",
    pageId: "slideshow-generation.list-result-media-page",
    createId: "slideshow-generation.create-one-result-media",
    deleteId: "slideshow-generation.delete-one-result-media",
    rowKey: "resultRowId",
    desiredKey: "resultMedia",
    childMediaKey: "resultMedia",
    pageKey: "resultMediaPage",
  })
  addMediaComposite({
    id: "ugc-video-generation.persist-final-output-media",
    pageId: "ugc-video-generation.list-final-output-media-page",
    createId: "ugc-video-generation.create-one-final-output-media",
    deleteId: "ugc-video-generation.delete-one-final-output-media",
    rowKey: "outputRowId",
    desiredKey: "outputMedia",
    childMediaKey: "outputMedia",
    pageKey: "outputMediaPage",
  })
  addMediaComposite({
    id: "x-threads-generation.persist-run-media",
    pageId: "x-threads-generation.list-run-media-page",
    createId: "x-threads-generation.create-one-run-media",
    deleteId: "x-threads-generation.delete-one-run-media",
    rowKey: "runRowId",
    desiredKey: "runMedia",
    childMediaKey: "runMedia",
    pageKey: "runMediaPage",
  })

  add("ugc-video-generation.save-checkpoint", async (input, context) => {
    const read = await context.runStage(
      "ugc-video-generation.get-saved-run-document",
      input
    )
    return (
      await context.runStage(
        read.output.savedRunDocument
          ? "ugc-video-generation.update-saved-run-document"
          : "ugc-video-generation.create-saved-run-document",
        read.output
      )
    ).output
  })
  add("ugc-video-generation.persist-usage-record", async (input, context) => {
    const usageRecord = requiredRecord(input.usageRecord, "usageRecord")
    let state = mergePipelineOutput(input, { usageId: clean(usageRecord.id) })
    state = (
      await context.runStage("ugc-video-generation.get-usage-document", state)
    ).output
    return (
      await context.runStage(
        state.usageDocument
          ? "ugc-video-generation.update-usage-document"
          : "ugc-video-generation.create-usage-document",
        state
      )
    ).output
  })
  add(
    "ugc-video-generation.prepare-final-output-document",
    async (input, context) => {
      const finalOutput = requiredRecord(input.finalOutput, "finalOutput")
      const outputId = requiredString(finalOutput.id, "finalOutput.id")
      const prepared = preparePipelineDomainDocument({
        domain: "ugc-outputs",
        ownerId: context.ownerId,
        record: finalOutput,
      })
      return mergePipelineOutput(input, {
        outputId,
        runId:
          clean(input.runId) ||
          clean(finalOutput.sourceRunId) ||
          clean(finalOutput.runId),
        hook:
          clean(input.hook) ||
          clean(finalOutput.hook) ||
          clean(finalOutput.title),
        outputRowId: prepared.rowId,
        outputMedia: prepared.media,
      })
    }
  )
  add("ugc-video-generation.persist-final-output", async (input, context) => {
    let state = (
      await context.runStage(
        "ugc-video-generation.prepare-final-output-document",
        input
      )
    ).output
    state = (
      await context.runStage(
        "ugc-video-generation.get-final-output-document",
        state
      )
    ).output
    state = (
      await context.runStage(
        state.finalOutputDocument
          ? "ugc-video-generation.update-final-output-document"
          : "ugc-video-generation.create-final-output-document",
        state
      )
    ).output
    state = (
      await context.runStage(
        "ugc-video-generation.persist-final-output-media",
        state
      )
    ).output
    return (
      await context.runStage(
        "ugc-video-generation.create-generated-notification-job",
        state
      )
    ).output
  })
  add(
    "ugc-video-generation.create-generated-notification-job",
    async (input, context) => {
      const sourceId = requiredString(input.outputId, "outputId")
      const runId = requiredString(input.runId, "runId")
      const delivery = await context.externalCall(
        "Telegram generated reminder",
        () =>
          services.sendGeneratedReminder(
            `UGC video generated\n${clean(input.hook)}`
          )
      )
      return mergePipelineOutput(input, {
        notificationSent: delivery.sent,
        notificationSourceId: sourceId,
        notificationRunId: runId,
      })
    }
  )

  const tempAssetPath = (prefix: string, relativePath: string) =>
    path.join(
      os.tmpdir(),
      `${prefix}-${createHash("sha256").update(relativePath).digest("hex").slice(0, 16)}-${path.basename(relativePath)}`
    )

  add(
    "ugc-video-generation.inspect-one-saved-asset",
    async (input, context) => {
      const inspection = await context.externalCall(
        "Appwrite Storage getFile",
        () =>
          inspectDomainAssetOnce({
            domain: "ugc",
            ownerId: context.ownerId,
            relativePath: requiredString(input.storagePath, "storagePath"),
          })
      )
      return mergePipelineOutput(input, inspection)
    }
  )
  add("ugc-video-generation.read-one-saved-asset", async (input, context) => {
    const relativePath = requiredString(input.storagePath, "storagePath")
    const bytes = await context.externalCall(
      "Appwrite Storage getFileView",
      () =>
        readDomainAssetOnce({
          domain: "ugc",
          ownerId: context.ownerId,
          relativePath,
        })
    )
    const localPath = tempAssetPath("cfarm-ugc-asset", relativePath)
    await writeFile(localPath, bytes)
    return mergePipelineOutput(input, { localPath })
  })
  add("ugc-video-generation.create-one-saved-asset", async (input, context) => {
    const localPath = requiredTempPath(input.localPath, "cfarm-ugc-")
    const bytes = await readFile(localPath)
    await context.externalCall("Appwrite Storage createFile", () =>
      createDomainAssetOnce({
        domain: "ugc",
        ownerId: context.ownerId,
        relativePath: requiredString(input.storagePath, "storagePath"),
        bytes,
      })
    )
    return mergePipelineOutput(input, { savedAsset: input.storagePath })
  })
  add("ugc-video-generation.delete-one-saved-asset", async (input, context) => {
    await context.externalCall("Appwrite Storage deleteFile", () =>
      deleteDomainAssetOnce({
        domain: "ugc",
        ownerId: context.ownerId,
        relativePath: requiredString(input.storagePath, "storagePath"),
      })
    )
    return mergePipelineOutput(input, { deletedAsset: input.storagePath })
  })
  add(
    "ugc-video-generation.replace-one-saved-asset",
    async (input, context) => {
      const inspected = await context.runStage(
        "ugc-video-generation.inspect-one-saved-asset",
        input
      )
      if (inspected.output.exists)
        await context.runStage(
          "ugc-video-generation.delete-one-saved-asset",
          inspected.output
        )
      return (
        await context.runStage(
          "ugc-video-generation.create-one-saved-asset",
          inspected.output
        )
      ).output
    }
  )

  add("slideshow-generation.prepare-png-render", async (input, context) => {
    const plan = requiredRecord(input.localizedPlan ?? input.plan, "plan")
    const slides = requiredArray<Record<string, unknown>>(
      plan.slides,
      "plan.slides"
    )
    const prepared = await prepareSlideshowResultRender({
      ownerId: context.ownerId,
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
      slideshowRender: {
        record: prepared.record,
        scratchDir: prepared.scratchDir,
        storageOutputDir: prepared.storageOutputDir,
        assetRequests: slideshowAssetRequests(prepared.record),
        stagedAssets: {},
        slideOutputs: [],
      },
    })
  })

  add("slideshow-generation.read-one-source-asset", async (input, context) => {
    const request = requiredRecord(input.assetRequest, "assetRequest")
    const render = requiredRecord(input.slideshowRender, "slideshowRender")
    const staged = await context.externalCall(
      "Appwrite Storage getFileView",
      () =>
        stageOneStoredSlideshowAsset({
          scratchDir: requiredString(
            render.scratchDir,
            "slideshowRender.scratchDir"
          ),
          slideshowId: requiredString(
            asRecord(render.record).id,
            "slideshowRender.record.id"
          ),
          slideIndex: numberValue(request.slideIndex),
          role: requiredString(request.role, "assetRequest.role"),
          sourceUrl: requiredString(
            request.sourceUrl,
            "assetRequest.sourceUrl"
          ),
        })
    )
    return mergePipelineOutput(input, { stagedAsset: staged })
  })

  add(
    "slideshow-generation.download-one-source-asset",
    async (input, context) => {
      const request = requiredRecord(input.assetRequest, "assetRequest")
      const render = requiredRecord(input.slideshowRender, "slideshowRender")
      const staged = await context.externalCall(
        "slideshow source HTTP GET",
        () =>
          stageOneRemoteSlideshowAsset({
            scratchDir: requiredString(
              render.scratchDir,
              "slideshowRender.scratchDir"
            ),
            slideshowId: requiredString(
              asRecord(render.record).id,
              "slideshowRender.record.id"
            ),
            slideIndex: numberValue(request.slideIndex),
            role: requiredString(request.role, "assetRequest.role"),
            sourceUrl: requiredString(
              request.sourceUrl,
              "assetRequest.sourceUrl"
            ),
          })
      )
      return mergePipelineOutput(input, { stagedAsset: staged })
    }
  )

  add("slideshow-generation.stage-render-assets", async (input, context) => {
    const render = requiredRecord(input.slideshowRender, "slideshowRender")
    const stagedAssets = { ...asRecord(render.stagedAssets) }
    for (const request of requiredArray<Record<string, unknown>>(
      render.assetRequests,
      "slideshowRender.assetRequests"
    )) {
      const key = requiredString(request.key, "assetRequest.key")
      if (isRecord(stagedAssets[key])) continue
      const remote = /^https?:\/\//i.test(clean(request.sourceUrl))
      const execution = await context.runStage(
        remote
          ? "slideshow-generation.download-one-source-asset"
          : "slideshow-generation.read-one-source-asset",
        {
          ...input,
          slideshowRender: { ...render, stagedAssets },
          assetRequest: request,
        }
      )
      stagedAssets[key] = requiredRecord(
        execution.output.stagedAsset,
        "stagedAsset"
      )
    }
    return mergePipelineOutput(input, {
      slideshowRender: { ...render, stagedAssets },
    })
  })

  add("slideshow-generation.render-one-slide-png", async (input) => {
    const render = requiredRecord(input.slideshowRender, "slideshowRender")
    const staged = asRecord(render.stagedAssets)
    const slideIndex = numberValue(input.slideIndex)
    const source = requiredRecord(
      staged[`${slideIndex}:source`],
      "staged source"
    ) as unknown as StagedSlideshowAsset
    const icons = Object.entries(staged)
      .filter(([key]) => key.startsWith(`${slideIndex}:icon:`))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value as unknown as StagedSlideshowAsset)
    const imageItems = Object.entries(staged)
      .filter(([key]) => key.startsWith(`${slideIndex}:image-layer:`))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value as unknown as StagedSlideshowAsset)
    const output = await renderOneStagedSlideshowSlide({
      scratchDir: requiredString(
        render.scratchDir,
        "slideshowRender.scratchDir"
      ),
      record: requiredRecord(
        render.record,
        "slideshowRender.record"
      ) as unknown as SlideshowRecord,
      slideIndex,
      source,
      overlay: isRecord(staged[`${slideIndex}:overlay`])
        ? (staged[`${slideIndex}:overlay`] as unknown as StagedSlideshowAsset)
        : undefined,
      icons,
      imageItems,
    })
    return mergePipelineOutput(input, { slideOutput: output })
  })

  add("slideshow-generation.render-all-slide-pngs", async (input, context) => {
    const render = requiredRecord(input.slideshowRender, "slideshowRender")
    const record = requiredRecord(
      render.record,
      "slideshowRender.record"
    ) as unknown as SlideshowRecord
    const outputs = requiredArray<Record<string, unknown>>(
      render.slideOutputs,
      "slideshowRender.slideOutputs",
      true
    )
    for (
      let slideIndex = outputs.length;
      slideIndex < record.images.length;
      slideIndex += 1
    ) {
      const execution = await context.runStage(
        "slideshow-generation.render-one-slide-png",
        {
          ...input,
          slideshowRender: { ...render, slideOutputs: outputs },
          slideIndex,
        }
      )
      outputs.push(requiredRecord(execution.output.slideOutput, "slideOutput"))
    }
    return mergePipelineOutput(input, {
      slideshowRender: { ...render, slideOutputs: outputs },
    })
  })

  add("slideshow-generation.list-render-output-files", async (input) => {
    const render = requiredRecord(input.slideshowRender, "slideshowRender")
    return mergePipelineOutput(input, {
      slideshowRender: {
        ...render,
        outputFiles: await slideshowScratchFiles(
          requiredString(render.scratchDir, "slideshowRender.scratchDir")
        ),
      },
    })
  })

  add(
    "slideshow-generation.create-one-output-asset",
    async (input, context) => {
      const render = requiredRecord(input.slideshowRender, "slideshowRender")
      const file = requiredRecord(input.outputFile, "outputFile")
      const fileName = path.basename(
        requiredString(file.fileName, "outputFile.fileName")
      )
      const localPath = requiredSlideshowScratchFile(file.localPath)
      const relativePath = `slideshows/outputs/${requiredString(asRecord(render.record).id, "slideshow id")}/${fileName}`
      const bytes = await readFile(localPath)
      await context.externalCall("Appwrite Storage createFile", () =>
        createDomainAssetOnce({
          domain: "slideshow",
          ownerId: context.ownerId,
          relativePath,
          bytes,
        })
      )
      return mergePipelineOutput(input, { persistedOutputFile: relativePath })
    }
  )

  add(
    "slideshow-generation.delete-one-output-asset",
    async (input, context) => {
      const render = requiredRecord(input.slideshowRender, "slideshowRender")
      const file = requiredRecord(input.outputFile, "outputFile")
      const relativePath = `slideshows/outputs/${requiredString(asRecord(render.record).id, "slideshow id")}/${path.basename(requiredString(file.fileName, "outputFile.fileName"))}`
      await context.externalCall("Appwrite Storage deleteFile", () =>
        deleteDomainAssetOnce({
          domain: "slideshow",
          ownerId: context.ownerId,
          relativePath,
        })
      )
      return mergePipelineOutput(input, { deletedOutputFile: relativePath })
    }
  )

  add(
    "slideshow-generation.persist-render-output-files",
    async (input, context) => {
      const render = requiredRecord(input.slideshowRender, "slideshowRender")
      for (const file of requiredArray<Record<string, unknown>>(
        render.outputFiles,
        "slideshowRender.outputFiles"
      )) {
        try {
          await context.runStage(
            "slideshow-generation.create-one-output-asset",
            { ...input, outputFile: file }
          )
        } catch (error) {
          if (appwriteErrorCode(error) !== 409) throw error
          await context.runStage(
            "slideshow-generation.delete-one-output-asset",
            { ...input, outputFile: file }
          )
          await context.runStage(
            "slideshow-generation.create-one-output-asset",
            { ...input, outputFile: file }
          )
        }
      }
      return mergePipelineOutput(input, {
        slideshowRender: { ...render, outputsPersisted: true },
      })
    }
  )

  add("slideshow-generation.assemble-rendered-slideshow", async (input) => {
    const render = requiredRecord(input.slideshowRender, "slideshowRender")
    const slideshow = assembleSlideshowRenderRecord({
      record: requiredRecord(
        render.record,
        "slideshowRender.record"
      ) as unknown as SlideshowRecord,
      outputs: requiredArray(
        render.slideOutputs,
        "slideshowRender.slideOutputs"
      ) as never,
    })
    return mergePipelineOutput(input, { renderedSlideshow: slideshow })
  })

  add("slideshow-generation.build-result-record", async (input, context) => {
    const slideshow = requiredRecord(
      input.renderedSlideshow,
      "renderedSlideshow"
    ) as unknown as SlideshowRecord
    const runId = clean(input.runId) || contextId(input)
    const resultRecord: ResultRecord = {
      id: `result-${runId}`,
      automationId:
        slideshow.automationId ?? `standalone-automation-${slideshow.id}`,
      runId,
      workflowType: "slideshow",
      title: slideshow.title,
      status: slideshow.status === "failed" ? "failed" : "succeeded",
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      artifacts: {
        slideshowId: slideshow.id,
        videoUrl: slideshow.video_url,
        thumbnailUrl: slideshow.thumbnail_url,
        outputImages: slideshow.output_images,
        outputDir: slideshow.output_dir,
      },
      payload: {
        type: "slideshow",
        caption: slideshow.caption,
        hashtags: slideshow.hashtags,
        prompt: slideshow.prompt,
        imageCollectionId: slideshow.image_collection,
        slideshowType: slideshow.slideshow_type,
        settings: slideshow.settings,
        slides: slideshow.images,
      },
      destinationAccountIds: [],
    }
    const prepared = preparePipelineDomainDocument({
      domain: "results",
      ownerId: context.ownerId,
      record: resultRecord as unknown as Record<string, unknown>,
    })
    return mergePipelineOutput(input, {
      resultId: resultRecord.id,
      resultRecord,
      resultRowId: prepared.rowId,
      resultMedia: prepared.media,
    })
  })

  add("slideshow-generation.prepare-post-intents", async (input, context) => {
    const slideshow = requiredRecord(
      input.renderedSlideshow,
      "renderedSlideshow"
    ) as unknown as SlideshowRecord
    const result = requiredRecord(
      input.resultRecord,
      "resultRecord"
    ) as unknown as ResultRecord
    const postIntents =
      postRepositoryWriteMode() === "legacy"
        ? []
        : buildGeneratedPostIntents(
            {
              sourceType: "slideshow",
              sourceId: slideshow.id,
              outputId: slideshow.id,
              automationId: slideshow.automationId,
              runId: result.runId,
              sourceEntityId: slideshow.id,
              publishMode: input.publishMode as never,
              destinations: Array.isArray(input.postIntentDestinations)
                ? (input.postIntentDestinations as never)
                : undefined,
              content: [slideshow.caption, slideshow.hashtags]
                .filter(Boolean)
                .join("\n\n"),
              media: [
                ...slideshow.output_images.map((url) => ({
                  kind: "image" as const,
                  url,
                })),
                ...(slideshow.video_url
                  ? [{ kind: "video" as const, url: slideshow.video_url }]
                  : []),
                ...(slideshow.thumbnail_url
                  ? [
                      {
                        kind: "thumbnail" as const,
                        url: slideshow.thumbnail_url,
                      },
                    ]
                  : []),
              ],
              generatedAt: slideshow.updated_at,
            },
            context.ownerId
          )
    return mergePipelineOutput(input, { postIntents })
  })

  add(
    "slideshow-generation.prepare-post-identity-claims",
    async (input, context) => {
      const post = {
        ...(requiredRecord(input.postIntent, "postIntent") as unknown as Post),
        ownerId: context.ownerId,
      }
      return mergePipelineOutput(input, {
        postIntent: post,
        postIdentityClaims: postIdentityClaimsForPost(post),
      })
    }
  )

  add("slideshow-generation.get-one-post-intent", async (input, context) => {
    const post = requiredRecord(
      input.postIntent,
      "postIntent"
    ) as unknown as Post
    const existing = await context.externalCall("Appwrite posts getRow", () =>
      getCanonicalPostOnce(context.ownerId, post.id)
    )
    return mergePipelineOutput(input, { existingPostIntent: existing })
  })
  add("slideshow-generation.create-one-post-intent", async (input, context) => {
    const post = {
      ...(requiredRecord(input.postIntent, "postIntent") as unknown as Post),
      ownerId: context.ownerId,
    }
    await context.externalCall("Appwrite posts createRow", () =>
      createCanonicalPostOnce(post)
    )
    return mergePipelineOutput(input, { persistedPostIntent: post.id })
  })
  add("slideshow-generation.update-one-post-intent", async (input, context) => {
    const post = {
      ...(requiredRecord(input.postIntent, "postIntent") as unknown as Post),
      ownerId: context.ownerId,
    }
    await context.externalCall("Appwrite posts updateRow", () =>
      updateCanonicalPostOnce(post)
    )
    return mergePipelineOutput(input, { persistedPostIntent: post.id })
  })
  add("slideshow-generation.get-one-post-identity", async (input, context) => {
    const claim = requiredRecord(
      input.postIdentityClaim,
      "postIdentityClaim"
    ) as never
    const identity = await context.externalCall(
      "Appwrite post_identities getRow",
      () => getPostIdentityOnce(claim)
    )
    if (identity && identity.ownerId !== context.ownerId)
      throw new Error("Post identity owner mismatch")
    return mergePipelineOutput(input, { existingPostIdentity: identity })
  })
  add(
    "slideshow-generation.create-one-post-identity",
    async (input, context) => {
      const post = requiredRecord(
        input.postIntent,
        "postIntent"
      ) as unknown as Post
      const claim = requiredRecord(
        input.postIdentityClaim,
        "postIdentityClaim"
      ) as never
      const identity = await context.externalCall(
        "Appwrite post_identities createRow",
        () => createPostIdentityOnce(context.ownerId, post.id, claim)
      )
      return mergePipelineOutput(input, {
        persistedPostIdentity: identity.identityHash,
      })
    }
  )
  add("slideshow-generation.persist-post-intents", async (input, context) => {
    for (const post of requiredArray<Record<string, unknown>>(
      input.postIntents,
      "postIntents",
      true
    )) {
      const prepared = (
        await context.runStage(
          "slideshow-generation.prepare-post-identity-claims",
          { ...input, postIntent: post }
        )
      ).output
      for (const claim of requiredArray<Record<string, unknown>>(
        prepared.postIdentityClaims,
        "postIdentityClaims"
      )) {
        const read = await context.runStage(
          "slideshow-generation.get-one-post-identity",
          { ...input, postIntent: post, postIdentityClaim: claim }
        )
        if (!read.output.existingPostIdentity)
          await context.runStage(
            "slideshow-generation.create-one-post-identity",
            read.output
          )
      }
      const read = await context.runStage(
        "slideshow-generation.get-one-post-intent",
        { ...input, postIntent: post }
      )
      await context.runStage(
        read.output.existingPostIntent
          ? "slideshow-generation.update-one-post-intent"
          : "slideshow-generation.create-one-post-intent",
        read.output
      )
    }
    return mergePipelineOutput(input, { postIntentsPersisted: true })
  })

  add(
    "slideshow-generation.persist-slideshow-result",
    async (input, context) => {
      const read = await context.runStage(
        "slideshow-generation.get-result-document",
        input
      )
      let state = (
        await context.runStage(
          read.output.resultDocument
            ? "slideshow-generation.update-result-document"
            : "slideshow-generation.create-result-document",
          read.output
        )
      ).output
      state = (
        await context.runStage(
          "slideshow-generation.persist-result-media",
          state
        )
      ).output
      state = (
        await context.runStage(
          "slideshow-generation.prepare-post-intents",
          state
        )
      ).output
      state = (
        await context.runStage(
          "slideshow-generation.persist-post-intents",
          state
        )
      ).output
      return state
    }
  )

  add("slideshow-generation.discard-png-render", async (input) => {
    const render = requiredRecord(input.slideshowRender, "slideshowRender")
    await discardSlideshowScratch(
      requiredString(render.scratchDir, "slideshowRender.scratchDir")
    )
    return mergePipelineOutput(input, {
      slideshowRender: {
        record: render.record,
        slideOutputs: render.slideOutputs,
        outputsPersisted: render.outputsPersisted,
        scratchDir: null,
      },
    })
  })

  const registerRendiProtocol = (
    workflowId:
      | "slideshow-generation"
      | "ugc-video-generation"
      | "react-reveal-generation"
      | "greenscreen-meme-generation"
      | "template-video-generation"
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
      if (
        ["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(
          clean(file.status)
        )
      ) {
        throw new Error(`Rendi upload failed with status ${clean(file.status)}`)
      }
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
      if (
        ["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(
          clean(command.status)
        )
      ) {
        throw new Error(
          `Rendi render failed with status ${clean(command.status)}`
        )
      }
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
  registerRendiProtocol("react-reveal-generation")
  registerRendiProtocol("greenscreen-meme-generation")
  registerRendiProtocol("template-video-generation")

  add("slideshow-generation.load-automation-record", async (input, context) => {
    const state = await context.runStage(
      "slideshow-generation.get-automation-document",
      input
    )
    const stored = isRecord(state.output.automationDocument)
      ? asRecord(state.output.automationDocument).record
      : null
    return mergePipelineOutput(state.output, {
      automationRecord: normalizedAutomationRecord(stored),
    })
  })
  const addPagedCollectionComposite = (
    id: string,
    pageId: string,
    outputKey: string,
    filter: (
      record: Record<string, unknown>,
      input: Record<string, unknown>
    ) => boolean = () => true
  ) =>
    add(id, async (input, context) => {
      const records: Record<string, unknown>[] = []
      let cursor: string | undefined
      do {
        const pageState = (await context.runStage(pageId, { ...input, cursor }))
          .output
        const page = requiredRecord(pageState.storagePage, "storagePage")
        records.push(
          ...requiredArray<Record<string, unknown>>(
            page.records,
            "storagePage.records",
            true
          )
            .map((item) =>
              requiredRecord(item.record, "storagePage.records.record")
            )
            .filter((record) => filter(record, input))
        )
        cursor = clean(page.nextCursor) || undefined
      } while (cursor)
      return mergePipelineOutput(input, { [outputKey]: records })
    })
  addPagedCollectionComposite(
    "slideshow-generation.list-image-collections",
    "slideshow-generation.list-image-collections-page",
    "collections",
    (record) => !clean(record.deletedAt)
  )
  addPagedCollectionComposite(
    "slideshow-generation.list-word-collections",
    "slideshow-generation.list-word-collections-page",
    "wordCollections"
  )
  add("slideshow-generation.load-model-settings", async (input, context) => {
    const state = (
      await context.runStage(
        "slideshow-generation.get-model-settings-document",
        { ...input, modelSettingsId: "generation-models" }
      )
    ).output
    const stored = isRecord(state.modelSettingsDocument)
      ? asRecord(state.modelSettingsDocument).record
      : null
    const generationSettings =
      normalizeGenerationModelSettings(stored) ??
      defaultGenerationModelSettings()
    return mergePipelineOutput(state, {
      generationSettings,
      textModel:
        clean(generationSettings.slideshowTextModel) ||
        generationModelRegistry.openRouter.slideshowText.model,
    })
  })

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
    const designs = automationSlideDesigns(schema)
    const fixedCount = fixedSlideshowCount(schema)
    const slidePlan =
      designs.length > 0
        ? Array.from({ length: fixedCount }, (_, index) => ({
            designId: designs[index % designs.length]!.id,
            purpose: "",
          }))
        : undefined
    const textAutomation = automationSchemaToTempSlideTestingAutomation(
      schema,
      { ...automation, slidePlan }
    )
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

  add("slideshow-generation.prepare-image-candidate-pools", async (input) => {
    const slides = requiredArray<Record<string, unknown>>(
      asRecord(input.textAutomation).slides,
      "textAutomation.slides"
    )
    const collections = requiredArray<StoredImageCollection>(
      input.collections,
      "collections"
    )
    const candidatesBySlide = slides.map((slide) => {
      const slideId = requiredString(slide.id, "slide.id")
      const collectionId = requiredString(
        slide.collectionId,
        `collectionId for ${slideId}`
      )
      const collection = collections.find((candidate) =>
        [
          storedCollectionId(candidate),
          legacyStoredCollectionId(candidate),
          candidate.name,
        ].includes(collectionId)
      )
      if (!collection)
        throw new Error(`Collection not found for slide ${slideId}`)
      return {
        slideId,
        aiImageSelection: Boolean(slide.aiImageSelection),
        candidates: collection.images.map((image, index) => ({
          id: image.hash || `${storedCollectionId(collection)}-${index}`,
          imageUrl: image.image_link,
          caption: image.caption,
        })),
      }
    })
    return {
      candidatesBySlide,
      candidatePoolCount: candidatesBySlide.reduce(
        (count, pool) => count + pool.candidates.length,
        0
      ),
    }
  })

  add("slideshow-generation.apply-fixed-slide-count", async (input) => {
    const schema = requiredSchema(input)
    const total = fixedSlideshowCount(schema)
    const usesSlideDesigns = schema.slide_designs.length > 0
    const hook = usesSlideDesigns
      ? 0
      : Math.max(0, automationFormatSection(schema, "hook").slideCount)
    const cta = usesSlideDesigns
      ? 0
      : Math.max(0, automationFormatSection(schema, "cta").slideCount)
    const body = Math.max(0, total - hook - cta)
    return mergePipelineOutput(input, {
      slideCount: {
        mode: "static",
        hook,
        body,
        cta,
        total,
        minimum: total,
        maximum: total,
      },
    })
  })

  add("slideshow-generation.select-expand-hook", async (input) => {
    const schema = requiredSchema(input)
    const requestedHook = clean(input.hook)
    if (requestedHook) {
      return mergePipelineOutput(input, {
        hook: requestedHook,
        hookId: "manual",
        hookTemplate: requestedHook,
        hookSubstitutions: {},
        hookToneOverride: null,
        bodySlideCountOverride: null,
      })
    }
    const selection = selectSlideshowHook({
      hookItems: automationHookItems(schema)
        .filter((item) => item.enabled && !hookUsesDynamicSlideCount(item))
        .map((item) => ({
          id: item.id,
          text: item.text,
          tone: item.tone,
        })),
      hookSlots: schema.hook_slots,
      wordCollections: requiredArray<WordCollectionRecord>(
        input.wordCollections,
        "wordCollections"
      ),
      usedHookKeys: new Set(),
      usedHookCombinationKeys: new Set(),
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
      bodySlideCountOverride: null,
    }
    return mergePipelineOutput(input, additions)
  })

  add("slideshow-generation.build-text-prompt", async (input) => {
    const automation = requiredRecord(input.textAutomation, "textAutomation")
    const promptPayload = slideshowTextGenerationPayload({
      automation: automation as never,
      model: clean(input.textModel) || undefined,
      selectedHook: requiredString(input.hook, "hook"),
      systemPrompt: clean(input.systemPrompt) || undefined,
      promptInstructions: clean(input.promptInstructions) || undefined,
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
        concepts: [],
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
        concepts: [],
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
    const deterministic = pool[0]
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
      violations: stringArray(input.violations),
      hookCandidates: automationHookItems(requiredSchema(input)).map(
        (item) => item.text
      ),
    }
    return mergePipelineOutput(input, { plan })
  })

  add("slideshow-generation.render-store-pngs", async (input, context) => {
    let state = input
    for (const stageId of [
      "slideshow-generation.prepare-png-render",
      "slideshow-generation.stage-render-assets",
      "slideshow-generation.render-all-slide-pngs",
      "slideshow-generation.list-render-output-files",
      "slideshow-generation.persist-render-output-files",
      "slideshow-generation.assemble-rendered-slideshow",
      "slideshow-generation.build-result-record",
      "slideshow-generation.persist-slideshow-result",
    ]) {
      state = (await context.runStage(stageId, state)).output
    }
    const slideshow = requiredRecord(
      state.renderedSlideshow,
      "renderedSlideshow"
    ) as unknown as SlideshowRecord
    const slides = requiredArray<Record<string, unknown>>(
      requiredRecord(input.plan, "plan").slides,
      "plan.slides"
    )
    const completed = mergePipelineOutput(state, {
      slideshowId: slideshow.id,
      resultId: requiredString(state.resultId, "resultId"),
      outputImages: slideshow.output_images,
      thumbnailUrl: slideshow.thumbnail_url,
      renderedSlides: slides.map((slide, index) => ({
        id: clean(slide.id),
        role: clean(slide.role),
        imageUrl: slideshow.output_images[index],
        text: clean(slide.text),
      })),
    })
    return (
      await context.runStage(
        "slideshow-generation.discard-png-render",
        completed
      )
    ).output
  })

  add(
    "slideshow-generation.find-result-for-slideshow",
    async (input, context) => {
      const slideshowId = requiredString(input.slideshowId, "slideshowId")
      let cursor: string | undefined
      do {
        const state = (
          await context.runStage("slideshow-generation.list-results-page", {
            ...input,
            cursor,
          })
        ).output
        const page = requiredRecord(state.storagePage, "storagePage")
        for (const item of requiredArray<Record<string, unknown>>(
          page.records,
          "storagePage.records",
          true
        )) {
          const record = requiredRecord(item.record, "result record")
          if (clean(asRecord(record.artifacts).slideshowId) !== slideshowId)
            continue
          const resultRowId = requiredString(item.rowId, "result row id")
          const media: OutputMediaDraft[] = []
          let mediaCursor: string | undefined
          do {
            const mediaState = (
              await context.runStage(
                "slideshow-generation.list-result-media-page",
                {
                  ...input,
                  resultId: clean(record.id),
                  resultRowId,
                  cursor: mediaCursor,
                }
              )
            ).output
            const mediaPage = requiredRecord(
              mediaState.resultMediaPage,
              "resultMediaPage"
            )
            media.push(
              ...requiredArray<Record<string, unknown>>(
                mediaPage.media,
                "resultMediaPage.media",
                true
              ).map((entry) => ({
                kind: clean(entry.kind) as OutputMediaDraft["kind"],
                role: clean(entry.role),
                position: numberValue(entry.position),
                url: clean(entry.url),
              }))
            )
            mediaCursor = clean(mediaPage.nextCursor) || undefined
          } while (mediaCursor)
          return mergePipelineOutput(input, {
            resultId: clean(record.id),
            resultRowId,
            resultRecord: hydrateOutputMedia("result", record, media),
          })
        }
        cursor = clean(page.nextCursor) || undefined
      } while (cursor)
      throw new Error("Rendered slideshow not found")
    }
  )

  add("slideshow-generation.initialize-video-preparation", async (input) => {
    const result = requiredRecord(
      input.resultRecord,
      "resultRecord"
    ) as unknown as ResultRecord
    const slideshowId = requiredString(
      asRecord(result.artifacts).slideshowId,
      "slideshowId"
    )
    const outputImages = stringArray(asRecord(result.artifacts).outputImages)
    if (!outputImages.length)
      throw new Error("Video export requires rendered PNG slides")
    const scratchDir = await mkdtemp(
      path.join(os.tmpdir(), "cfarm-slideshow-video-")
    )
    return mergePipelineOutput(input, {
      slideshowVideoPreparation: {
        slideshowId,
        resultId: result.id,
        resultRecord: result,
        resultRowId: input.resultRowId,
        scratchDir,
        durationSeconds:
          numberValue(asRecord(input.renderSettings).duration) ||
          numberValue(asRecord(asRecord(result.payload).settings).duration) ||
          5,
        videoUrl: `/api/local-assets/slideshows/outputs/${encodeURIComponent(slideshowId)}/slideshow-export.mp4`,
        thumbnailUrl: `/api/local-assets/slideshows/outputs/${encodeURIComponent(slideshowId)}/slideshow-thumbnail.png`,
        slideInputs: outputImages.map((url, index) => ({ index, url })),
        slideImagePaths: [],
      },
    })
  })

  add("slideshow-generation.read-one-video-slide", async (input, context) => {
    const preparation = requiredRecord(
      input.slideshowVideoPreparation,
      "slideshowVideoPreparation"
    )
    const slideInput = requiredRecord(input.videoSlideInput, "videoSlideInput")
    const url = requiredString(slideInput.url, "videoSlideInput.url")
    const pathname = new URL(url, "http://local").pathname
    const prefix = "/api/local-assets/"
    if (!pathname.startsWith(prefix))
      throw new Error("Unsupported rendered slide URL")
    const relativePath = decodeURIComponent(pathname.slice(prefix.length))
    const bytes = await context.externalCall(
      "Appwrite Storage getFileView",
      () =>
        readDomainAssetOnce({
          domain: "slideshow",
          ownerId: context.ownerId,
          relativePath,
        })
    )
    const localFilePath = path.join(
      requiredString(preparation.scratchDir, "scratchDir"),
      path.basename(pathname)
    )
    await writeFile(localFilePath, bytes)
    return mergePipelineOutput(input, {
      stagedVideoSlide: {
        index: numberValue(slideInput.index),
        localFilePath,
        fileName: path.basename(localFilePath),
      },
    })
  })

  add("slideshow-generation.stage-video-slides", async (input, context) => {
    const preparation = requiredRecord(
      input.slideshowVideoPreparation,
      "slideshowVideoPreparation"
    )
    const staged = requiredArray<Record<string, unknown>>(
      preparation.slideImagePaths,
      "slideImagePaths",
      true
    )
    for (const slideInput of requiredArray<Record<string, unknown>>(
      preparation.slideInputs,
      "slideInputs"
    )) {
      if (
        staged.some(
          (item) => numberValue(item.index) === numberValue(slideInput.index)
        )
      )
        continue
      const execution = await context.runStage(
        "slideshow-generation.read-one-video-slide",
        {
          ...input,
          slideshowVideoPreparation: {
            ...preparation,
            slideImagePaths: staged,
          },
          videoSlideInput: slideInput,
        }
      )
      staged.push(
        requiredRecord(execution.output.stagedVideoSlide, "stagedVideoSlide")
      )
    }
    return (
      await context.runStage("slideshow-generation.prepare-video-thumbnail", {
        ...input,
        slideshowVideoPreparation: {
          ...preparation,
          slideImagePaths: staged.map((item) =>
            requiredString(item.localFilePath, "slide path")
          ),
        },
        rendiLocalInputs: staged.map((item, index) => ({
          alias: `in_slide_${index + 1}`,
          localFilePath: requiredString(item.localFilePath, "slide path"),
          fileName:
            clean(item.fileName) ||
            path.basename(requiredString(item.localFilePath, "slide path")),
        })),
      })
    ).output
  })

  add("slideshow-generation.prepare-video-thumbnail", async (input) => {
    const preparation = requiredRecord(
      input.slideshowVideoPreparation,
      "slideshowVideoPreparation"
    )
    const slideImagePaths = stringArray(preparation.slideImagePaths)
    const first = requiredString(slideImagePaths[0], "first slide path")
    const thumbnailPath = path.join(
      requiredString(preparation.scratchDir, "scratchDir"),
      "slideshow-thumbnail.png"
    )
    await writeFile(thumbnailPath, await readFile(first))
    return mergePipelineOutput(input, {
      slideshowVideoPreparation: {
        ...preparation,
        thumbnailPath,
      },
    })
  })

  add("slideshow-generation.prepare-video-render", async (input, context) => {
    let state = input
    if (!isRecord(state.resultRecord))
      state = (
        await context.runStage(
          "slideshow-generation.find-result-for-slideshow",
          state
        )
      ).output
    state = (
      await context.runStage(
        "slideshow-generation.initialize-video-preparation",
        state
      )
    ).output
    return (
      await context.runStage("slideshow-generation.stage-video-slides", state)
    ).output
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

  add(
    "slideshow-generation.build-finalized-video-result",
    async (input, context) => {
      const preparation = requiredRecord(
        input.slideshowVideoPreparation,
        "slideshowVideoPreparation"
      )
      const current = requiredRecord(preparation.resultRecord, "resultRecord")
      const payload = requiredRecord(current.payload, "resultRecord.payload")
      const resultRecord: Record<string, unknown> = {
        ...current,
        updatedAt: services.now().toISOString(),
        artifacts: {
          ...requiredRecord(current.artifacts, "resultRecord.artifacts"),
          videoUrl: requiredString(input.videoUrl, "videoUrl"),
          thumbnailUrl: requiredString(input.thumbnailUrl, "thumbnailUrl"),
        },
        payload:
          payload.type === "slideshow"
            ? {
                ...payload,
                settings: {
                  ...requiredRecord(payload.settings, "payload.settings"),
                  export_as_video: true,
                },
              }
            : payload,
      }
      const prepared = preparePipelineDomainDocument({
        domain: "results",
        ownerId: context.ownerId,
        record: resultRecord,
      })
      return mergePipelineOutput(input, {
        resultRecord,
        resultId: clean(resultRecord.id),
        resultRowId: prepared.rowId,
        resultMedia: prepared.media,
      })
    }
  )

  add("slideshow-generation.finalize-video-render", async (input, context) => {
    let state = (
      await context.runStage(
        "slideshow-generation.build-finalized-video-result",
        input
      )
    ).output
    state = (
      await context.runStage(
        "slideshow-generation.update-result-document",
        state
      )
    ).output
    state = (
      await context.runStage("slideshow-generation.persist-result-media", state)
    ).output
    const preparation = requiredRecord(
      state.slideshowVideoPreparation,
      "slideshowVideoPreparation"
    )
    if (clean(preparation.thumbnailPath)) {
      await discardDownloadedImage(clean(preparation.thumbnailPath))
    }
    return mergePipelineOutput(state, {
      videoUrl: requiredString(state.videoUrl, "videoUrl"),
      thumbnailUrl: requiredString(state.thumbnailUrl, "thumbnailUrl"),
      videoProvider: "rendi",
      videoProcessor: "ffmpeg",
      operation: rendiOperation(
        clean(input.rendiCommandId) ||
          requiredString(preparation.slideshowId, "slideshowId"),
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
      generationSource:
        input.generationSource === "scheduled" ? "scheduled" : "manual",
      requestId: contextId(input),
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
    })
    return mergePipelineOutput(input, {
      qa,
      runRecord: run,
    })
  })

  add("slideshow-generation.upsert-automation-run", async (input, context) => {
    const runToPersist = requiredRecord(input.runToPersist, "runToPersist")
    let state = mergePipelineOutput(input, { runId: clean(runToPersist.id) })
    state = (
      await context.runStage(
        "slideshow-generation.get-automation-run-document",
        state
      )
    ).output
    state = (
      await context.runStage(
        state.automationRunDocument
          ? "slideshow-generation.update-automation-run-document"
          : "slideshow-generation.create-automation-run-document",
        state
      )
    ).output
    return mergePipelineOutput(state, { automationRunPersisted: true })
  })

  add("slideshow-generation.finalize-output", async (input, context) => {
    const plan = requiredRecord(input.plan, "plan")
    const runId = clean(input.runId) || contextId(input)
    const automationId = clean(asRecord(input.automation).id) || "standalone"
    const runRecord = requiredRecord(
      input.runRecord,
      "runRecord"
    ) as unknown as AutomationRunRecord
    await context.runStage("slideshow-generation.upsert-automation-run", {
      runToPersist: {
        ...runRecord,
        status: asRecord(input.qa).valid === false ? "failed" : "succeeded",
        slideshowId: clean(input.slideshowId) || undefined,
        outputImages: stringArray(input.outputImages),
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
      const fileName = path.basename(
        requiredString(input.tempBrollFileName, "tempBrollFileName")
      )
      const outputPath = path.join(
        process.cwd(),
        "data",
        "ugc-automations",
        "broll",
        fileName
      )
      await context.externalCall("Appwrite b-roll asset-file create", () =>
        persistPipelineTempFile({
          tempPath: requiredString(input.tempBrollPath, "tempBrollPath"),
          outputPath,
        })
      )
      const brollUrl = `/api/local-assets/ugc-automations/broll/${encodeURIComponent(fileName)}`
      return mergePipelineOutput(input, { brollUrl })
    }
  )

  add("ugc-video-generation.delete-one-broll-asset", async (input, context) => {
    const fileName = path.basename(
      requiredString(input.tempBrollFileName, "tempBrollFileName")
    )
    const outputPath = path.join(
      process.cwd(),
      "data",
      "ugc-automations",
      "broll",
      fileName
    )
    await context.externalCall("Appwrite b-roll asset-file delete", () =>
      deleteAssetFromAppwrite(outputPath)
    )
    return mergePipelineOutput(input, { deletedBrollAsset: fileName })
  })

  add("ugc-video-generation.discard-broll-temp-file", async (input) => {
    if (clean(input.tempBrollPath)) {
      await discardDownloadedImage(clean(input.tempBrollPath))
    }
    return mergePipelineOutput(input, {
      tempBrollPath: null,
      tempBrollFileName: null,
    })
  })

  add("ugc-video-generation.load-template-defaults", async (input, context) => {
    const templateId = clean(input.templateId)
    let templateDefaults: Record<string, unknown> = {}
    if (templateId) {
      const loaded = await context.runStage(
        "ugc-video-generation.get-saved-automation-document",
        { automationId: templateId }
      )
      const document = asRecord(loaded.output.savedAutomationDocument)
      const template = normalizedAutomationRecord(document.record)
      if (!template) throw new Error("UGC template was not found")
      const schema = template.schema
      if (clean(schema.automationKind) !== "ugc") {
        throw new Error("Selected template is not a UGC video template")
      }
      templateDefaults = asRecord(schema.ugc)
    }
    return {
      generation: {
        templateId: templateId || null,
        generationId: clean(input.generationId) || context.requestId,
        scheduledFor: clean(input.scheduledFor) || services.now().toISOString(),
      },
      templateDefaults,
      source: templateId ? "template_with_overrides" : "explicit_components",
    }
  })

  const resolveUgcComponent = (
    name: "product" | "script" | "actor" | "voice" | "broll" | "render",
    resolve: (
      override: Record<string, unknown>,
      defaults: Record<string, unknown>
    ) => Record<string, unknown>
  ) =>
    add(`ugc-video-generation.resolve-${name}-component`, async (input) => {
      const component = resolve(
        asRecord(input.override ?? input[name]),
        asRecord(input.templateDefaults)
      )
      return { generation: input.generation, component, componentRole: name }
    })

  resolveUgcComponent("product", (product, defaults) => {
    const component = compactRecord({
      url: firstPresent(product.url, defaults.productUrl),
      brief: firstPresent(product.brief, defaults.productBrief),
      analysis: firstPresent(product.analysis, defaults.analysis),
    })
    if (
      !clean(component.url) &&
      !clean(component.brief) &&
      !isRecord(component.analysis)
    ) {
      throw new Error("Product requires a URL, brief, or supplied analysis")
    }
    return component
  })
  resolveUgcComponent("script", (script, defaults) => {
    const duration = Math.max(
      15,
      Math.min(
        180,
        numberValue(
          firstPresent(
            script.targetDurationSeconds,
            defaults.targetDurationSeconds,
            60
          )
        ) || 60
      )
    )
    return compactRecord({
      plan: firstPresent(script.plan, defaults.scriptPlan),
      targetDurationSeconds: duration,
    })
  })
  resolveUgcComponent("actor", (actor, defaults) => {
    const source =
      clean(firstPresent(actor.source, defaults.actorSource)) || "generate"
    if (!["generate", "asset"].includes(source)) {
      throw new Error("Actor source must be generate or asset")
    }
    const component = compactRecord({
      source,
      assetUrl: firstPresent(actor.assetUrl, defaults.actorAssetUrl),
      prompt: firstPresent(actor.prompt, defaults.actorPrompt),
      motionPrompt: firstPresent(actor.motionPrompt, defaults.motionPrompt),
    })
    if (source === "asset" && !clean(component.assetUrl)) {
      throw new Error("Asset actor requires an asset URL")
    }
    return component
  })
  resolveUgcComponent("voice", (voice, defaults) => {
    const component = compactRecord({
      voiceId: firstPresent(voice.voiceId, defaults.voiceId),
      model: firstPresent(voice.model, defaults.voiceModel),
    })
    if (!clean(component.voiceId)) throw new Error("Voice requires a voice ID")
    return component
  })
  resolveUgcComponent("broll", (broll, defaults) => ({
    enabled: firstPresent(broll.enabled, defaults.brollEnabled, true) !== false,
    count: Math.max(
      0,
      Math.min(
        6,
        numberValue(firstPresent(broll.count, defaults.brollCount, 3)) || 0
      )
    ),
  }))
  resolveUgcComponent("render", (render, defaults) => {
    const aspectRatio =
      clean(firstPresent(render.aspectRatio, defaults.aspectRatio)) || "9:16"
    if (!["9:16", "1:1", "16:9"].includes(aspectRatio)) {
      throw new Error("Render aspect ratio is unsupported")
    }
    const lipSyncTier =
      clean(firstPresent(render.lipSyncTier, defaults.lipSyncTier)) ||
      "standard"
    if (!["standard", "premium"].includes(lipSyncTier)) {
      throw new Error("Lip-sync tier must be standard or premium")
    }
    return compactRecord({
      aspectRatio,
      lipSyncTier,
      captions: firstPresent(render.captions, defaults.captions),
      hookOverlay: firstPresent(render.hookOverlay, defaults.hookOverlay),
    })
  })

  add("ugc-video-generation.assemble-performance", async (input) => ({
    performance: {
      voice: requiredRecord(input.voice, "voice"),
      lipsync: requiredRecord(input.lipsync, "lipsync"),
    },
  }))

  add("ugc-video-generation.resolve-components", async (input, context) => {
    const loaded = await context.runStage(
      "ugc-video-generation.load-template-defaults",
      input
    )
    const supplied = asRecord(input.components)
    const components: Record<string, unknown> = {}
    for (const name of [
      "product",
      "script",
      "actor",
      "voice",
      "broll",
      "render",
    ] as const) {
      const resolved = await context.runStage(
        `ugc-video-generation.resolve-${name}-component`,
        {
          generation: loaded.output.generation,
          templateDefaults: loaded.output.templateDefaults,
          override: input[name] ?? supplied[name],
        }
      )
      components[name] = resolved.output.component
    }
    return {
      generation: loaded.output.generation,
      components,
      source: loaded.output.source,
    }
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
        try {
          state = (
            await context.runStage(
              "ugc-video-generation.persist-one-broll-asset",
              state
            )
          ).output
        } catch (error) {
          if (appwriteErrorCode(error) !== 409) throw error
          await context.runStage(
            "ugc-video-generation.delete-one-broll-asset",
            state
          )
          state = (
            await context.runStage(
              "ugc-video-generation.persist-one-broll-asset",
              state
            )
          ).output
        }
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
    if (input.componentExecution === true || clean(input.automationId))
      return requireNativeUgcComponentExecution(input, context, "analysis")
    if (isRecord(input.analysis)) {
      return mergePipelineOutput(input, {
        checkpoint: { stage: "analysis", status: "complete" },
      })
    }
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
    if (input.componentExecution === true || clean(input.automationId))
      return requireNativeUgcComponentExecution(input, context, "script")
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
    if (input.componentExecution === true || clean(input.automationId))
      return requireNativeUgcComponentExecution(input, context, "voice")
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
    if (input.componentExecution === true)
      return requireNativeUgcComponentExecution(input, context, "composite")
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
    return requireNativeUgcComponentExecution(input, context, "composite")
  })

  for (const [id, stage] of [
    ["ugc-video-generation.resolve-generate-actor", "actor"],
    ["ugc-video-generation.animate-actor", "motion"],
    ["ugc-video-generation.lip-sync-performance", "lipsync"],
    ["ugc-video-generation.generate-broll", "broll"],
  ] as const) {
    add(id, async (input, context) =>
      requireNativeUgcComponentExecution(input, context, stage)
    )
  }

  add("ugc-video-generation.store-final-output", async (input, context) => {
    if (input.componentExecution === true)
      return requireNativeUgcComponentExecution(input, context, "store")
    if (isRecord(input.finalOutput)) {
      return (
        await context.runStage(
          "ugc-video-generation.persist-final-output",
          input
        )
      ).output
    }
    return requireNativeUgcComponentExecution(input, context, "store")
  })

  const registerFixedVideoFormat = (input: {
    workflowId: "react-reveal-generation" | "greenscreen-meme-generation"
    format: FixedVideoFormat
    primaryRole: "anticipation" | "meme"
    secondaryRole: "reveal" | "background"
  }) => {
    const id = (name: string) => `${input.workflowId}.${name}`

    add(id("load-template-defaults"), async (state, context) => {
      const templateId = clean(state.templateId)
      let templateDefaults: Record<string, unknown> = {}
      if (templateId) {
        const loaded = await context.runStage(
          "ugc-video-generation.get-saved-automation-document",
          { automationId: templateId }
        )
        const document = asRecord(loaded.output.savedAutomationDocument)
        const template = normalizedAutomationRecord(document.record)
        if (!template) throw new Error("Video template was not found")
        const schema = template.schema
        const format = schema.video_format as AutomationVideoFormat
        const videoFormat = asRecord(format)
        if (
          clean(schema.automationKind) !== "video" ||
          clean(videoFormat.template) !== input.format
        ) {
          throw new Error(
            `Selected template is not a ${input.format.replaceAll("_", " ")} template`
          )
        }
        const collectionState = await context.runStage(
          "slideshow-generation.list-image-collections",
          {}
        )
        const [collections, mediaAssets] = await Promise.all([
          Promise.resolve(
            requiredArray<StoredImageCollection>(
              collectionState.output.collections,
              "collections"
            )
          ),
          context.externalCall("Media library read", listMediaLibraryAssets),
        ])
        const resolvedSegments: Record<string, unknown>[] = requiredArray<
          Record<string, unknown>
        >(videoFormat.segments, "video_format.segments", true).map(
          (segment) => {
            const mediaSource = clean(segment.mediaSource) || "collection"
            const collection = collections.find((candidate) =>
              [
                storedCollectionId(candidate),
                legacyStoredCollectionId(candidate),
                candidate.name,
              ].includes(clean(segment.collectionId))
            )
            const url =
              mediaSource === "demo_asset"
                ? mediaAssets.find(
                    (asset) => asset.id === clean(segment.demoAssetId)
                  )?.url
                : collection?.images.at(
                    Math.floor(Math.random() * collection.images.length)
                  )?.image_link
            return { ...segment, ...(url ? { url } : {}) }
          }
        )
        const generatedCopy = await context.runStage(
          "template-video-generation.generate-copy",
          { template }
        )
        const copy = asRecord(generatedCopy.output.copy)
        const hooks = automationHookItems(schema).filter((item) => item.enabled)
        const fallbackHook =
          clean(copy.hook) || clean(hooks[0]?.text) || clean(template.name)
        templateDefaults = {
          ...videoFormat,
          segments: resolvedSegments,
          hookCaption: fallbackHook,
          payoffCaption:
            generatedVideoTextForSegment(format, copy, 1) ||
            clean(resolvedSegments[1]?.guidance) ||
            fallbackHook,
          caption: fallbackHook,
          title: clean(copy.title) || fallbackHook || template.name,
          description: clean(copy.caption) || fallbackHook,
          hashtags: stringArray(copy.hashtags),
          audio: {
            url: clean(schema.tiktok_post_settings?.slideshow_sound_url),
          },
        }
      }
      return {
        generation: {
          templateId: templateId || null,
          outputId: clean(state.outputId) || context.requestId,
          createdAt: services.now().toISOString(),
        },
        templateDefaults,
        source: templateId ? "template_with_overrides" : "explicit_components",
      }
    })

    const addFixedResolver = (
      name: string,
      resolve: (
        override: Record<string, unknown>,
        defaults: Record<string, unknown>,
        state: Record<string, unknown>
      ) => Record<string, unknown>
    ) =>
      add(id(`resolve-${name}`), async (state) => ({
        generation: state.generation,
        componentRole: name,
        component: resolve(
          asRecord(state.override ?? state[name]),
          asRecord(state.templateDefaults),
          state
        ),
      }))

    const templateRole = (defaults: Record<string, unknown>, role: string) => {
      const direct = asRecord(defaults[role])
      if (Object.keys(direct).length) return direct
      const segments = requiredArray<Record<string, unknown>>(
        defaults.segments,
        "video_format.segments",
        true
      )
      const aliases =
        role === "anticipation"
          ? ["anticipation", "react-anticipation"]
          : role === "reveal"
            ? ["reveal", "react-reveal"]
            : role === "meme"
              ? ["meme", "greenscreen-meme"]
              : ["background", "greenscreen-background"]
      return asRecord(
        segments.find((segment) => aliases.includes(clean(segment.id)))
      )
    }

    for (const role of [input.primaryRole, input.secondaryRole]) {
      addFixedResolver(role, (override, defaults) => {
        const component = compactRecord({
          url: firstPresent(override.url, templateRole(defaults, role).url),
        })
        if (!clean(component.url)) {
          throw new Error(`${role} component requires a media URL`)
        }
        return component
      })
    }
    addFixedResolver("audio", (override, defaults, state) =>
      compactRecord({
        url: firstPresent(
          override.url,
          asRecord(defaults.audio).url,
          state.soundUrl
        ),
      })
    )
    addFixedResolver("caption", (override, defaults, state) =>
      input.format === "react_reveal"
        ? compactRecord({
            hookCaption: firstPresent(
              override.hookCaption,
              defaults.hookCaption,
              state.hookCaption
            ),
            payoffCaption: firstPresent(
              override.payoffCaption,
              defaults.payoffCaption,
              state.payoffCaption
            ),
          })
        : compactRecord({
            caption: firstPresent(
              override.caption,
              defaults.caption,
              state.caption
            ),
            textPlacement: firstPresent(
              override.textPlacement,
              defaults.textPlacement,
              state.textPlacement,
              "top"
            ),
          })
    )
    addFixedResolver("output", (override, defaults, state) => ({
      title: firstPresent(override.title, defaults.title, state.title),
      description: firstPresent(
        override.description,
        defaults.description,
        state.description
      ),
      hashtags: stringArray(
        firstPresent(override.hashtags, defaults.hashtags, state.hashtags, [])
      ),
    }))

    add(id("resolve-components"), async (state, context) => {
      const loaded = await context.runStage(id("load-template-defaults"), state)
      const supplied = asRecord(state.components)
      const components: Record<string, unknown> = {}
      for (const role of [
        input.primaryRole,
        input.secondaryRole,
        "audio",
        "caption",
        "output",
      ]) {
        const override =
          role === "caption"
            ? input.format === "react_reveal"
              ? {
                  hookCaption: firstPresent(
                    supplied.hookCaption,
                    state.hookCaption
                  ),
                  payoffCaption: firstPresent(
                    supplied.payoffCaption,
                    state.payoffCaption
                  ),
                }
              : {
                  caption: firstPresent(supplied.caption, state.caption),
                  textPlacement: firstPresent(
                    supplied.textPlacement,
                    state.textPlacement
                  ),
                }
            : role === "output"
              ? asRecord(state.output ?? supplied.output)
              : role === "audio"
                ? asRecord(state.audio ?? supplied.audio)
                : {
                    ...asRecord(state[role] ?? supplied[role]),
                    url: firstPresent(
                      asRecord(state[role] ?? supplied[role]).url,
                      role === "anticipation"
                        ? state.anticipationVideoUrl
                        : role === "reveal"
                          ? state.revealVideoUrl
                          : role === "meme"
                            ? state.memeVideoUrl
                            : state.backgroundImageUrl
                    ),
                  }
        const resolved = await context.runStage(id(`resolve-${role}`), {
          generation: loaded.output.generation,
          templateDefaults: loaded.output.templateDefaults,
          override,
          soundUrl: state.soundUrl,
        })
        const component = requiredRecord(
          resolved.output.component,
          `${role} component`
        )
        if (role === "caption" || role === "output") {
          Object.assign(components, component)
        } else {
          components[role] = component
        }
      }
      return {
        generation: loaded.output.generation,
        components,
        source: loaded.output.source,
      }
    })

    const addStageMedia = (role: string) =>
      add(id(`stage-${role}`), async (state, context) => {
        const sourceUrl = clean(asRecord(asRecord(state.components)[role]).url)
        if (!sourceUrl) {
          if (role === "audio") return mergePipelineOutput(state, {})
          throw new Error(`${role} component requires a media URL`)
        }
        const downloaded = await context.externalCall(
          `Download ${role} media`,
          () =>
            downloadRemoteFileToTemp({
              url: absoluteAssetUrl(sourceUrl),
              taskId: `${context.requestId}-${role}`,
              fallbackName: role,
              failureMessage: `Failed to download ${role} media`,
              extensionForContentType: (contentType) =>
                fixedVideoMediaExtension(role, contentType),
            })
        )
        return mergePipelineOutput(state, {
          stagedMedia: {
            ...asRecord(state.stagedMedia),
            [role]: downloaded,
          },
        })
      })

    addStageMedia(input.primaryRole)
    addStageMedia(input.secondaryRole)
    addStageMedia("audio")

    add(id("build-render-command"), async (state) =>
      mergePipelineOutput(state, buildFixedVideoRenderPlan(input.format, state))
    )

    add(id("render-store-output"), async (state, context) =>
      renderAndStoreRendiVideo(state, context, input.workflowId)
    )

    add(id("finalize-output"), async (state, context) => {
      const generation = requiredRecord(state.generation, "generation")
      const components = requiredRecord(state.components, "components")
      const outputId = requiredString(
        generation.outputId,
        "generation.outputId"
      )
      const now = services.now().toISOString()
      const finalOutput = {
        id: outputId,
        type:
          input.format === "greenscreen_meme"
            ? ("greenscreen" as const)
            : ("template_video" as const),
        status: "ready" as const,
        createdAt: clean(generation.createdAt) || now,
        updatedAt: now,
        title:
          clean(components.title) ||
          (input.format === "greenscreen_meme"
            ? "Greenscreen Meme"
            : "React & Reveal"),
        description:
          clean(components.description) ||
          clean(components.caption) ||
          clean(components.hookCaption),
        hashtags: stringArray(components.hashtags),
        sourceConfig: {
          format: input.format,
          templateId: clean(generation.templateId) || undefined,
          components,
          requestId: context.requestId,
        },
        sourceAutomationId: clean(generation.templateId) || undefined,
        previewUrl: requiredString(state.thumbnailUrl, "thumbnailUrl"),
        videoUrl: requiredString(state.videoUrl, "videoUrl"),
      }
      let current = (
        await context.runStage(
          "ugc-video-generation.prepare-final-output-document",
          { ...state, finalOutput }
        )
      ).output
      current = (
        await context.runStage(
          "ugc-video-generation.get-final-output-document",
          current
        )
      ).output
      current = (
        await context.runStage(
          current.finalOutputDocument
            ? "ugc-video-generation.update-final-output-document"
            : "ugc-video-generation.create-final-output-document",
          current
        )
      ).output
      current = (
        await context.runStage(
          "ugc-video-generation.persist-final-output-media",
          current
        )
      ).output
      return mergePipelineOutput(current, { finalOutput })
    })

    add(id("discard-staged-media"), async (state) => {
      for (const item of Object.values(asRecord(state.stagedMedia))) {
        const tempPath = clean(asRecord(item).tempPath)
        if (tempPath) await discardDownloadedTempFile(tempPath)
      }
      return mergePipelineOutput(state, { stagedMedia: {} })
    })
  }

  registerFixedVideoFormat({
    workflowId: "react-reveal-generation",
    format: "react_reveal",
    primaryRole: "anticipation",
    secondaryRole: "reveal",
  })
  registerFixedVideoFormat({
    workflowId: "greenscreen-meme-generation",
    format: "greenscreen_meme",
    primaryRole: "meme",
    secondaryRole: "background",
  })

  add("template-video-generation.load-template", async (state, context) => {
    const templateId = requiredString(state.templateId, "templateId")
    const loaded = await context.runStage(
      "ugc-video-generation.get-saved-automation-document",
      { automationId: templateId }
    )
    const template = normalizedAutomationRecord(
      asRecord(loaded.output.savedAutomationDocument).record
    )
    if (!template) throw new Error("Video template was not found")
    const format = template.schema?.video_format
    if (
      template.schema?.automationKind !== "video" ||
      !format ||
      ["ugc_ad", "react_reveal", "greenscreen_meme"].includes(format.template)
    ) {
      throw new Error("Selected template is not a generic video template")
    }
    return {
      generation: {
        templateId,
        outputId: clean(state.outputId) || context.requestId,
        createdAt: services.now().toISOString(),
      },
      template,
    }
  })

  add("template-video-generation.generate-copy", async (state, context) => {
    const template = requiredRecord(
      state.template,
      "template"
    ) as unknown as AutomationRecord
    const format = template.schema.video_format as AutomationVideoFormat
    const copy = await context.externalCall("Video copy generation", () =>
      generateVideoCopy({
        record: template,
        template: format.template,
        items: videoCopyItems(format),
        segmentRoles: format.segments.map((segment) => ({
          id: segment.id,
          label: segment.label,
          guidance: segment.guidance,
        })),
      })
    )
    return { generation: state.generation, copy }
  })

  add("template-video-generation.resolve-media", async (state, context) => {
    const template = requiredRecord(
      state.template,
      "template"
    ) as unknown as AutomationRecord
    const format = template.schema.video_format as AutomationVideoFormat
    const collectionState = await context.runStage(
      "slideshow-generation.list-image-collections",
      {}
    )
    const collections = requiredArray<StoredImageCollection>(
      collectionState.output.collections,
      "collections"
    )
    const mediaAssets = await context.externalCall(
      "Media library read",
      listMediaLibraryAssets
    )
    const resolvedMedia: Array<Record<string, unknown>> = []
    for (const segment of format.segments) {
      let media: Array<{ url: string; kind: "video" | "image" }> = []
      if (segment.mediaSource === "demo_asset") {
        const asset = mediaAssets.find(
          (candidate) => candidate.id === segment.demoAssetId
        )
        if (asset?.url) media = [{ url: asset.url, kind: "video" }]
      } else if (segment.mediaSource === "slideshow_automation") {
        const slideshowTemplateId = clean(segment.slideshowAutomationId)
        if (!slideshowTemplateId) {
          throw new Error(`Choose a slideshow template for "${segment.label}"`)
        }
        const slideshow = await runWindmillWorkflow({
          workflowId: "slideshow-generation",
          ownerId: context.ownerId,
          requestId: `${context.requestId}-${segment.id}`,
          workflowInput: {
            automationId: slideshowTemplateId,
            generationSource: "manual",
          },
        })
        const run = asRecord(slideshow.result.run)
        media = [
          ...requiredArray<Record<string, unknown>>(
            run.renderedSlides,
            "renderedSlides",
            true
          ).flatMap((slide) => {
            const url = clean(slide.imageUrl)
            return url ? [{ url, kind: "image" as const }] : []
          }),
          ...stringArray(run.outputImages).map((url) => ({
            url,
            kind: "image" as const,
          })),
        ].filter(
          (item, index, items) =>
            items.findIndex((candidate) => candidate.url === item.url) === index
        )
      } else {
        const collection = collections.find((candidate) =>
          [
            storedCollectionId(candidate),
            legacyStoredCollectionId(candidate),
            candidate.name,
          ].includes(clean(segment.collectionId))
        )
        if (
          collection &&
          (segment.mediaKind === "video"
            ? collection.mediaType === "video"
            : collection.mediaType !== "video")
        ) {
          media = collection.images.map((item) => ({
            url: item.image_link,
            kind: segment.mediaKind,
          }))
        }
      }
      if (media.length === 0) {
        throw new Error(
          `Choose a ${segment.mediaKind} source for "${segment.label}"`
        )
      }
      const count = videoSegmentPlaysFull(format, segment)
        ? 1
        : Math.max(1, segment.clipCount)
      for (let index = 0; index < count; index += 1) {
        const selected = media[index % media.length]
        resolvedMedia.push({
          key: `${segment.id}-${index}`,
          segmentId: segment.id,
          clipIndex: index,
          url: selected.url,
          kind: selected.kind,
          durationMs: segment.clipDurationMs,
          playFullVideo: videoSegmentPlaysFull(format, segment),
          transition: segment.transition,
          textItems: segment.textItems,
        })
      }
    }
    const soundId = clean(
      template.schema.tiktok_post_settings.slideshow_sound_id
    )
    const sound = mediaAssets.find((asset) => asset.id === soundId)
    return {
      generation: state.generation,
      resolvedMedia,
      audioUrl:
        sound?.url ||
        clean(template.schema.tiktok_post_settings.slideshow_sound_url) ||
        null,
    }
  })

  add("template-video-generation.assemble-components", async (state) => {
    const template = requiredRecord(
      state.template,
      "template"
    ) as unknown as AutomationRecord
    const format = template.schema.video_format as AutomationVideoFormat
    const copy = requiredRecord(state.copy, "copy")
    const generatedTexts = asRecord(copy.texts)
    const hookItemId =
      format.hookPlacement === "global"
        ? format.globalTextItems[0]?.id
        : format.segments[0]?.textItems[0]?.id
    const clips = requiredArray<Record<string, unknown>>(
      state.resolvedMedia,
      "resolvedMedia"
    ).map((clip) => ({
      ...clip,
      texts: resolveVideoTextItems(
        requiredArray<TextItem>(clip.textItems, "textItems", true),
        clean(hookItemId),
        clean(copy.hook),
        generatedTexts,
        numberValue(clip.clipIndex)
      ),
    }))
    return {
      generation: state.generation,
      components: {
        template: format.template,
        clips,
        globalTexts: resolveVideoTextItems(
          format.globalTextItems,
          clean(hookItemId),
          clean(copy.hook),
          generatedTexts,
          0
        ),
        audioUrl: clean(state.audioUrl) || null,
        hook: clean(copy.hook),
        title: clean(copy.title),
        description: clean(copy.caption),
        hashtags: stringArray(copy.hashtags),
      },
    }
  })

  add("template-video-generation.stage-one-media", async (state, context) => {
    const key = requiredString(state.key, "key")
    const kind = clean(state.kind) === "image" ? "image" : "video"
    const downloaded = await context.externalCall(
      "Download template media",
      () =>
        downloadRemoteFileToTemp({
          url: absoluteAssetUrl(requiredString(state.url, "url")),
          taskId: `${context.requestId}-${key}`,
          fallbackName: key,
          failureMessage: `Failed to download ${key}`,
          extensionForContentType: (contentType) =>
            fixedVideoMediaExtension(kind, contentType),
        })
    )
    return { key, downloaded }
  })

  add("template-video-generation.stage-media", async (state, context) => {
    const components = requiredRecord(state.components, "components")
    const clips = requiredArray<Record<string, unknown>>(
      components.clips,
      "components.clips"
    )
    const entries = await Promise.all(
      clips.map((clip) =>
        context.runStage("template-video-generation.stage-one-media", clip)
      )
    )
    const stagedMedia = Object.fromEntries(
      entries.map((entry) => [
        requiredString(entry.output.key, "staged key"),
        requiredRecord(entry.output.downloaded, "downloaded media"),
      ])
    )
    const audioUrl = clean(components.audioUrl)
    if (audioUrl) {
      const audio = await context.runStage(
        "template-video-generation.stage-one-media",
        { key: "audio", kind: "audio", url: audioUrl }
      )
      stagedMedia.audio = requiredRecord(
        audio.output.downloaded,
        "downloaded audio"
      )
    }
    return mergePipelineOutput(state, { stagedMedia })
  })

  add("template-video-generation.build-render-command", async (state) =>
    mergePipelineOutput(state, buildTemplateVideoRenderPlan(state))
  )

  add("template-video-generation.render-store-output", async (state, context) =>
    renderAndStoreRendiVideo(state, context, "template-video-generation")
  )

  add("template-video-generation.finalize-output", async (state, context) => {
    const generation = requiredRecord(state.generation, "generation")
    const components = requiredRecord(state.components, "components")
    const outputId = requiredString(generation.outputId, "generation.outputId")
    const now = services.now().toISOString()
    const finalOutput = {
      id: outputId,
      type: "template_video" as const,
      status: "ready" as const,
      createdAt: clean(generation.createdAt) || now,
      updatedAt: now,
      title: clean(components.title) || clean(components.hook) || "Video",
      description: clean(components.description) || clean(components.hook),
      hashtags: stringArray(components.hashtags),
      sourceConfig: {
        templateId: clean(generation.templateId),
        template: clean(components.template),
        hook: clean(components.hook),
        requestId: context.requestId,
      },
      sourceAutomationId: clean(generation.templateId),
      previewUrl: requiredString(state.thumbnailUrl, "thumbnailUrl"),
      videoUrl: requiredString(state.videoUrl, "videoUrl"),
    }
    let current = (
      await context.runStage(
        "ugc-video-generation.prepare-final-output-document",
        { ...state, finalOutput }
      )
    ).output
    current = (
      await context.runStage(
        "ugc-video-generation.get-final-output-document",
        current
      )
    ).output
    current = (
      await context.runStage(
        current.finalOutputDocument
          ? "ugc-video-generation.update-final-output-document"
          : "ugc-video-generation.create-final-output-document",
        current
      )
    ).output
    current = (
      await context.runStage(
        "ugc-video-generation.persist-final-output-media",
        current
      )
    ).output
    return mergePipelineOutput(current, { finalOutput })
  })

  add("template-video-generation.discard-staged-media", async (state) => {
    for (const item of Object.values(asRecord(state.stagedMedia))) {
      const tempPath = clean(asRecord(item).tempPath)
      if (tempPath) await discardDownloadedTempFile(tempPath)
    }
    return mergePipelineOutput(state, { stagedMedia: {} })
  })

  add("linkedin-generation.normalize-audience-topic", async (input) => ({
    audience: {
      niche: requiredString(input.niche, "niche"),
      topic: clean(input.topic) || null,
      excludedTopics: stringArray(input.excludedTopics),
    },
  }))

  add("linkedin-generation.normalize-voice-proof", async (input) => ({
    voiceProof: {
      persona: input.persona === "practitioner" ? "practitioner" : "educator",
      proof: stringArray(input.proof),
      archetypeId: clean(input.archetypeId) || null,
      hookStyleId: clean(input.hookStyleId) || null,
      pillar: clean(input.pillar) || null,
      model: clean(input.model) || "openai/gpt-5.6-luna",
    },
  }))

  add("linkedin-generation.normalize-brief-controls", async (input) => {
    if (
      input.brief !== undefined &&
      input.brief !== null &&
      !isRecord(input.brief)
    ) {
      throw new Error("brief must be a JSON object")
    }
    return {
      briefControls: {
        brief: isRecord(input.brief) ? input.brief : null,
        briefModel: clean(input.briefModel) || "google/gemini-3.1-flash-lite",
      },
    }
  })

  add("linkedin-generation.normalize-batch-controls", async (input) => ({
    batchControls: {
      count: Math.max(1, Math.min(4, numberValue(input.count) || 1)),
    },
  }))

  add("linkedin-generation.validate-input", async (input) => {
    const audience = asRecord(input.audience)
    const voiceProof = asRecord(input.voiceProof)
    const briefControls = asRecord(input.briefControls)
    const batchControls = asRecord(input.batchControls)
    const niche = requiredString(audience.niche ?? input.niche, "niche")
    const persona =
      (voiceProof.persona ?? input.persona) === "practitioner"
        ? "practitioner"
        : "educator"
    return {
      normalizedInput: {
        niche,
        brief: isRecord(briefControls.brief)
          ? briefControls.brief
          : isRecord(input.brief)
            ? input.brief
            : null,
        persona,
        archetypeId: clean(voiceProof.archetypeId ?? input.archetypeId) || null,
        hookStyleId: clean(voiceProof.hookStyleId ?? input.hookStyleId) || null,
        pillar: clean(voiceProof.pillar ?? input.pillar) || null,
        topic: clean(audience.topic ?? input.topic) || null,
        excludedTopics: stringArray(
          audience.excludedTopics ?? input.excludedTopics
        ),
        proof: stringArray(voiceProof.proof ?? input.proof),
        count: Math.max(
          1,
          Math.min(4, numberValue(batchControls.count ?? input.count) || 1)
        ),
        briefModel:
          clean(briefControls.briefModel ?? input.briefModel) ||
          "google/gemini-3.1-flash-lite",
        model: clean(voiceProof.model ?? input.model) || "openai/gpt-5.6-luna",
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

  add("x-threads-generation.load-template", async (input, context) => {
    const automationId = requiredString(input.automationId, "automationId")
    const state = await context.runStage(
      "x-threads-generation.get-automation-document",
      { automationId }
    )
    const automation = isRecord(state.output.xAutomationDocument)
      ? (asRecord(state.output.xAutomationDocument)
          .record as unknown as XAutomationRecord)
      : null
    if (!automation) throw new Error("X/Threads template not found")
    if (
      !automation.platform ||
      !["x", "threads"].includes(automation.platform)
    ) {
      throw new Error("Selected template is not an X/Threads template")
    }
    return { automationId, automation }
  })

  add("x-threads-generation.normalize-run-input", async (input) => ({
    runInput: {
      topic: clean(input.topic),
      sourceCandidate: isRecord(input.sourceCandidate)
        ? input.sourceCandidate
        : null,
      deriveBrief: input.deriveBrief !== false,
    },
  }))

  add("x-threads-generation.validate-input", async (input, context) => {
    let state = input
    if (clean(input.automationId) && !isRecord(input.automation)) {
      state = (
        await context.runStage("x-threads-generation.load-template", input)
      ).output
    }
    const automation = isRecord(state.automation)
      ? (state.automation as unknown as XAutomationRecord)
      : isRecord(state.xAutomationDocument)
        ? (asRecord(state.xAutomationDocument)
            .record as unknown as XAutomationRecord)
        : null
    if (!automation) throw new Error("X/Threads automation not found")
    const runInput = asRecord(input.runInput)
    return mergePipelineOutput(state, {
      automation,
      topic: clean(runInput.topic ?? input.topic),
      sourceCandidate: isRecord(runInput.sourceCandidate)
        ? runInput.sourceCandidate
        : isRecord(input.sourceCandidate)
          ? input.sourceCandidate
          : null,
      deriveBrief:
        runInput.deriveBrief !== false && input.deriveBrief !== false,
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
    let state = (
      await context.runStage("x-threads-generation.prepare-run-document", input)
    ).output
    state = (
      await context.runStage("x-threads-generation.get-run-document", state)
    ).output
    state = (
      await context.runStage(
        state.xRunDocument
          ? "x-threads-generation.update-run-document"
          : "x-threads-generation.create-run-document",
        state
      )
    ).output
    state = (
      await context.runStage("x-threads-generation.persist-run-media", state)
    ).output
    return mergePipelineOutput(state, {
      persistedRun: clean(asRecord(state.run).id),
    })
  })

  add("x-threads-generation.prepare-run-document", async (input, context) => {
    const run = requiredRecord(input.run, "run")
    const prepared = preparePipelineDomainDocument({
      domain: "social-template-runs",
      ownerId: context.ownerId,
      record: run,
    })
    return mergePipelineOutput(input, {
      runId: clean(run.id),
      runRowId: prepared.rowId,
      runMedia: prepared.media,
    })
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
    const delivery = await context.externalCall(
      "Telegram generated reminder",
      () =>
        services.sendGeneratedReminder(
          `Post generated\n${run.hook || automation.name}`
        )
    )
    return mergePipelineOutput(input, {
      reminderEnqueued: delivery.sent,
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
    let state = (
      await context.runStage(
        "x-threads-generation.build-usage-memory-update",
        input
      )
    ).output
    const updatedAutomation = requiredRecord(
      state.automation,
      "automation"
    ) as unknown as XAutomationRecord
    state = (
      await context.runStage(
        "x-threads-generation.get-automation-document",
        state
      )
    ).output
    state = (
      await context.runStage(
        state.xAutomationDocument
          ? "x-threads-generation.update-automation-document"
          : "x-threads-generation.create-automation-document",
        state
      )
    ).output
    return mergePipelineOutput(state, { automation: updatedAutomation })
  })

  add("x-threads-generation.build-usage-memory-update", async (input) => {
    const automation = requiredRecord(
      input.automation,
      "automation"
    ) as unknown as XAutomationRecord
    const run = requiredRecord(input.run, "run") as unknown as XAutomationRun
    const updatedAutomation = buildXAutomationUsageUpdate({ automation, run })
    return mergePipelineOutput(input, {
      automation: updatedAutomation,
      automationId: updatedAutomation.id,
    })
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
    const fileName = path.basename(
      requiredString(input.tempImageFileName, "tempImageFileName")
    )
    const outputPath = path.join(
      process.cwd(),
      "data",
      "social-templates",
      "images",
      fileName
    )
    await context.externalCall("Appwrite asset-file create", () =>
      persistPipelineTempFile({
        tempPath: requiredString(input.tempImagePath, "tempImagePath"),
        outputPath,
      })
    )
    const imageUrl = `/api/local-assets/x-automations/images/${encodeURIComponent(fileName)}`
    return mergePipelineOutput(input, { imageUrl })
  })

  add("x-threads-generation.delete-image-asset", async (input, context) => {
    const fileName = path.basename(
      requiredString(input.tempImageFileName, "tempImageFileName")
    )
    const outputPath = path.join(
      process.cwd(),
      "data",
      "social-templates",
      "images",
      fileName
    )
    await context.externalCall("Appwrite asset-file delete", () =>
      deleteAssetFromAppwrite(outputPath)
    )
    return mergePipelineOutput(input, { deletedImageAsset: fileName })
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
    const attached = (
      await context.runStage("x-threads-generation.attach-image-to-run", input)
    ).output
    const state = (
      await context.runStage("x-threads-generation.persist-run", attached)
    ).output
    return mergePipelineOutput(state, {
      provider: "KIE.ai",
      model: "nano-banana-pro",
      providerRequestId: input.providerTaskId,
    })
  })

  add("x-threads-generation.attach-image-to-run", async (input) => {
    const run = requiredRecord(input.run, "run") as unknown as XAutomationRun
    const imageUrl = requiredString(input.imageUrl, "imageUrl")
    const updated = {
      ...run,
      imageUrls: [...run.imageUrls, imageUrl].slice(0, 4),
      updatedAt: services.now().toISOString(),
    }
    return mergePipelineOutput(input, {
      run: updated,
      imageUrl,
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
      try {
        state = (
          await context.runStage(
            "x-threads-generation.persist-image-asset",
            state
          )
        ).output
      } catch (error) {
        if (appwriteErrorCode(error) !== 409) throw error
        await context.runStage("x-threads-generation.delete-image-asset", state)
        state = (
          await context.runStage(
            "x-threads-generation.persist-image-asset",
            state
          )
        ).output
      }
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
  return new Map(
    PIPELINE_STAGE_CATALOG.map((metadata) => [
      metadata.id,
      handlers.get(metadata.id)!,
    ])
  )
}

async function renderAndStoreRendiVideo(
  input: Record<string, unknown>,
  context: PipelineStageContext,
  workflowId:
    | "react-reveal-generation"
    | "greenscreen-meme-generation"
    | "template-video-generation"
) {
  const stageId = (name: string) => `${workflowId}.${name}`
  const localInputs = requiredArray<Record<string, unknown>>(
    input.rendiLocalInputs,
    "rendiLocalInputs"
  )
  const uploads = Array.isArray(input.rendiUploads)
    ? ([...input.rendiUploads] as Record<string, unknown>[])
    : localInputs.map(() => ({}))
  let current = input
  const deadline = Date.now() + 15 * 60_000

  for (const [index, localInput] of localInputs.entries()) {
    while (!clean(asRecord(uploads[index]).storageUrl)) {
      if (Date.now() >= deadline) throw new Error("Rendi upload timed out")
      const execution = await context.runStage(stageId("rendi-upload-file"), {
        ...current,
        localFilePath: localInput.localFilePath,
        rendiFileName: localInput.fileName,
        rendiUpload: uploads[index] ?? {},
      })
      uploads[index] = requiredRecord(
        execution.output.rendiUpload,
        "rendiUpload"
      )
      current = mergePipelineOutput(current, {
        rendiUploads: uploads,
        operation: execution.output.operation,
      })
      if (!clean(asRecord(uploads[index]).storageUrl)) {
        await pipelineDelay(1500)
      }
    }
    await context.runStage(stageId("rendi-discard-temp"), {
      uploadSessionPath: asRecord(uploads[index]).uploadSessionPath,
    })
  }

  current = mergePipelineOutput(current, {
    rendiCommandRequest: {
      ...requiredRecord(current.rendiCommandRequest, "rendiCommandRequest"),
      inputFiles: Object.fromEntries(
        localInputs.map((localInput, index) => [
          requiredString(localInput.alias, `rendiLocalInputs.${index}.alias`),
          requiredString(
            asRecord(uploads[index]).storageUrl,
            `rendiUploads.${index}.storageUrl`
          ),
        ])
      ),
    },
  })
  if (!clean(current.rendiCommandId)) {
    current = (await context.runStage(stageId("rendi-submit-command"), current))
      .output
  }
  while (!Object.keys(asRecord(current.rendiOutputUrls)).length) {
    if (Date.now() >= deadline) throw new Error("Rendi render timed out")
    await pipelineDelay(2000)
    current = (await context.runStage(stageId("rendi-get-command"), current))
      .output
  }

  const persisted = { ...asRecord(current.rendiPersistedOutputs) }
  for (const [index, outputSpec] of requiredArray<Record<string, unknown>>(
    current.rendiOutputSpecs,
    "rendiOutputSpecs"
  ).entries()) {
    const alias = requiredString(
      outputSpec.alias,
      `rendiOutputSpecs.${index}.alias`
    )
    if (clean(persisted[alias])) continue
    const downloaded = await context.runStage(
      stageId("rendi-download-output"),
      {
        ...current,
        remoteOutputUrl: requiredString(
          asRecord(current.rendiOutputUrls)[alias],
          `rendiOutputUrls.${alias}`
        ),
        outputFileName: requiredString(
          outputSpec.fileName,
          `rendiOutputSpecs.${index}.fileName`
        ),
      }
    )
    const saved = await context.runStage(stageId("rendi-persist-output"), {
      ...downloaded.output,
      outputId: requiredString(
        asRecord(current.generation).outputId,
        "generation.outputId"
      ),
      outputKind: requiredString(
        outputSpec.outputKind,
        `rendiOutputSpecs.${index}.outputKind`
      ),
    })
    persisted[alias] = saved.output.persistedRendiOutputUrl
    current = mergePipelineOutput(saved.output, {
      rendiPersistedOutputs: persisted,
    })
    current = mergePipelineOutput(
      current,
      (await context.runStage(stageId("rendi-discard-temp"), current)).output
    )
  }
  return mergePipelineOutput(current, {
    videoUrl: persisted["output.mp4"],
    thumbnailUrl: persisted["thumbnail.jpg"],
    operation: rendiOperation(
      requiredString(current.rendiCommandId, "rendiCommandId"),
      `${workflowId}.rendi.command`,
      "succeeded"
    ),
  })
}

function videoCopyItems(format: AutomationVideoFormat) {
  return [
    ...format.globalTextItems.map((item) => ({
      item,
      segmentLabel: "Persistent text",
      guidance: "",
      count: 1,
    })),
    ...format.segments.flatMap((segment) =>
      segment.textItems.map((item) => ({
        item,
        segmentLabel: segment.label,
        guidance: segment.guidance,
        count:
          segment.mediaSource !== "demo_asset" &&
          !videoSegmentPlaysFull(format, segment)
            ? segment.clipCount
            : 1,
      }))
    ),
  ]
    .filter(
      ({ item }) => item.textMode !== "static" && Boolean(item.contentDirection)
    )
    .map(({ item, segmentLabel, guidance, count }) => ({
      id: item.id,
      segmentLabel,
      guidance,
      contentDirection: item.contentDirection,
      wordLengthMin: item.wordLengthMin,
      wordLengthMax: item.wordLengthMax,
      count,
    }))
}

function resolveVideoTextItems(
  items: TextItem[],
  hookItemId: string,
  hook: string,
  generated: Record<string, unknown>,
  clipIndex: number
) {
  return items.map((item) => {
    const value = generated[item.id]
    const generatedText = Array.isArray(value)
      ? clean(value[clipIndex % value.length] ?? value[0])
      : clean(value)
    return {
      ...item,
      text:
        item.textMode === "static" && item.staticText
          ? item.staticText
          : generatedText ||
            (item.id === hookItemId ? hook : item.contentDirection) ||
            "",
    }
  })
}

function generatedVideoTextForSegment(
  format: AutomationVideoFormat,
  copy: Record<string, unknown>,
  segmentIndex: number
) {
  const generated = asRecord(copy.texts)
  for (const item of format.segments[segmentIndex]?.textItems ?? []) {
    const value = generated[item.id]
    const text = Array.isArray(value) ? clean(value[0]) : clean(value)
    if (text) return text
  }
  return ""
}

function pipelineDelay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function requireNativeUgcComponentExecution(
  _input: Record<string, unknown>,
  _context: PipelineStageContext,
  _stopAfter: string
) {
  throw new Error(
    "UGC component execution must run through the native Windmill runtime"
  )
}

function requiredSchema(input: Record<string, unknown>) {
  return requiredRecord(input.schema, "schema") as unknown as AutomationSchema
}

function normalizedAutomationRecord(value: unknown) {
  return isRecord(value)
    ? normalizeAutomationRecord(value as unknown as AutomationRecord)
    : null
}

function buildXAutomationUsageUpdate(input: {
  automation: XAutomationRecord
  run: XAutomationRun
}) {
  const usedAt = input.run.createdAt
  return {
    ...input.automation,
    usage: {
      recentArchetypes: [
        ...input.automation.usage.recentArchetypes,
        ...(input.run.plans ?? []).map((plan) => ({
          id: plan.archetype,
          at: usedAt,
        })),
      ].slice(-100),
      recentHooks: [
        ...input.automation.usage.recentHooks,
        ...(input.run.plans ?? []).map((plan) => plan.hookStyle),
      ].slice(-30),
      recentBodies: [
        ...input.automation.usage.recentBodies,
        ...(input.run.platform === "threads" && input.run.posts[0]
          ? [
              {
                body:
                  input.run.posts[0].text
                    .split(/\n\s*\n/)
                    .slice(1)
                    .join("\n\n") || input.run.posts[0].text,
                hook: input.run.posts[0].text.split(/\n/)[0] || input.run.hook,
                at: usedAt,
              },
            ]
          : []),
      ].slice(-100),
    },
  }
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

function firstPresent(...values: unknown[]) {
  return values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      !(typeof value === "string" && value.trim() === "")
  )
}

function compactRecord(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  )
}

function contextId(input: Record<string, unknown>) {
  return clean(input.requestId) || `pipeline-${crypto.randomUUID()}`
}

function requiredRendiApiKey() {
  const apiKey = getRendiApiKey()
  if (!apiKey) throw new Error("RENDI_API_KEY is not configured")
  return apiKey
}

function fixedVideoMediaExtension(role: string, contentType: string) {
  const normalized = contentType.toLowerCase()
  if (normalized.includes("webm")) return ".webm"
  if (normalized.includes("quicktime")) return ".mov"
  if (normalized.includes("png")) return ".png"
  if (normalized.includes("webp")) return ".webp"
  if (normalized.includes("jpeg")) return ".jpg"
  if (normalized.includes("wav")) return ".wav"
  if (normalized.includes("mpeg") && role === "audio") return ".mp3"
  if (normalized.includes("mp4") || normalized.includes("video")) return ".mp4"
  return role === "background" ? ".jpg" : role === "audio" ? ".mp3" : ".mp4"
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
  workflowId:
    | "slideshow-generation"
    | "ugc-video-generation"
    | "react-reveal-generation"
    | "greenscreen-meme-generation"
    | "template-video-generation",
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
  if (
    workflowId === "react-reveal-generation" ||
    workflowId === "greenscreen-meme-generation" ||
    workflowId === "template-video-generation"
  ) {
    const outputId = safePathSegment(requiredString(input.outputId, "outputId"))
    const fileName =
      kind === "video"
        ? "video.mp4"
        : kind === "thumbnail"
          ? "thumbnail.jpg"
          : ""
    if (!fileName) throw new Error("Unsupported video-format output kind")
    return {
      kind,
      outputPath: path.join(
        process.cwd(),
        "data",
        "generated-videos",
        "outputs",
        ownerScope,
        outputId,
        fileName
      ),
      publicUrl: `/api/local-assets/generated-videos/outputs/${ownerScope}/${encodeURIComponent(outputId)}/${fileName}`,
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

function requiredTempPath(value: unknown, prefix: string) {
  const resolved = path.resolve(requiredString(value, "localPath"))
  const tempRoot = path.resolve(os.tmpdir())
  if (
    !resolved.startsWith(`${tempRoot}${path.sep}`) ||
    !path.basename(resolved).startsWith(prefix)
  ) {
    throw new Error("Unsupported pipeline temp path")
  }
  return resolved
}

function requiredSlideshowScratchFile(value: unknown) {
  const resolved = path.resolve(requiredString(value, "localPath"))
  const tempRoot = path.resolve(os.tmpdir())
  if (
    !resolved.startsWith(`${tempRoot}${path.sep}`) ||
    !path.basename(path.dirname(resolved)).startsWith("cfarm-slideshow-")
  ) {
    throw new Error("Unsupported slideshow scratch file")
  }
  return resolved
}

function appwriteErrorCode(error: unknown): number {
  if (!isRecord(error)) return 0
  const direct = Number(error.code)
  if (Number.isFinite(direct)) return direct
  return appwriteErrorCode(error.cause)
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
