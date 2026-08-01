// Appwrite adapters for scheduled slideshow storage, rendering, and publishing.
// Hook expansion, text generation/validation/research, and image selection run
// through the generated slideshow-generation-engine.js shared with the app.
import crypto from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { Query } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

import {
  defaultSlideshowAspectRatio,
  defaultSlideshowFont,
} from "./slideshow-renderer.js"
import { renderSlideshowSlideBuffers } from "./slideshow-raster-renderer.js"
import { configureFontconfig } from "./font-config.js"
import {
  generateSlideshowText,
  selectSlideshowHook,
  selectSlideshowImages,
} from "./slideshow-generation-engine.js"
import { postfastRequest } from "./postfast-client.js"
import { translateTextsWithDeepL } from "./deepl-translate.js"
import { deeplTargetLanguage } from "./slideshow-publishing-config.js"
import {
  applyHookCase,
  automationHookItems,
  automationHooks,
  resolveSlideshowCaption,
  resolveSlideshowHashtags,
  selectedBodySlideCount,
  slideSpecs,
  slideshowMetadataPromptInstructions,
  slideshowStructurePromptInstructions,
  slideshowRunId,
  textItemsForSpec,
} from "./slideshow-plan-core.js"
import {
  buildPublicationRecord,
  effectivePostingMode,
  postFastSchedulePayload,
  publicationRecordSummary,
} from "./publishing-core.js"
import { usageForPublishedRuns } from "./usage-core.js"
import { validateAutomationRunOutput } from "./automation-output-qa.js"
import {
  runRendiFfmpegAndDownloadBytes,
  uploadBytesToRendi,
} from "./rendi-client.js"
import { openRouterModelForUseCase } from "./realfarm-generation-model-registry.js"
import { normalizeLlmPunctuation } from "./llm-slop.js"

// Point fontconfig at the bundled TTF before the first sharp() SVG raster.
// The Appwrite node-22 (Alpine) runtime ships no fonts and no default
// fontconfig config, so without this every <text> glyph renders as .notdef
// tofu. Resolved at startup so the absolute path matches this deployment.
configureFontconfig(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "assets",
    "fonts"
  )
)

const AUTOMATIONS = "automations"
const RUNS = "automation_runs"
const OUTPUTS = "outputs"
const OUTPUT_MEDIA = "output_media"
const PERMANENT_ASSETS = "permanent_assets"
const USAGE = "usage_ledger"
const JOBS = "jobs"
const SLIDESHOW_BUCKET = "slideshows"
// Operational escape hatch: pin a cheaper model while debugging a broken
// pipeline. Unset the variable and the registry default applies again.
const fallbackTextModel =
  process.env.SLIDESHOW_TEXT_MODEL || openRouterModelForUseCase("slideshowText")
const PAGE = 100

export async function runSlideshowAutomation({
  payload,
  tables,
  storage,
  job,
  databaseId,
}) {
  const automationId = clean(payload?.automationId)
  const scheduledFor = validIso(payload?.scheduledFor)
  const ownerId = clean(job?.owner_id) || clean(payload?.ownerId)
  if (!automationId || !scheduledFor || !ownerId) {
    throw new Error(
      "run-automation requires automationId, ownerId, and scheduledFor"
    )
  }

  const runId = slideshowRunId(automationId, scheduledFor)
  const runRowId = ownedRowId(RUNS, ownerId, runId)
  const existing = await getStoredRecord(tables, databaseId, RUNS, runRowId)
  if (
    existing &&
    ["posted", "awaiting-manual-post", "ready-for-review"].includes(
      existing.status
    )
  ) {
    return { runId, created: false, status: existing.status, deduped: true }
  }

  const acceptedAt = existing?.createdAt || new Date().toISOString()
  let run = {
    ...existing,
    id: runId,
    automationId,
    automationTitle: existing?.automationTitle || automationId,
    scheduledFor,
    ownerId,
    status: "accepted",
    createdAt: acceptedAt,
    updatedAt: new Date().toISOString(),
    claimedAt: new Date().toISOString(),
    claimedBy: "appwrite-job-worker",
    error: undefined,
  }
  await upsertStoredRecord(tables, databaseId, RUNS, ownerId, run)

  try {
    const automation = await findAutomation(
      tables,
      databaseId,
      automationId,
      ownerId
    )
    run = {
      ...run,
      automationTitle: clean(automation.schema?.title) || automation.name,
      status: "generating",
      updatedAt: new Date().toISOString(),
    }
    await upsertStoredRecord(tables, databaseId, RUNS, ownerId, run)
    const context = await loadGenerationContext({
      tables,
      databaseId,
      ownerId,
      automation,
    })
    const plan = await createPlan({
      automation,
      scheduledFor,
      runId,
      ...context,
    })
    const slideshow = await renderAndStoreSlideshow({
      storage,
      automation,
      ownerId,
      runId,
      plan,
    })
    const result = resultRecord({
      automation,
      ownerId,
      runId,
      plan,
      slideshow,
    })
    await upsertResultOutput(tables, databaseId, ownerId, result)

    run = {
      ...run,
      status: "generated",
      plan,
      slideshowId: slideshow.id,
      outputImages: slideshow.outputImages,
      outputDir: slideshow.outputDir,
      videoUrl: slideshow.videoUrl,
      thumbnailUrl: slideshow.thumbnailUrl,
      renderedSlides: slideshow.renderedSlides,
      updatedAt: new Date().toISOString(),
    }
    await upsertStoredRecord(tables, databaseId, RUNS, ownerId, run)
    await enqueueNotification({
      tables,
      databaseId,
      ownerId,
      event: "generated",
      sourceType: "slideshow",
      sourceId: slideshow.id,
      runId,
      text: `Slideshow generated\n${plan.title}\n${plan.hook}`,
    })

    const activeIntegrations = (
      automation.schema.social_integrations || []
    ).filter(
      (integration) =>
        clean(integration.integration_id) && !integration.disabled
    )
    const content = publishContent(plan)
    const mode = effectivePostingMode(automation.schema)
    const outputQa = validateAutomationRunOutput({
      run: { ...run, status: "succeeded", plan },
      schema: automation.schema,
    })
    let media = []
    if (activeIntegrations.length) {
      media = await uploadPostFastMedia(
        slideshow.videoBuffer
          ? [
              {
                bytes: slideshow.videoBuffer,
                contentType: "video/mp4",
                type: "VIDEO",
              },
            ]
          : slideshow.renderedBuffers.map((bytes) => ({
              bytes,
              contentType: "image/png",
              type: "IMAGE",
            }))
      )
    }

    if (shouldBlockAutomaticPublication(mode, outputQa)) {
      await enqueueNotification({
        tables,
        databaseId,
        ownerId,
        event: "ready_to_post",
        sourceType: "slideshow",
        sourceId: slideshow.id,
        runId,
        scheduledFor,
        availableAt: scheduledFor,
        requiresPostConfirmation: true,
        text: `Slideshow blocked by QA\n${plan.title}\n${outputQa.findings
          .filter((finding) => finding.severity === "error")
          .map((finding) => finding.message)
          .join("\n")}`,
      })
      run = {
        ...run,
        status: "ready-for-review",
        qa: outputQa,
        socialStatuses: [],
        updatedAt: new Date().toISOString(),
      }
    } else if (mode === "auto") {
      const publishing = await publishScheduledPosts({
        tables,
        databaseId,
        ownerId,
        runId,
        integrations: activeIntegrations,
        scheduledFor,
        content,
        media,
        schema: automation.schema,
      })
      if (publishing.failed > 0) {
        throw new Error(
          `PostFast scheduling failed for ${publishing.failed} integration(s)`
        )
      }
      if (publishing.published > 0) {
        await enqueueNotification({
          tables,
          databaseId,
          ownerId,
          event: "scheduled_to_post",
          sourceType: "slideshow",
          sourceId: slideshow.id,
          runId,
          scheduledFor,
          text: `Slideshow scheduled to post\n${plan.title}\nScheduled for ${scheduledFor}`,
        })
      }
      run = {
        ...run,
        status: activeIntegrations.length ? "posted" : "generated",
        socialStatuses: publishing.records.map(socialStatus),
        updatedAt: new Date().toISOString(),
      }
    } else {
      const postStatus =
        mode === "review" ? "ready_for_review" : "awaiting_manual_post"
      const records = []
      for (const integration of activeIntegrations) {
        records.push(
          await upsertPostRecord({
            tables,
            databaseId,
            ownerId,
            runId,
            integration,
            status: postStatus,
            scheduledFor,
            content,
            media,
          })
        )
      }
      await enqueueNotification({
        tables,
        databaseId,
        ownerId,
        event: "ready_to_post",
        sourceType: "slideshow",
        sourceId: slideshow.id,
        scheduledFor,
        availableAt: scheduledFor,
        requiresPostConfirmation: true,
        text:
          mode === "review"
            ? `Slideshow ready for review\n${content}\nSlideshow: ${slideshow.id}`
            : `Manual post ready\n${content}\nSlideshow: ${slideshow.id}`,
      })
      run = {
        ...run,
        status: mode === "review" ? "ready-for-review" : "awaiting-manual-post",
        socialStatuses: records.map(socialStatus),
        updatedAt: new Date().toISOString(),
      }
    }

    await upsertStoredRecord(tables, databaseId, RUNS, ownerId, run)
    await recordUsage({
      tables,
      databaseId,
      ownerId,
      automationId,
      runId,
      plan,
      usedAt: run.updatedAt,
    })
    return {
      runId,
      created: !existing,
      status: run.status,
      slideshowId: slideshow.id,
      resultId: result.id,
      integrations: activeIntegrations.length,
    }
  } catch (error) {
    run = {
      ...run,
      status: "failed",
      error: errorMessage(error),
      updatedAt: new Date().toISOString(),
    }
    await upsertStoredRecord(tables, databaseId, RUNS, ownerId, run).catch(
      () => undefined
    )
    if (isAutomationConfigurationError(error)) {
      await pauseBlockedAutomation({
        tables,
        databaseId,
        ownerId,
        automationId,
      }).catch(() => undefined)
      if (error && typeof error === "object") {
        error.nonRetryable = true
      }
    }
    throw error
  }
}

export function shouldBlockAutomaticPublication(mode, qa) {
  return mode === "auto" && qa?.valid === false
}

export function isAutomationConfigurationError(error) {
  const message = errorMessage(error)
  return [
    /^No images are available for the automation collections$/,
    /^No images exist in the configured collection/,
    /^No overlay images exist in database collection /,
    /^Hook slot .+ has no words in database collection /,
    /^The automation database record has no usable hook$/,
    /^The automation database record is missing .+ formatting$/,
  ].some((pattern) => pattern.test(message))
}

async function pauseBlockedAutomation({
  tables,
  databaseId,
  ownerId,
  automationId,
}) {
  const response = await tables.listRows(databaseId, AUTOMATIONS, [
    Query.equal("rid", [automationId]),
    Query.equal("owner_id", [ownerId]),
    Query.limit(1),
  ])
  const row = response.rows[0]
  const automation = safeJson(row?.data)
  if (!row || !automation) return
  const updatedAt = new Date().toISOString()
  const paused = {
    ...automation,
    status: "paused",
    schema: {
      ...automation.schema,
      schedule: {
        ...automation.schema?.schedule,
        paused: true,
      },
    },
    updatedAt,
  }
  await tables.updateRow(databaseId, AUTOMATIONS, row.$id, {
    status: "paused",
    data: JSON.stringify(paused),
    updated_at: updatedAt,
  })
}

async function findAutomation(tables, databaseId, automationId, ownerId) {
  const response = await tables.listRows(databaseId, AUTOMATIONS, [
    Query.equal("rid", [automationId]),
    Query.equal("owner_id", [ownerId]),
    Query.limit(2),
  ])
  if (response.rows.length !== 1) {
    throw new Error(`run-automation: automation ${automationId} not found`)
  }
  const automation = safeJson(response.rows[0].data)
  if (!automation?.schema) {
    throw new Error(`run-automation: automation ${automationId} is invalid`)
  }
  return { ...automation, ownerId, _rowId: response.rows[0].$id }
}

async function loadGenerationContext({
  tables,
  databaseId,
  ownerId,
  automation,
}) {
  const [rawCollections, wordCollections, usage, modelSettings] =
    await Promise.all([
      listStoredRecords(
        tables,
        databaseId,
        PERMANENT_ASSETS,
        ownerId,
        "image_collection"
      ),
      listStoredRecords(
        tables,
        databaseId,
        PERMANENT_ASSETS,
        ownerId,
        "word_collection"
      ),
      listStoredRecords(tables, databaseId, USAGE, ownerId),
      generationModelSettings(tables, databaseId, ownerId),
    ])
  const collections = rawCollections.map(normalizeCollection)
  const requested = new Set(automationCollectionIds(automation.schema))
  const available = collections.some((collection) =>
    collection.aliases.some((alias) => requested.has(alias))
  )
  if (!available) {
    throw new Error("No images are available for the automation collections")
  }
  return { collections, wordCollections, usage, modelSettings }
}

async function createPlan({
  automation,
  scheduledFor,
  runId,
  collections,
  wordCollections,
  usage,
  modelSettings,
}) {
  const schema = automation.schema
  const seed = seededBytes(`${runId}:${scheduledFor}`)
  const defaultBodySlideCount = selectedBodySlideCount(schema, seed[1])
  const hookCutoff =
    Date.parse(scheduledFor) -
    Math.max(0, Number(schema.reuse_policy?.hook_exclusion_days) || 45) *
      24 *
      60 *
      60 *
      1000
  const usedHookKeys = new Set(
    usage
      .filter(
        (record) =>
          record.automation_id === automation.id &&
          record.kind === "hook_published" &&
          Date.parse(record.used_at) >= hookCutoff
      )
      .map((record) => clean(record.key).toLowerCase().replace(/\s+/g, " "))
  )
  const usedHookCombinationKeys = new Set(
    usage
      .filter(
        (record) =>
          record.automation_id === automation.id &&
          record.kind === "hook_combination_published" &&
          Date.parse(record.used_at) >= hookCutoff
      )
      .map((record) => record.key)
  )
  const enabledHookItems = automationHookItems(schema).filter(
    (item) => item.enabled
  )
  if (!enabledHookItems.length) {
    throw new Error("The automation database record has no enabled hooks")
  }
  const hookSelection = selectSlideshowHook({
    hookItems: enabledHookItems,
    hookSlots: schema.hook_slots,
    wordCollections,
    usedHookKeys,
    usedHookCombinationKeys,
    noDuplicateSlots: schema.distinct_variable_draws !== false,
    caseMode: schema.prompt_formatting?.hook_case || "mixed",
    now: new Date(scheduledFor),
    timeZone: schema.schedule?.timezone,
    slideCount: defaultBodySlideCount,
    selectIndex: (candidateCount) => seed[0] % candidateCount,
  })
  const bodySlideCount = hookSelection.bodySlideCount || defaultBodySlideCount
  const hook = normalizeLlmPunctuation(
    applyHookCase(hookSelection.expansion.text, schema.prompt_formatting)
  )
  const specs = slideSpecs(schema, hook, bodySlideCount)
  const publishedUsage = usageForPublishedRuns(usage, automation.id)
  const headingCutoff =
    Date.parse(scheduledFor) -
    Math.max(0, Number(schema.reuse_policy?.text_exclusion_days) || 45) *
      24 *
      60 *
      60 *
      1000
  const recentHeadings = publishedUsage
    .filter(
      (record) =>
        record.kind === "heading" && Date.parse(record.used_at) >= headingCutoff
    )
    .sort((left, right) =>
      String(right.used_at).localeCompare(String(left.used_at))
    )
    .slice(
      0,
      Math.max(Number(schema.reuse_policy?.text_exclusion_limit) || 20, 50)
    )
    .map((record) => record.key)
  const textGeneration = await generateSlideshowText({
    automation: {
      id: automation.id,
      name: automation.name,
      theme: "automation",
      hooks: [hook],
      tone:
        clean(hookSelection.tone) ||
        clean(schema.tone?.value) ||
        "Conversational & Relatable",
      imageCollectionIds: {
        hook: automationCollectionId(schema, "hook"),
        content: automationCollectionId(schema, "content"),
        cta: automationCollectionId(schema, "cta"),
      },
      slides: specs,
    },
    model: clean(modelSettings?.slideshowTextModel) || fallbackTextModel,
    selectedHook: hook,
    promptInstructions: [
      slideshowStructurePromptInstructions(schema),
      slideshowMetadataPromptInstructions(schema),
    ]
      .filter(Boolean)
      .join("\n\n"),
    avoidSimilarHeadings: recentHeadings,
    webSearchEnabled: schema.web_search_enabled,
    apiKey: clean(process.env.OPENROUTER_API_KEY),
    fetchImpl: fetch,
  })
  const generated = {
    ...textGeneration.result,
    model: textGeneration.model,
    violations: textGeneration.violations,
    webSearchSources: textGeneration.webSearchSources,
  }
  const recentImageUsage = new Map(
    publishedUsage
      .filter(
        (record) =>
          record.automation_id === automation.id && record.kind === "image"
      )
      .map((record) => [record.key, record.used_at])
  )
  const firstSlidePinnedImageId =
    schema.image_collection_ids?.first_slide?.mode === "single_image"
      ? clean(schema.image_collection_ids?.first_slide?.single_image)
      : ""
  const cta = formatSection(schema, "cta")
  const ctaPinnedImageId =
    cta.imageMode === "single_image"
      ? clean(schema.image_collection_ids?.cta_slide?.image_id)
      : ""
  const selectedImages = await selectSlideshowImages({
    hook,
    fallbackTitle: automation.name,
    specs,
    generatedText: textGeneration.result,
    firstSlidePinnedImageId,
    ctaPinnedImageId,
    candidatesForSpec: (spec) =>
      imagesForCollectionIds(collections, [spec.collectionId]),
    recentImageUsage,
    random: seededRandom(`${runId}:${scheduledFor}:images`),
    apiKey: clean(process.env.OPENROUTER_API_KEY),
    model: clean(modelSettings?.slideshowTextModel) || fallbackTextModel,
    fetchImpl: fetch,
  })
  if (selectedImages.length < specs.length) {
    throw new Error(
      `This slideshow needs ${specs.length} images, but only ${selectedImages.length} could be selected`
    )
  }

  const slides = specs.map((spec, index) => {
    const image = selectedImages[index]
    const textItems = textItemsForSpec({ spec, hook, generated, schema })
    const overlayImage = overlayForSpec(
      spec,
      collections,
      `${hook} ${textItems.map((item) => item.text).join(" ")}`
    )
    const iconLayout =
      spec.imageGrid === "oval-icons"
        ? createOvalIconLayout({
            candidates: imagesForCollectionIds(collections, [
              spec.collectionId,
            ]),
            focalKey: image.key,
            random: seededRandom(
              `${runId}:${scheduledFor}:${spec.id}:oval-icons`
            ),
          })
        : undefined
    return {
      id: `slide-${index + 1}`,
      role: spec.section === "cta" ? "cta" : spec.section,
      imageUrl: image.imageUrl,
      imageKey: image.key,
      imageCaption: image.imageCaption,
      text: textItems[0]?.text || "",
      textPlacement: textItems[0]?.textPlacement,
      aspectRatio: spec.aspectRatio,
      imageGrid: spec.imageGrid,
      overlay: spec.overlay,
      displayText: spec.displayText,
      overlayImage,
      textItems,
      iconLayout,
    }
  })
  await translatePlan(schema, slides)

  return {
    title: requiredGeneratedValue("title", generated.title),
    caption: requiredGeneratedValue(
      "caption",
      resolveSlideshowCaption({
        setting: schema.tiktok_post_settings?.caption,
        generated: generated.caption,
        hook,
      })
    ),
    hashtags: requiredGeneratedValue(
      "hashtags",
      normalizeHashtags(
        resolveSlideshowHashtags({
          setting: schema.tiktok_post_settings?.description,
          generated: generated.hashtags,
        })
      )
    ),
    hook,
    hookId: hookSelection.hookId,
    hookTemplate: hookSelection.expansion.template,
    hookSubstitutions: hookSelection.expansion.substitutions,
    imageCollectionIds: automationCollectionIds(schema),
    slides,
    slideCount: {
      mode: formatSection(schema, "content").slideCountMode || "static",
      count: slides.length,
      min: formatSection(schema, "content").slideCountMin,
      max: formatSection(schema, "content").slideCountMax,
    },
    publishType: schema.tiktok_post_settings?.publish_type || "slideshow",
    autoMusic: schema.tiktok_post_settings?.auto_music !== false,
    autoPost: effectivePostingMode(schema) === "auto",
    hookCandidates: automationHooks(schema),
    textModel: generated.model,
    violations: generated.violations ?? [],
    language: clean(schema.language) || "English",
    debug: { webSearchSources: generated.webSearchSources || [] },
  }
}

async function translatePlan(schema, slides) {
  if (!deeplTargetLanguage(schema.language)) return
  const apiKey = clean(process.env.DEEPL_KEY)
  if (!apiKey) throw new Error("DEEPL_KEY is not configured")
  const targets = slides.flatMap((slide) =>
    slide.textItems.map((item) => ({ object: item, key: "text" }))
  )
  if (!targets.length) return
  const translated = await translateTextsWithDeepL({
    apiKey,
    targetLanguage: schema.language,
    texts: targets.map(({ object, key }) => object[key]),
  })
  if (
    translated.some(
      (text, index) => !clean(text) && clean(targets[index]?.object.text)
    )
  ) {
    throw new Error("DeepL omitted a translation")
  }
  targets.forEach(({ object, key }, index) => {
    object[key] = translated[index]
  })
  for (const slide of slides)
    slide.text = slide.textItems[0]?.text || slide.text
}

async function renderAndStoreSlideshow({
  storage,
  automation,
  ownerId,
  runId,
  plan,
}) {
  const slideshowId = `slideshow-${runId}`
  const settings = slideshowSettings(automation.schema)
  const renderedBuffers = []
  const renderedSlides = []
  const outputImages = []
  const storedSlides = []

  for (const [index, planSlide] of plan.slides.entries()) {
    const [sourceBytes, overlayBytes, iconBytes] = await Promise.all([
      loadAssetBytes(storage, planSlide.imageUrl),
      planSlide.overlayImage?.imageUrl
        ? loadAssetBytes(storage, planSlide.overlayImage.imageUrl)
        : Promise.resolve(null),
      Promise.all(
        (planSlide.iconLayout?.surrounding || []).map((icon) =>
          loadAssetBytes(storage, icon.imageUrl)
        )
      ),
    ])
    const sourceUrl = await imageDataUrl(sourceBytes, planSlide.imageUrl)
    const overlayUrl = overlayBytes
      ? await imageDataUrl(overlayBytes)
      : undefined
    const iconUrls = await Promise.all(iconBytes.map(imageDataUrl))
    const storedSlide = {
      id: planSlide.id,
      image_url: planSlide.imageUrl,
      source_image_url: planSlide.imageUrl,
      overlayImage: planSlide.overlayImage
        ? {
            image_url: planSlide.overlayImage.imageUrl,
            source_image_url: planSlide.overlayImage.imageUrl,
            padding: planSlide.overlayImage.padding,
          }
        : undefined,
      overlay: planSlide.overlay,
      imageFit: automation.schema.image_fit,
      iconLayout: planSlide.iconLayout
        ? {
            kind: "oval-icons",
            surrounding: planSlide.iconLayout.surrounding.map((icon) => ({
              image_url: icon.imageUrl,
              source_image_url: icon.imageUrl,
              image_caption: icon.imageCaption,
              key: icon.key,
              x: icon.x,
              y: icon.y,
              scale: icon.scale,
              rotation: icon.rotation,
            })),
          }
        : undefined,
      textItems: planSlide.textItems,
    }
    const { png } = await renderSlideshowSlideBuffers({
      slide: storedSlide,
      sourceUrl,
      overlayUrl,
      aspectRatio: settings.aspect_ratio,
      font: settings.font,
      iconUrls,
    })
    const fileName = `slide-${String(index + 1).padStart(3, "0")}.png`
    const relPath = `slideshows/outputs/${slideshowId}/${fileName}`
    await replaceStorageFile(
      storage,
      SLIDESHOW_BUCKET,
      fileId(relPath),
      png,
      fileName
    )
    const publicPath = `/api/local-assets/${relPath}`
    renderedBuffers.push(png)
    outputImages.push(publicPath)
    storedSlides.push({ ...storedSlide, image_url: publicPath })
    renderedSlides.push({
      id: planSlide.id,
      role: planSlide.role,
      imageUrl: publicPath,
      sourceImageUrl: planSlide.imageUrl,
      imageCaption: planSlide.imageCaption,
      text: planSlide.text,
      durationMs: settings.duration * 1000,
      aspectRatio: settings.aspect_ratio,
    })
  }
  if (!renderedBuffers.length)
    throw new Error("Slideshow rendering produced no images")
  const video =
    plan.publishType === "video"
      ? await renderSlideshowVideo({
          storage,
          slideshowId,
          renderedBuffers,
          durationSeconds: settings.duration,
        })
      : null
  return {
    id: slideshowId,
    ownerId,
    outputDir: `/api/local-assets/slideshows/outputs/${slideshowId}`,
    outputImages,
    renderedBuffers,
    renderedSlides,
    storedSlides,
    settings: { ...settings, export_as_video: Boolean(video) },
    videoBuffer: video?.buffer,
    videoUrl: video?.videoUrl,
    thumbnailUrl: video?.thumbnailUrl || outputImages[0],
  }
}

export async function renderSlideshowVideo({
  storage,
  slideshowId,
  renderedBuffers,
  durationSeconds,
}) {
  const apiKey = clean(process.env.RENDI_API_KEY)
  if (!apiKey) throw new Error("RENDI_API_KEY is not configured")

  const duration = Math.max(1, Number(durationSeconds))
  const inputFiles = {}
  const command = []
  for (const [index, bytes] of renderedBuffers.entries()) {
    const stored = await uploadBytesToRendi({
      apiKey,
      bytes,
      fileName: `slide-${index + 1}.png`,
    })
    const alias = `slide_${index + 1}`
    inputFiles[alias] = stored.storage_url
    command.push("-loop", "1", "-t", String(duration), "-i", `{{${alias}}}`)
  }

  if (renderedBuffers.length === 1) {
    command.push("-vf", "fps=12,format=yuv420p")
  } else {
    const labels = renderedBuffers.map((_, index) => `[${index}:v]`).join("")
    command.push(
      "-filter_complex",
      `${labels}concat=n=${renderedBuffers.length}:v=1:a=0,fps=12,format=yuv420p[v]`,
      "-map",
      "[v]"
    )
  }
  command.push("-movflags", "+faststart", "{{out_video}}")

  const rendered = await runRendiFfmpegAndDownloadBytes({
    apiKey,
    ffmpegCommand: command.join(" "),
    inputFiles,
    outputFiles: { out_video: "slideshow-export.mp4" },
    outputAlias: "out_video",
    maxCommandRunSeconds: 300,
    vcpuCount: 4,
    metadata: { workflow: "slideshow_export" },
  })
  const buffer = rendered.bytes
  const videoName = "slideshow-export.mp4"
  const thumbnailName = "slideshow-thumbnail.png"
  const outputPrefix = `slideshows/outputs/${slideshowId}`
  await Promise.all([
    replaceStorageFile(
      storage,
      SLIDESHOW_BUCKET,
      fileId(`${outputPrefix}/${videoName}`),
      buffer,
      videoName
    ),
    replaceStorageFile(
      storage,
      SLIDESHOW_BUCKET,
      fileId(`${outputPrefix}/${thumbnailName}`),
      renderedBuffers[0],
      thumbnailName
    ),
  ])
  return {
    buffer,
    videoUrl: `/api/local-assets/${outputPrefix}/${videoName}`,
    thumbnailUrl: `/api/local-assets/${outputPrefix}/${thumbnailName}`,
  }
}

function resultRecord({ automation, ownerId, runId, plan, slideshow }) {
  const now = new Date().toISOString()
  return {
    id: `result-${runId}`,
    automationId: automation.id,
    runId,
    workflowType: "slideshow",
    title: requiredGeneratedValue("title", plan.title),
    status: "succeeded",
    createdAt: now,
    updatedAt: now,
    ownerId,
    artifacts: {
      slideshowId: slideshow.id,
      videoUrl: slideshow.videoUrl,
      thumbnailUrl: slideshow.thumbnailUrl,
      outputImages: slideshow.outputImages,
      outputDir: slideshow.outputDir,
    },
    payload: {
      type: "slideshow",
      caption: plan.caption,
      hashtags: plan.hashtags,
      prompt: [
        automation.schema.prompt_formatting?.narrative,
        automation.schema.prompt_formatting?.style,
        `Hook: ${plan.hook}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      imageCollectionId: plan.imageCollectionIds[0] || "",
      slideshowType: "automation",
      settings: slideshow.settings,
      slides: slideshow.storedSlides,
    },
    destinationAccountIds: (automation.schema.social_integrations || [])
      .filter((item) => !item.disabled)
      .map((item) => item.integration_id)
      .filter(Boolean),
  }
}

async function uploadPostFastMedia(sources) {
  if (!sources.length) {
    throw new Error("PostFast upload requires generated media")
  }
  const contentTypes = new Set(sources.map((source) => source.contentType))
  if (contentTypes.size !== 1) {
    throw new Error("PostFast upload cannot mix media content types")
  }
  const contentType = sources[0].contentType
  const signed = await postfastRequest("/file/get-signed-upload-urls", {
    body: {
      contentType,
      count: sources.length,
    },
  })
  if (!Array.isArray(signed) || signed.length !== sources.length) {
    throw new Error(
      `PostFast returned ${Array.isArray(signed) ? signed.length : 0} upload URLs for ${sources.length} media files`
    )
  }
  const media = await Promise.all(
    sources.map(async (source, index) => {
      const target = signed[index]
      if (!clean(target?.signedUrl) || !clean(target?.key)) {
        throw new Error("PostFast returned an invalid signed upload")
      }
      const response = await fetch(target.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": source.contentType },
        body: source.bytes,
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) {
        throw new Error(`PostFast media upload failed (${response.status})`)
      }
      return { key: target.key, type: source.type, sortOrder: index }
    })
  )
  return media
}

async function publishScheduledPosts({
  tables,
  databaseId,
  ownerId,
  runId,
  integrations,
  scheduledFor,
  content,
  media,
  schema,
}) {
  const records = []
  let published = 0
  let failed = 0
  for (const integration of integrations) {
    const existing = await findPostRecord(
      tables,
      databaseId,
      ownerId,
      runId,
      integration.integration_id
    )
    if (existing?.status === "scheduled" || existing?.status === "published") {
      records.push(existing)
      published++
      continue
    }
    try {
      const response = await postfastRequest("/social-posts", {
        body: postFastSchedulePayload({
          content,
          integrationId: integration.integration_id,
          media,
          provider: integration.provider,
          scheduledFor,
          settings: schema.social_post_settings?.[integration.provider],
        }),
      })
      const record = await upsertPostRecord({
        tables,
        databaseId,
        ownerId,
        runId,
        integration,
        status: "scheduled",
        scheduledFor,
        content,
        media,
        postfastPostId: postFastIds(response)[0],
      })
      records.push(record)
      published++
    } catch (error) {
      records.push(
        await upsertPostRecord({
          tables,
          databaseId,
          ownerId,
          runId,
          integration,
          status: "failed",
          scheduledFor,
          content,
          media,
          error: errorMessage(error),
        })
      )
      failed++
    }
  }
  return { published, failed, records }
}

async function upsertPostRecord({
  tables,
  databaseId,
  ownerId,
  runId,
  integration,
  status,
  scheduledFor,
  content,
  media,
  postfastPostId,
  error,
}) {
  const existing = await findPostRecord(
    tables,
    databaseId,
    ownerId,
    runId,
    integration.integration_id
  )
  const now = new Date().toISOString()
  const record = buildPublicationRecord({
    id:
      existing?.id || postRecordId(ownerId, runId, integration.integration_id),
    sourceType: "automation",
    sourceId: runId,
    postfastPostId: postfastPostId || existing?.postfastPostId,
    integrationId: integration.integration_id,
    provider: integration.provider,
    status,
    scheduledAt: scheduledFor,
    publishedAt: existing?.publishedAt,
    releaseUrl: existing?.releaseUrl,
    linkState: existing?.linkState,
    statsSources: existing?.statsSources,
    externalPostId: existing?.externalPostId,
    content,
    media,
    analytics: existing?.analytics,
    lastAnalyticsSyncedAt: existing?.lastAnalyticsSyncedAt,
    error,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastSyncedAt: now,
    ownerId,
  })
  await upsertOutputPublication({
    tables,
    databaseId,
    ownerId,
    runId,
    record,
  })
  return record
}

async function findPostRecord(
  tables,
  databaseId,
  ownerId,
  runId,
  integrationId
) {
  const output = await getResultOutput(tables, databaseId, ownerId, runId)
  return parseArray(output?.publications).find(
    (record) => record.integrationId === integrationId
  )
}

async function enqueueNotification({
  tables,
  databaseId,
  ownerId,
  event,
  sourceType,
  sourceId,
  scheduledFor,
  availableAt,
  requiresPostConfirmation,
  text,
}) {
  const settings = await reminderSettings(tables, databaseId, ownerId)
  if (!settings || reminderChannel(settings, event) !== "telegram") return
  const now = new Date().toISOString()
  const dedupe = [
    "reminder",
    event,
    sourceType,
    sourceId,
    event === "ready_to_post" ? scheduledFor : "",
  ]
    .filter(Boolean)
    .join(":")
  const id = jobId(`${ownerId}:${dedupe}`)
  try {
    await tables.createRow(databaseId, JOBS, id, {
      type: "send-notification",
      status: "queued",
      payload: JSON.stringify({
        event,
        sourceType,
        sourceId,
        scheduledFor,
        requiresPostConfirmation: requiresPostConfirmation === true,
        text,
      }),
      priority: 0,
      attempts: 0,
      max_attempts: 5,
      available_at: Date.parse(availableAt) > Date.now() ? availableAt : now,
      dedupe_key: dedupe,
      created_at: now,
      updated_at: now,
      owner_id: ownerId,
    })
  } catch (error) {
    if (error?.code !== 409) throw error
  }
}

async function reminderSettings(tables, databaseId, ownerId) {
  const response = await tables.listRows(databaseId, PERMANENT_ASSETS, [
    Query.equal("owner_id", [ownerId]),
    Query.equal("source_key", ["reminder_settings"]),
    Query.limit(1),
  ])
  const value = safeJson(response.rows[0]?.data)
  return value || null
}

async function generationModelSettings(tables, databaseId, ownerId) {
  const response = await tables.listRows(databaseId, PERMANENT_ASSETS, [
    Query.equal("owner_id", [ownerId]),
    Query.equal("source_key", ["generation_model_settings"]),
    Query.limit(1),
  ])
  return safeJson(response.rows[0]?.data) || null
}

export function reminderChannel(settings, event) {
  const eventSettings = settings?.events?.[event]
  const channel =
    typeof eventSettings === "boolean"
      ? eventSettings && settings?.channel === "telegram"
        ? "telegram"
        : "none"
      : eventSettings?.channel === "telegram"
        ? "telegram"
        : "none"
  if (channel === "telegram") return channel

  const hasDestination =
    Boolean(clean(settings?.telegramChatId)) ||
    Boolean(clean(process.env.TELEGRAM_CHAT_ID))
  const anyEventEnabled = Object.values(settings?.events || {}).some(
    (configured) =>
      configured === true ||
      (configured &&
        typeof configured === "object" &&
        configured.channel === "telegram")
  )
  return event === "generated" &&
    hasDestination &&
    settings?.notificationDefaultsApplied !== true &&
    !anyEventEnabled
    ? "telegram"
    : "none"
}

async function recordUsage({
  tables,
  databaseId,
  ownerId,
  automationId,
  runId,
  plan,
  usedAt,
}) {
  const records = []
  for (const slide of plan.slides) {
    records.push({ kind: "image", key: slide.imageKey || slide.imageUrl })
  }
  records.push({
    kind: "text",
    key: normalizeSignature(
      [
        plan.title,
        plan.caption,
        ...plan.slides.map((slide) => slide.text),
      ].join(" ")
    ),
  })
  for (const slide of plan.slides) {
    if (slide.role !== "content") continue
    const heading =
      slide.textItems?.find((item) => /heading/i.test(item.id))?.text ||
      slide.textItems?.[0]?.text ||
      slide.text
    const key = normalizeSignature(heading)
    if (key) records.push({ kind: "heading", key })
  }
  for (const record of records) {
    const id =
      "usage-" +
      crypto
        .createHash("sha256")
        .update(`${runId}:${record.kind}:${record.key}`)
        .digest("hex")
        .slice(0, 24)
    await upsertStoredRecord(tables, databaseId, USAGE, ownerId, {
      id,
      automation_id: automationId,
      kind: record.kind,
      key: record.key,
      run_id: runId,
      used_at: usedAt,
      ownerId,
    })
  }
}

async function loadAssetBytes(storage, rawUrl) {
  const url = clean(rawUrl)
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",")
    if (comma < 0) throw new Error("Invalid image data URL")
    return url.slice(0, comma).includes(";base64")
      ? Buffer.from(url.slice(comma + 1), "base64")
      : Buffer.from(decodeURIComponent(url.slice(comma + 1)))
  }
  const local = localAssetPath(url)
  if (local) {
    const view = await storage.getFileView(bucketForPath(local), fileId(local))
    return Buffer.from(view)
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Unsupported slideshow image URL: ${url}`)
  }
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) {
    throw new Error(`Could not load slideshow image (${response.status})`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function imageDataUrl(bytes, sourceUrl) {
  const image = sharp(bytes, { animated: false })
  let metadata
  try {
    metadata = await image.metadata()
  } catch (cause) {
    // The Appwrite node-22 runtime's libvips has no HEIF/HEIC codec, so an
    // asset in an unsupported format kills the whole generation after all the
    // expensive LLM work. Name the asset so it can be converted or removed.
    throw new Error(
      `Slideshow source image could not be decoded${sourceUrl ? ` (${sourceUrl})` : ""}: ` +
        `${cause instanceof Error ? cause.message : cause}. ` +
        `Convert it to JPEG/PNG/WebP; this runtime cannot read HEIF/HEIC.`
    )
  }
  if (["jpeg", "png", "svg"].includes(metadata.format)) {
    const mime = metadata.format === "svg" ? "svg+xml" : metadata.format
    return `data:image/${mime};base64,${bytes.toString("base64")}`
  }
  const png = await image.png().toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

async function replaceStorageFile(storage, bucket, id, bytes, name) {
  const input = InputFile.fromBuffer(bytes, name)
  try {
    await storage.createFile(bucket, id, input, [])
  } catch (error) {
    if (error?.code !== 409) throw error
    try {
      await storage.deleteFile(bucket, id)
    } catch (deleteError) {
      if (deleteError?.code !== 404) throw deleteError
    }
    await storage.createFile(bucket, id, input, [])
  }
}

async function listStoredRecords(
  tables,
  databaseId,
  table,
  ownerId,
  sourceKey
) {
  const records = []
  let cursor
  for (;;) {
    const queries = [
      Query.equal("owner_id", [ownerId]),
      Query.orderAsc("ord"),
      Query.limit(PAGE),
    ]
    if (sourceKey) queries.unshift(Query.equal("source_key", [sourceKey]))
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await tables.listRows(databaseId, table, queries)
    for (const row of response.rows) {
      const parsed = safeJson(row.data)
      if (parsed) records.push(parsed)
    }
    if (response.rows.length < PAGE) break
    cursor = response.rows.at(-1).$id
  }
  return records
}

async function getStoredRecord(tables, databaseId, table, rowId) {
  try {
    return safeJson((await tables.getRow(databaseId, table, rowId)).data)
  } catch (error) {
    if (error?.code === 404) return null
    throw error
  }
}

async function upsertStoredRecord(tables, databaseId, table, ownerId, record) {
  const rid = clean(record.id)
  if (!rid) throw new Error(`A record id is required for ${table}`)
  const rowId = ownedRowId(table, ownerId, rid)
  let ord = -Date.now()
  try {
    const existing = await tables.getRow(databaseId, table, rowId)
    if (Number.isFinite(existing.ord)) ord = existing.ord
  } catch (error) {
    if (error?.code !== 404) throw error
  }
  const ownedRecord = { ...record, ownerId }
  const projected =
    table === USAGE
      ? {}
      : {
          name:
            clean(record.name || record.title || record.automationTitle).slice(
              0,
              2048
            ) || null,
          status: clean(record.status).slice(0, 255) || null,
        }
  await tables.upsertRow(databaseId, table, rowId, {
    rid: rid.slice(0, 1024),
    ...projected,
    created_raw:
      clean(record.createdAt || record.created_at || record.used_at).slice(
        0,
        64
      ) || null,
    ord,
    owner_id: ownerId,
    data: JSON.stringify(ownedRecord),
  })
}

async function upsertResultOutput(tables, databaseId, ownerId, record) {
  const rid = clean(record.id)
  if (!rid) throw new Error("A result output id is required")
  const rowId = consolidatedOwnedRowId(OUTPUTS, "result", ownerId, rid)
  let existing = null
  let ord = -Date.now()
  try {
    existing = await tables.getRow(databaseId, OUTPUTS, rowId)
    if (Number.isFinite(existing.ord)) ord = existing.ord
  } catch (error) {
    if (error?.code !== 404) throw error
  }

  const stored = JSON.parse(JSON.stringify({ ...record, ownerId }))
  const artifacts = stored.artifacts || {}
  const media = []
  const addMedia = (url, kind, role, position = 0) => {
    const normalized = clean(url)
    if (normalized) media.push({ url: normalized, kind, role, position })
  }
  for (const [index, url] of (artifacts.outputImages || []).entries()) {
    addMedia(url, "image", "slide", index)
  }
  addMedia(artifacts.videoUrl, "video", "rendered_video")
  addMedia(artifacts.thumbnailUrl, "image", "thumbnail")
  delete artifacts.outputImages
  delete artifacts.videoUrl
  delete artifacts.thumbnailUrl
  if (Array.isArray(stored.payload?.slides)) {
    stored.payload.slides = stored.payload.slides.map((slide, index) => {
      addMedia(slide?.image_url, "image", "slide", index)
      const next = { ...slide }
      delete next.image_url
      return next
    })
  }

  const publications = parseArray(existing?.publications)
  const slides = stored.payload?.slides || []
  const hashtagText = clean(stored.payload?.hashtags)
  const hashtags = hashtagText.split(/\s+/).filter(Boolean)
  await tables.upsertRow(databaseId, OUTPUTS, rowId, {
    rid,
    owner_id: ownerId,
    source_key: "result",
    name: clean(record.title).slice(0, 2048) || null,
    kind: clean(record.workflowType) || "generation",
    subtype: clean(record.payload?.type) || null,
    status: clean(record.status) || null,
    storage_class: "permanent",
    origin: "deployed_app",
    title: clean(record.title).slice(0, 2048) || null,
    hook: clean(slides[0]?.textItems?.[0]?.text).slice(0, 10000) || null,
    caption: clean(record.payload?.caption).slice(0, 100000) || null,
    hashtags: JSON.stringify(hashtags),
    text:
      slides
        .map((slide) => clean(slide?.textItems?.[0]?.text))
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 100000) || null,
    text_data: JSON.stringify(
      slides.map((slide, position) => ({
        position,
        textItems: slide?.textItems || [],
      }))
    ),
    source_automation_id: clean(record.automationId) || null,
    source_run_id: clean(record.runId) || null,
    source_entity_id: clean(record.artifacts?.slideshowId) || null,
    publication_status: publicationRecordSummary(publications).status,
    scheduled_at: publicationRecordSummary(publications).scheduledAt,
    published_at: publicationRecordSummary(publications).publishedAt,
    primary_post_id: publicationRecordSummary(publications).postId,
    primary_release_url: publicationRecordSummary(publications).releaseUrl,
    publications: JSON.stringify(publications),
    evaluation: "null",
    error: clean(record.error).slice(0, 100000) || null,
    created_raw: clean(record.createdAt).slice(0, 64) || null,
    updated_at: clean(record.updatedAt || record.createdAt) || null,
    migration_source: null,
    ord,
    data: JSON.stringify(stored),
  })
  await syncResultMedia(tables, databaseId, rowId, ownerId, media)
}

async function syncResultMedia(
  tables,
  databaseId,
  outputRowId,
  ownerId,
  media
) {
  let cursor
  const existingIds = []
  for (;;) {
    const queries = [Query.equal("output_id", [outputRowId]), Query.limit(PAGE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await tables.listRows(databaseId, OUTPUT_MEDIA, queries)
    existingIds.push(...response.rows.map((row) => row.$id))
    if (response.rows.length < PAGE) break
    cursor = response.rows.at(-1)?.$id
  }
  for (const id of existingIds) {
    await tables.deleteRow(databaseId, OUTPUT_MEDIA, id)
  }
  for (const item of media) {
    const path = localAssetPath(item.url)
    // Deterministic ids make this sync re-runnable, but only if a surviving row
    // (a racing writer, an eventually-consistent delete, or two media entries
    // hashing alike) is replaced rather than fatally colliding. A failed create
    // here used to abort the whole generation after all the expensive work.
    const mediaRowId = outputMediaRowId(outputRowId, item)
    await tables.deleteRow(databaseId, OUTPUT_MEDIA, mediaRowId).catch(() => {})
    await tables.createRow(databaseId, OUTPUT_MEDIA, mediaRowId, {
      output_id: outputRowId,
      owner_id: ownerId,
      kind: item.kind,
      role: item.role,
      position: item.position,
      storage_bucket: path ? bucketForPath(path) : null,
      storage_file_id: path ? fileId(path) : null,
      storage_path: path,
      url: item.url,
      created_at: new Date().toISOString(),
    })
  }
}

async function getResultOutput(tables, databaseId, ownerId, runId) {
  const rowId = consolidatedOwnedRowId(
    OUTPUTS,
    "result",
    ownerId,
    `result-${runId}`
  )
  try {
    return await tables.getRow(databaseId, OUTPUTS, rowId)
  } catch (error) {
    if (error?.code === 404) return null
    throw error
  }
}

async function upsertOutputPublication({
  tables,
  databaseId,
  ownerId,
  runId,
  record,
}) {
  const output = await getResultOutput(tables, databaseId, ownerId, runId)
  if (!output) throw new Error(`Output for run ${runId} was not found`)
  const current = parseArray(output.publications)
  const publications = [
    record,
    ...current.filter(
      (item) =>
        item.id !== record.id && item.integrationId !== record.integrationId
    ),
  ]
  const summary = publicationRecordSummary(publications)
  await tables.updateRow(databaseId, OUTPUTS, output.$id, {
    publications: JSON.stringify(publications),
    publication_status: summary.status,
    scheduled_at: summary.scheduledAt,
    published_at: summary.publishedAt,
    primary_post_id: summary.postId,
    primary_release_url: summary.releaseUrl,
    updated_at: new Date().toISOString(),
  })
}

function parseArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== "string" || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function consolidatedOwnedRowId(table, sourceKey, ownerId, rid) {
  return (
    "u" +
    crypto
      .createHash("sha256")
      .update(`${table}:${sourceKey}:${ownerId}:${rid}`)
      .digest("hex")
      .slice(0, 35)
  )
}

function outputMediaRowId(outputRowId, media) {
  return (
    "m" +
    crypto
      .createHash("sha256")
      .update(`${outputRowId}:${media.role}:${media.position}:${media.url}`)
      .digest("hex")
      .slice(0, 35)
  )
}

function normalizeCollection(collection) {
  const name = clean(collection.name)
  const createdAt = clean(collection.created_at)
  const id = `collection-${slugify(`${name}-${createdAt}`)}`
  const images = (collection.images || []).flatMap((image, index) => {
    const imageUrl = clean(image.image_link)
    if (!imageUrl) return []
    return [
      {
        id: clean(image.hash) || `stored-${slugify(name)}-${index}`,
        key: clean(image.hash) || imageUrl,
        imageUrl,
        imageCaption: clean(image.caption),
      },
    ]
  })
  const aliases = new Set([id, name])
  for (const image of images) {
    const path = localAssetPath(image.imageUrl)
    if (path) {
      aliases.add(path.split("/").at(-2) || "")
    }
  }
  return { id, name, aliases: [...aliases].filter(Boolean), images }
}

function imagesForCollectionIds(collections, collectionIds) {
  const requested = new Set(collectionIds.filter(Boolean))
  return collections
    .filter((collection) =>
      collection.aliases.some((alias) => requested.has(alias))
    )
    .flatMap((collection) => collection.images)
}

function automationCollectionIds(schema) {
  return [
    automationCollectionId(schema, "hook"),
    automationCollectionId(schema, "content"),
    automationCollectionId(schema, "cta"),
  ].filter((value, index, values) => value && values.indexOf(value) === index)
}

function automationCollectionId(schema, role) {
  if (role === "hook") {
    return clean(schema.image_collection_ids?.first_slide?.collection)
  }
  if (role === "cta") {
    return clean(
      schema.image_collection_ids?.cta_slide?.cta_collection_id ||
        schema.image_collection_ids?.all_slides
    )
  }
  return clean(schema.image_collection_ids?.all_slides)
}

function formatSection(schema, role) {
  const id = role === "content" ? "body" : role
  const section = (schema.formatting || []).find(
    (candidate) => candidate.id === id
  )
  if (!section) {
    throw new Error(
      `The automation database record is missing ${id} formatting`
    )
  }
  return section
}

function overlayForSpec(spec, collections, matchText) {
  if (!spec.overlayImage?.collectionId) return undefined
  const images = imagesForCollectionIds(collections, [
    spec.overlayImage.collectionId,
  ])
  if (!images.length) {
    throw new Error(
      `No overlay images exist in database collection ${spec.overlayImage.collectionId}`
    )
  }
  const tokens = new Set(matchTokens(matchText))
  const ranked = images
    .map((image) => ({
      image,
      score: matchTokens(image.imageCaption).filter((token) =>
        tokens.has(token)
      ).length,
    }))
    .sort((left, right) => right.score - left.score)
  const image = ranked[0].image
  return {
    imageUrl: image.imageUrl,
    imageCaption: image.imageCaption,
    padding: spec.overlayImage.padding,
  }
}

function matchTokens(value) {
  return clean(value)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token.length >= 4)
    .map((token) => token.replace(/s$/, ""))
}

function slideshowSettings(schema) {
  const tiktok = schema.tiktok_post_settings || {}
  return {
    duration: Math.max(1, Number(tiktok.slideshow_slide_duration) || 4),
    aspect_ratio: clean(schema.aspect_ratio) || defaultSlideshowAspectRatio,
    font: clean(schema.font) || defaultSlideshowFont,
    background_color: "#000000",
    transition_style: clean(tiktok.slideshow_transition_style) || "hard",
    export_as_video: false,
    sound_id: clean(tiktok.slideshow_sound_id),
    sound_name: clean(tiktok.slideshow_sound_name),
    sound_url: clean(tiktok.slideshow_sound_url),
  }
}

function publishContent(plan) {
  const caption = requiredGeneratedValue("caption", plan.caption)
  const hashtags = requiredGeneratedValue("hashtags", plan.hashtags)
  return !caption.includes(hashtags)
    ? `${caption}\n\n${hashtags}`.trim()
    : caption
}

function socialStatus(record) {
  return {
    provider: record.provider,
    integrationId: record.integrationId,
    name: record.integrationId,
    status: record.status,
    error: record.error,
  }
}

function postFastIds(value) {
  if (Array.isArray(value?.postIds)) return value.postIds.filter(Boolean)
  if (Array.isArray(value?.data?.postIds))
    return value.data.postIds.filter(Boolean)
  return []
}

function postRecordId(ownerId, runId, integrationId) {
  return `pf${crypto
    .createHash("sha256")
    .update(`${ownerId}:${runId}:${integrationId}`)
    .digest("hex")
    .slice(0, 32)}`
}

function normalizeHashtags(value) {
  const tags = (Array.isArray(value) ? value : clean(value).split(/\s+/))
    .map(clean)
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
  return tags.slice(0, 5).join(" ")
}

function requiredGeneratedValue(field, value) {
  const generated = clean(value)
  if (!generated) {
    throw new Error(`OpenRouter omitted required slideshow ${field}`)
  }
  return generated
}

function localAssetPath(value) {
  try {
    const pathname = new URL(value, "http://local").pathname
    const prefix = "/api/local-assets/"
    if (!pathname.startsWith(prefix)) return null
    const parts = pathname
      .slice(prefix.length)
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent)
    if (parts.some((part) => part === "..")) return null
    return parts.join("/")
  } catch {
    return null
  }
}

function bucketForPath(path) {
  const top = path.split("/")[0]
  const buckets = {
    music: "music",
    "image-collections": "image_collections",
    greenscreen_memes: "greenscreen",
    characters: "characters",
    slideshows: "slideshows",
    ugc_avatar_videos: "ugc_videos",
    backgrounds: "backgrounds",
    assets: "assets",
    "product-collections": "product_images",
  }
  return buckets[top] || "misc"
}

function fileId(relativePath) {
  return crypto
    .createHash("sha256")
    .update(relativePath)
    .digest("hex")
    .slice(0, 36)
}

function ownedRowId(table, ownerId, rid) {
  return (
    "u" +
    crypto
      .createHash("sha256")
      .update(`${table}:${ownerId}:${rid}`)
      .digest("hex")
      .slice(0, 35)
  )
}

function jobId(key) {
  return (
    "j" + crypto.createHash("sha256").update(key).digest("hex").slice(0, 35)
  )
}

function normalizeSignature(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ")
}

function seededBytes(value) {
  return crypto.createHash("sha256").update(value).digest()
}

function seededRandom(value) {
  let counter = 0
  return () => {
    const bytes = crypto
      .createHash("sha256")
      .update(`${value}:${counter++}`)
      .digest()
    return bytes.readUInt32BE(0) / 4294967296
  }
}

function createOvalIconLayout({ candidates, focalKey, random }) {
  const available = shuffled(
    candidates.filter((candidate) => candidate.key !== focalKey),
    random
  )
  const targetCount = Math.min(available.length, 4 + Math.floor(random() * 5))
  const surrounding = []
  const sectorSize = (Math.PI * 2) / Math.max(1, targetCount)
  const phase =
    -Math.PI / 2 + sectorSize * 0.5 + (random() - 0.5) * sectorSize * 0.2
  for (const [index, candidate] of available.slice(0, targetCount).entries()) {
    const placement = placeOvalIcon({
      candidate,
      existing: surrounding,
      baseAngle: phase + index * sectorSize,
      sectorSize,
      random,
    })
    if (placement) surrounding.push(placement)
  }
  if (surrounding.length < Math.min(4, available.length)) {
    throw new Error(
      "Oval icons layout needs at least four non-overlapping surrounding icons"
    )
  }
  return { kind: "oval-icons", surrounding }
}

function placeOvalIcon({ candidate, existing, baseAngle, sectorSize, random }) {
  const width = 1080
  const height = 1920
  const oval = {
    cx: width * 0.5,
    cy: height * 0.5,
    rx: width * 0.372,
    ry: height * 0.318,
  }
  const baseSize = 146
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const angle = baseAngle + (random() - 0.5) * sectorSize * 0.2
    const scale = 0.7 + random() * 0.6
    const radius = (baseSize * scale) / 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const normalLength = Math.hypot(cosine / oval.rx, sine / oval.ry)
    const normalX = cosine / oval.rx / normalLength
    const normalY = sine / oval.ry / normalLength
    const boundaryX = oval.cx + oval.rx * cosine
    const boundaryY = oval.cy + oval.ry * sine
    const frameMargin = 24
    const minX = frameMargin + radius
    const maxX = width - frameMargin - radius
    const minY = frameMargin + radius
    const maxY = height - frameMargin - radius
    const horizontal =
      Math.abs(normalX) < 1e-6
        ? Number.POSITIVE_INFINITY
        : ((normalX > 0 ? maxX : minX) - boundaryX) / normalX
    const vertical =
      Math.abs(normalY) < 1e-6
        ? Number.POSITIVE_INFINITY
        : ((normalY > 0 ? maxY : minY) - boundaryY) / normalY
    const maximumClearance = Math.min(horizontal, vertical) - 2
    const minimumClearance = 4
    if (maximumClearance <= minimumClearance) continue
    const clearance =
      minimumClearance + random() * (maximumClearance - minimumClearance)
    const x = boundaryX + normalX * clearance
    const y = boundaryY + normalY * clearance
    if (
      x - radius < frameMargin ||
      x + radius > width - frameMargin ||
      y - radius < frameMargin ||
      y + radius > height - frameMargin
    ) {
      continue
    }
    const overlaps = existing.some((placed) => {
      const placedX = (placed.x / 100) * width
      const placedY = (placed.y / 100) * height
      const minimum = radius + (baseSize * placed.scale) / 2 + 30
      return (x - placedX) ** 2 + (y - placedY) ** 2 < minimum ** 2
    })
    if (overlaps) continue
    return {
      ...candidate,
      x: (x / width) * 100,
      y: (y / height) * 100,
      scale,
      rotation: -90 + random() * 180,
    }
  }
  return null
}

function shuffled(items, random) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function safeJson(value) {
  try {
    return JSON.parse(value || "null")
  } catch {
    return null
  }
}

function validIso(value) {
  const timestamp = Date.parse(clean(value))
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : ""
}

function clean(value) {
  return typeof value === "string" ? value.trim() : ""
}

function errorMessage(error) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4000)
}
