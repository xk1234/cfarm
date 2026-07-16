// Cloud-native port of the scheduled slideshow path in
// lib/automation-runner.ts + lib/publishing.ts. This module intentionally lives
// inside the Function source tree so an Appwrite deployment is self-contained.
// Keep generation, render, and PostFast payload changes synchronized with the
// corresponding lib modules.
import crypto from "node:crypto"
import sharp from "sharp"
import { Query } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

import {
  defaultSlideshowAspectRatio,
  defaultSlideshowFont,
  renderedSlideSvg,
  slideshowTextPositionX,
} from "./slideshow-renderer.js"
import { expandAllHookCombinations } from "./hook-expansion.js"
import { applyResolvedHookCase } from "./hook-casing.js"
import { defaultPostFastProviderControls as providerControls } from "./postfast-provider-controls.js"

const AUTOMATIONS = "automations"
const RUNS = "automation_runs"
const OUTPUTS = "outputs"
const OUTPUT_MEDIA = "output_media"
const PERMANENT_ASSETS = "permanent_assets"
const USAGE = "usage_ledger"
const JOBS = "jobs"
const SLIDESHOW_BUCKET = "slideshows"
const defaultTextModel = "anthropic/claude-sonnet-5"
const benchmarkModel = "google/gemini-2.5-flash"
const PAGE = 100

export function slideshowRunId(automationId, scheduledFor) {
  return (
    "arun" +
    crypto
      .createHash("sha256")
      .update(`${automationId}:${scheduledFor}`)
      .digest("hex")
      .slice(0, 32)
  )
}

export function effectivePostingMode(schema) {
  if (
    schema?.posting_mode === "auto" ||
    schema?.posting_mode === "review" ||
    schema?.posting_mode === "manual"
  ) {
    return schema.posting_mode
  }
  return "auto"
}

export function postFastSchedulePayload({
  content,
  integrationId,
  media,
  provider,
  scheduledFor,
  settings,
}) {
  const controls = providerControls(provider, settings)
  return {
    status: "SCHEDULED",
    posts: [
      {
        content,
        mediaItems: media.map((item, index) => ({
          key: item.key,
          type: item.type,
          sortOrder: item.sortOrder ?? index,
        })),
        scheduledAt: scheduledFor,
        socialMediaId: integrationId,
        status: "SCHEDULED",
      },
    ],
    ...(Object.keys(controls).length ? { controls } : {}),
  }
}

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

    let benchmarkId
    let benchmarkError
    try {
      const benchmark = await benchmarkSlideshow({
        automation,
        ownerId,
        runId,
        slideshow,
        plan,
      })
      benchmarkId = benchmark.id
      result.evaluation = benchmark
      await upsertResultOutput(tables, databaseId, ownerId, result)
    } catch (error) {
      benchmarkError = errorMessage(error)
    }

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
      benchmarkId,
      benchmarkError,
      updatedAt: new Date().toISOString(),
    }
    await upsertStoredRecord(tables, databaseId, RUNS, ownerId, run)

    const activeIntegrations = (
      automation.schema.social_integrations || []
    ).filter(
      (integration) =>
        clean(integration.integration_id) && !integration.disabled
    )
    const content = publishContent(plan)
    const mode = effectivePostingMode(automation.schema)
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

    if (mode === "auto") {
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
        runId,
        scheduledFor,
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
    throw error
  }
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
  const [rawCollections, wordCollections, usage, knowledgeBases] =
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
      listStoredRecords(
        tables,
        databaseId,
        PERMANENT_ASSETS,
        ownerId,
        "knowledge_base"
      ),
    ])
  const collections = rawCollections.map(normalizeCollection)
  const requested = new Set(automationCollectionIds(automation.schema))
  const available = collections.some((collection) =>
    collection.aliases.some((alias) => requested.has(alias))
  )
  if (!available) {
    throw new Error("No images are available for the automation collections")
  }
  return { collections, wordCollections, usage, knowledgeBases }
}

async function createPlan({
  automation,
  scheduledFor,
  runId,
  collections,
  wordCollections,
  usage,
  knowledgeBases,
}) {
  const schema = automation.schema
  const seed = seededBytes(`${runId}:${scheduledFor}`)
  const hookSelection = selectHook({
    schema,
    wordCollections,
    usage,
    automationId: automation.id,
    scheduledFor,
    seed,
  })
  const hook = applyHookCase(hookSelection.text, schema.prompt_formatting)
  const specs = slideSpecs(schema, hook)
  const placeholders = specs.flatMap((spec) =>
    spec.section !== "hook" && spec.displayText
      ? spec.textItems.filter((item) => item.textMode !== "static")
      : []
  )
  const generated = await generateText({
    schema,
    automation,
    hook,
    placeholders,
    knowledgeBases,
  })
  const selectedImages = await selectImages({
    schema,
    automation,
    hook,
    specs,
    generated,
    collections,
    usage,
    seed,
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
    }
  })
  await translatePlan(schema, slides)

  return {
    title: requiredGeneratedValue("title", generated.title),
    caption: requiredGeneratedValue("caption", generated.caption),
    hashtags: requiredGeneratedValue(
      "hashtags",
      normalizeHashtags(generated.hashtags)
    ),
    hook,
    hookTemplate: hookSelection.template,
    hookSubstitutions: hookSelection.substitutions,
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
    language: clean(schema.language) || "English",
    debug: { webSearchSources: generated.webSearchSources || [] },
  }
}

function selectHook({
  schema,
  wordCollections,
  usage,
  automationId,
  scheduledFor,
  seed,
}) {
  const candidates = automationHooks(schema)
  const usedHooks = new Set(
    usage
      .filter(
        (record) =>
          record.automation_id === automationId && record.kind === "hook"
      )
      .map((record) => normalizeSignature(record.key))
  )
  const usedCombinations = new Set(
    usage
      .filter(
        (record) =>
          record.automation_id === automationId &&
          record.kind === "hook_combination"
      )
      .map((record) => record.key)
  )
  const expanded = candidates.flatMap((template) =>
    expandAllHookCombinations(template, schema.hook_slots, wordCollections, {
      noDuplicates: schema.hook_no_duplicate_slots,
      caseMode: schema.prompt_formatting?.hook_case || "mixed",
      now: new Date(scheduledFor),
      timeZone: schema.schedule?.timezone,
    })
  )
  const available = expanded.filter((item) => {
    const combinationKey = hookCombinationKey(item.template, item.substitutions)
    return (
      !usedHooks.has(normalizeSignature(item.text)) &&
      (!Object.keys(item.substitutions).length ||
        !usedCombinations.has(combinationKey))
    )
  })
  if (!available.length) {
    throw new Error("No unused hook combinations remain for this automation.")
  }
  return available[seed[0] % available.length]
}

function automationHooks(schema) {
  const narrative = clean(schema.prompt_formatting?.narrative)
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
    .filter((line) => line && !isHookInstruction(line))
  if (narrative.length) return narrative
  const stored = (formatSection(schema, "hook").textItems || [])
    .map((item) =>
      item.textMode === "static"
        ? clean(item.staticText)
        : clean(item.contentDirection || item.text)
    )
    .filter((line) => line && !isHookInstruction(line))
  if (stored.length) return stored
  throw new Error("The automation database record has no usable hooks")
}

function isHookInstruction(value) {
  const normalized = value.toLowerCase()
  return (
    normalized.startsWith("hook text") ||
    normalized.startsWith("create ") ||
    normalized.includes("using narratives") ||
    normalized.includes("content varies based on narrative")
  )
}

function applyHookCase(text, promptFormatting) {
  const value = clean(text)
  const cased = applyResolvedHookCase(
    value,
    promptFormatting?.hook_case || "mixed"
  )
  return /all\s+lowercase/i.test(promptFormatting?.style || "")
    ? cased.toLowerCase()
    : cased
}

function slideSpecs(schema, hook) {
  const hookSection = formatSection(schema, "hook")
  const content = formatSection(schema, "content")
  const cta = formatSection(schema, "cta")
  const implied = Number(clean(hook).match(/^(\d{1,2})\s+[a-z]/i)?.[1])
  const contentCount =
    implied >= 1 && implied <= 10
      ? implied
      : Math.max(1, content.slideCount || 1)
  const ctaCount =
    cta.slideCount > 0 || schema.image_collection_ids?.cta_slide?.check
      ? Math.max(1, cta.slideCount || 1)
      : 0
  return [
    specForSection(schema, hookSection, "hook", 0),
    ...Array.from({ length: contentCount }, (_, index) => {
      const override = content.slideOverrides?.find(
        (item) => Number(item.slideIndex) === index + 1
      )
      const imageOverride = content.imageOverrides?.find(
        (item) => Number(item.slideIndex) === index + 1
      )
      return specForSection(
        schema,
        {
          ...content,
          ...(override
            ? {
                textItems: content.textItems.map((item, itemIndex) =>
                  itemIndex === 0
                    ? { ...item, contentDirection: override.contentDirection }
                    : item
                ),
              }
            : {}),
        },
        "content",
        index + 1,
        imageOverride?.collectionId
      )
    }),
    ...Array.from({ length: ctaCount }, (_, index) =>
      specForSection(schema, cta, "cta", contentCount + index + 1)
    ),
  ]
}

function specForSection(schema, section, role, index, collectionOverride) {
  const slideId = `${role}-${index + 1}`
  return {
    id: slideId,
    section: role,
    index,
    collectionId: collectionOverride || automationCollectionId(schema, role),
    aspectRatio: section.aspect_ratio || schema.aspect_ratio || "9:16",
    imageGrid: section.imageGrid || "none",
    overlay: section.overlay === true,
    aiImageSelection: section.aiImageSelection === true,
    displayText: !section.noText,
    overlayImage: section.overlayImage?.enabled
      ? {
          collectionId: clean(section.overlayImage.collectionId),
          padding: Math.max(0, Number(section.overlayImage.padding) || 0),
        }
      : undefined,
    textItems: (section.textItems || []).map((item, itemIndex) => ({
      ...item,
      id: `${slideId}__${item.id || `text-${itemIndex}`}`,
      itemId: item.id || `text-${itemIndex}`,
      slideId,
      section: role,
    })),
  }
}

async function generateText({
  schema,
  automation,
  hook,
  placeholders,
  knowledgeBases,
}) {
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  const knowledgeIds = new Set(schema.knowledge_base_ids || [])
  const selectedKnowledgeBases = knowledgeBases.filter((base) =>
    knowledgeIds.has(base.id)
  )
  const missingKnowledgeIds = [...knowledgeIds].filter(
    (id) => !selectedKnowledgeBases.some((base) => base.id === id)
  )
  if (missingKnowledgeIds.length) {
    throw new Error(
      `Knowledge bases are missing from the database: ${missingKnowledgeIds.join(", ")}`
    )
  }
  const knowledge = selectedKnowledgeBases
    .map((base) => clean(base.compiledText))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 60_000)
  if (knowledgeIds.size && !knowledge) {
    throw new Error("Configured knowledge bases contain no compiled text")
  }
  const properties = Object.fromEntries(
    placeholders.map((placeholder) => [
      placeholder.id,
      {
        type: "string",
        minLength: 1,
        description: `${placeholder.contentDirection || "Write slide copy"}. ${placeholder.wordLengthMin || 1}-${placeholder.wordLengthMax || 30} words.`,
      },
    ])
  )
  const responseFormat = {
    type: "json_schema",
    json_schema: {
      name: "scheduled_slideshow_text",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1 },
          caption: { type: "string", minLength: 1 },
          hashtags: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: { type: "string" },
          },
          text: {
            type: "object",
            additionalProperties: false,
            properties,
            required: Object.keys(properties),
          },
        },
        required: ["title", "caption", "hashtags", "text"],
      },
    },
  }
  const system =
    "You fill metadata and text placeholders for TikTok slideshow posts. The selected hook is the source of truth. Every body slide must directly develop that exact hook. Return only JSON matching the schema. Never invent studies, statistics, personal experience, results, testimonials, or sources."
  const user = [
    `Automation: ${automation.name}`,
    `Hook: ${hook}`,
    `Tone: ${schema.tone?.value || "Conversational & Relatable"}`,
    `Style: ${schema.prompt_formatting?.style || "native social slideshow"}`,
    `Narrative direction: ${schema.prompt_formatting?.narrative || ""}`,
    knowledge ? `Approved knowledge context:\n${knowledge}` : "",
    "Fill every placeholder. Follow its direction and word range. Use 3-5 broad niche hashtags.",
    ...placeholders.map(
      (item) =>
        `- ${item.id}: ${item.contentDirection || "write a specific point"}; ${item.wordLengthMin || 1}-${item.wordLengthMax || 30} words`
    ),
  ]
    .filter(Boolean)
    .join("\n")
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const model = defaultTextModel
    try {
      const payload = await openRouterRequest({
        apiKey,
        timeoutMs: 120_000,
        body: {
          model,
          stream: false,
          max_tokens: Math.min(
            8192,
            Math.max(2048, 512 + placeholders.length * 256)
          ),
          provider: { require_parameters: true },
          plugins: [
            { id: "response-healing" },
            ...(schema.web_search_enabled
              ? [{ id: "web", engine: "exa", max_results: 5 }]
              : []),
          ],
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content:
                attempt === 0
                  ? user
                  : `${user}\nThe prior attempt failed validation. Return the complete corrected object.`,
            },
          ],
          response_format: responseFormat,
        },
      })
      const parsed = parseJsonContent(payload.choices?.[0]?.message?.content)
      if (!clean(parsed?.title) || !clean(parsed?.caption)) {
        throw new Error("OpenRouter returned empty slideshow metadata")
      }
      const hashtags = Array.isArray(parsed?.hashtags)
        ? parsed.hashtags.map(clean).filter(Boolean)
        : []
      if (hashtags.length < 3 || hashtags.length > 5) {
        throw new Error("OpenRouter must return 3-5 slideshow hashtags")
      }
      for (const placeholder of placeholders) {
        if (!clean(parsed?.text?.[placeholder.id])) {
          throw new Error(`OpenRouter omitted ${placeholder.id}`)
        }
      }
      const lowercase = /all\s+lowercase/i.test(
        schema.prompt_formatting?.style || ""
      )
      const maybeLower = (value) =>
        lowercase ? clean(value).toLowerCase() : clean(value)
      return {
        title: maybeLower(parsed.title),
        caption: maybeLower(parsed.caption),
        hashtags: hashtags.map(maybeLower),
        text: Object.fromEntries(
          placeholders.map((placeholder) => [
            placeholder.id,
            maybeLower(parsed.text[placeholder.id]),
          ])
        ),
        model,
        webSearchSources: parseWebSources(
          payload.choices?.[0]?.message?.annotations
        ),
      }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `OpenRouter did not return complete slideshow text: ${errorMessage(lastError)}`
  )
}

async function selectImages({
  schema,
  automation,
  hook,
  specs,
  generated,
  collections,
  usage,
  seed,
}) {
  const recent = new Map(
    usage
      .filter(
        (record) =>
          record.automation_id === automation.id && record.kind === "image"
      )
      .map((record) => [record.key, record.used_at])
  )
  const usedKeys = new Set()
  const usedUrls = new Set()
  const selected = []
  for (const [index, spec] of specs.entries()) {
    if (!clean(spec.collectionId)) {
      throw new Error(`No image collection is configured for ${spec.id}`)
    }
    const pool = imagesForCollectionIds(collections, [spec.collectionId])
    if (!pool.length) {
      throw new Error(
        `No images exist in database collection ${spec.collectionId} for ${spec.id}`
      )
    }
    const fresh = pool.filter(
      (image) =>
        !usedKeys.has(image.key) &&
        !usedUrls.has(image.imageUrl) &&
        !recent.has(image.key)
    )
    const unused = pool.filter(
      (image) => !usedKeys.has(image.key) && !usedUrls.has(image.imageUrl)
    )
    const candidates = fresh.length ? fresh : unused.length ? unused : pool
    if (!candidates.length) continue
    let image = candidates[seed[(index + 1) % seed.length] % candidates.length]
    if (spec.aiImageSelection && candidates.length > 1) {
      image = await aiSelectImage({
        candidates,
        text: imageTextForSpec(spec, hook, generated),
      })
    }
    usedKeys.add(image.key)
    usedUrls.add(image.imageUrl)
    selected.push(image)
  }
  return selected
}

async function aiSelectImage({ candidates, text }) {
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for AI image selection")
  }
  const content = [
    {
      type: "text",
      text: `Slide text:\n${text}\n\nChoose from these candidate images:`,
    },
  ]
  for (const candidate of candidates) {
    content.push({
      type: "text",
      text: `Candidate ${candidate.id}: ${candidate.imageCaption || "No caption available"}`,
    })
    if (/^https?:\/\//i.test(candidate.imageUrl)) {
      content.push({
        type: "image_url",
        image_url: { url: candidate.imageUrl },
      })
    }
  }
  const payload = await openRouterRequest({
    apiKey,
    timeoutMs: 30_000,
    body: {
      model: defaultTextModel,
      messages: [
        {
          role: "system",
          content:
            "Select the supplied image id most relevant to the finalized slide text. Prefer a direct subject/action match over a generic aesthetic match.",
        },
        {
          role: "user",
          content,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "slideshow_image_match",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              selectedImageId: {
                type: "string",
                enum: candidates.map((item) => item.id),
              },
            },
            required: ["selectedImageId"],
          },
        },
      },
    },
  })
  const selectedId = parseJsonContent(
    payload.choices?.[0]?.message?.content
  )?.selectedImageId
  const selected = candidates.find((item) => item.id === selectedId)
  if (!selected) {
    throw new Error("AI image selection returned an unknown image id")
  }
  return selected
}

function imageTextForSpec(spec, hook, generated) {
  return (
    spec.textItems
      .map((item) =>
        item.textMode === "static"
          ? clean(item.staticText)
          : clean(generated.text?.[item.id])
      )
      .filter(Boolean)
      .join("\n") || hook
  )
}

function textItemsForSpec({ spec, hook, generated, schema }) {
  if (!spec.displayText) return []
  if (spec.section === "hook") {
    const item = spec.textItems[0] || {}
    return [slideshowTextItem(item, hook, schema, spec.section)]
  }
  if (!spec.textItems.length) {
    throw new Error(`${spec.id} displays text but has no configured text items`)
  }
  return spec.textItems.map((item) => {
    const text =
      item.textMode === "static"
        ? clean(item.staticText)
        : clean(generated.text?.[item.id])
    if (!text) {
      throw new Error(
        `${item.textMode === "static" ? "Static" : "Generated"} text is missing for ${item.id}`
      )
    }
    return slideshowTextItem(item, text, schema, spec.section)
  })
}

function slideshowTextItem(item, text, schema, role) {
  const placement = ["top", "center", "bottom"].includes(item.textPosition)
    ? item.textPosition
    : "top"
  const textAlign = item.textAlign || "center"
  const textAnchor = item.textAnchor || "padded"
  const y = placement === "bottom" ? 82 : placement === "center" ? 45 : 16
  return {
    id: item.itemId || item.id || crypto.randomUUID(),
    text,
    fontSize: item.fontSize || "10px",
    textSize: {
      width: textWidth(item.textItemWidth, text),
      height: 18,
    },
    textStyle: item.textStyle || "outline",
    textAlign,
    textAnchor,
    textVerticalAnchor: item.textVerticalAnchor || "padded",
    textPlacement: placement,
    textPosition: {
      x: slideshowTextPositionX(textAlign, textAnchor),
      y: role === "hook" && placement === "center" ? 45 : y,
    },
    font: item.font || schema.font,
  }
}

async function translatePlan(schema, slides) {
  const target = deepLTarget(schema.language)
  if (!target) return
  const apiKey = clean(process.env.DEEPL_KEY)
  if (!apiKey) throw new Error("DEEPL_KEY is not configured")
  const targets = slides.flatMap((slide) =>
    slide.textItems.map((item) => ({ object: item, key: "text" }))
  )
  const response = await fetch("https://api.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: targets.map(({ object, key }) => object[key]),
      target_lang: target,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.message || `DeepL failed (${response.status})`)
  }
  targets.forEach(({ object, key }, index) => {
    const translated = clean(payload.translations?.[index]?.text)
    if (!translated) {
      throw new Error(`DeepL omitted translation ${index + 1}`)
    }
    object[key] = translated
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
    const [sourceBytes, overlayBytes] = await Promise.all([
      loadAssetBytes(storage, planSlide.imageUrl),
      planSlide.overlayImage?.imageUrl
        ? loadAssetBytes(storage, planSlide.overlayImage.imageUrl)
        : Promise.resolve(null),
    ])
    const sourceUrl = await imageDataUrl(sourceBytes)
    const overlayUrl = overlayBytes
      ? await imageDataUrl(overlayBytes)
      : undefined
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
      textItems: planSlide.textItems,
    }
    const svg = renderedSlideSvg(storedSlide, sourceUrl, overlayUrl, {
      aspectRatio: settings.aspect_ratio,
      font: settings.font,
    })
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
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
    const stored = await uploadBufferToRendi({
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

  const submitted = await rendiJson(apiKey, "/v1/run-ffmpeg-command", {
    method: "POST",
    body: JSON.stringify({
      ffmpeg_command: command.join(" "),
      input_files: inputFiles,
      output_files: { out_video: "slideshow-export.mp4" },
      max_command_run_seconds: 300,
      vcpu_count: 4,
      metadata: { workflow: "slideshow_export" },
    }),
  })
  if (!clean(submitted?.command_id)) {
    throw new Error("Rendi did not return a command id")
  }
  const completed = await pollRendi(
    () => rendiJson(apiKey, `/v1/commands/${submitted.command_id}`),
    (commandStatus) => {
      if (commandStatus?.status === "FAILED") {
        throw new Error(
          clean(commandStatus.error_message) ||
            clean(commandStatus.error_status) ||
            "Rendi FFmpeg command failed"
        )
      }
      return commandStatus?.status === "SUCCESS" ? commandStatus : null
    },
    240,
    "Rendi FFmpeg command timed out"
  )
  const downloadUrl = clean(completed.output_files?.out_video?.storage_url)
  if (!downloadUrl) {
    throw new Error("Rendi command finished without a video download URL")
  }
  const download = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(120_000),
  })
  if (!download.ok) {
    throw new Error(`Rendi video download failed (${download.status})`)
  }
  const buffer = Buffer.from(await download.arrayBuffer())
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

async function uploadBufferToRendi({ apiKey, bytes, fileName }) {
  if (!bytes?.length) throw new Error("Rendi upload requires non-empty bytes")
  const initialized = await rendiJson(apiKey, "/v1/files/init-upload", {
    method: "POST",
    body: JSON.stringify({ filename: fileName, size_bytes: bytes.length }),
  })
  if (
    !clean(initialized?.file_id) ||
    !Number.isFinite(initialized?.part_size) ||
    !Array.isArray(initialized?.upload_urls) ||
    initialized.upload_urls.length === 0
  ) {
    throw new Error("Rendi did not return valid upload URLs")
  }
  const parts = []
  for (const [index, uploadUrl] of initialized.upload_urls.entries()) {
    const start = index * initialized.part_size
    const part = bytes.subarray(start, start + initialized.part_size)
    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: part,
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) {
      throw new Error(`Rendi file part upload failed (${response.status})`)
    }
    const etag = response.headers.get("etag")
    if (!etag) throw new Error("Rendi file part upload did not return an ETag")
    parts.push({ part_number: index + 1, etag })
  }
  const completed = await rendiJson(
    apiKey,
    `/v1/files/${initialized.file_id}/complete-upload`,
    { method: "POST", body: JSON.stringify({ parts }) }
  )
  if (completed?.status === "STORED" && clean(completed.storage_url)) {
    return completed
  }
  return pollRendi(
    () => rendiJson(apiKey, `/v1/files/${initialized.file_id}`),
    (file) => {
      if (file?.status === "FAILED") {
        throw new Error(
          clean(file.external_error_message) ||
            clean(file.error_status) ||
            "Rendi file upload failed"
        )
      }
      return file?.status === "STORED" && clean(file.storage_url) ? file : null
    },
    120,
    "Rendi file upload timed out"
  )
}

async function rendiJson(apiKey, path, init = {}) {
  const response = await fetch(`https://api.rendi.dev${path}`, {
    ...init,
    headers: {
      "X-API-KEY": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      clean(payload?.detail) || `Rendi request failed (${response.status})`
    )
  }
  return payload
}

async function pollRendi(request, select, maxAttempts, timeoutMessage) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const selected = select(await request())
    if (selected) return selected
    await delay(5_000)
  }
  throw new Error(timeoutMessage)
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

async function benchmarkSlideshow({
  automation,
  ownerId,
  runId,
  slideshow,
  plan,
}) {
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  const content = [
    {
      type: "text",
      text: `Grade this ${slideshow.renderedBuffers.length}-slide social carousel from 0-10 on hookVirality, pictureTextFit, usefulnessToIcp, and conversationPotential. Title: ${plan.title}. Return strict JSON.`,
    },
  ]
  for (const [index, bytes] of slideshow.renderedBuffers.entries()) {
    const compact = await sharp(bytes)
      .resize({ width: 640, height: 960, fit: "inside" })
      .jpeg({ quality: 68 })
      .toBuffer()
    content.push({
      type: "text",
      text: `Slide ${index + 1}: ${plan.slides[index]?.text || ""}`,
    })
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${compact.toString("base64")}`,
      },
    })
  }
  const keys = [
    "hookVirality",
    "pictureTextFit",
    "usefulnessToIcp",
    "conversationPotential",
  ]
  const scoreProperties = Object.fromEntries(
    keys.map((key) => [key, { type: "integer", minimum: 0, maximum: 10 }])
  )
  const rationaleProperties = Object.fromEntries(
    keys.map((key) => [key, { type: "string" }])
  )
  const response = await openRouterRequest({
    apiKey,
    timeoutMs: 90_000,
    body: {
      model: benchmarkModel,
      messages: [
        {
          role: "system",
          content:
            "You are a strict short-form slideshow benchmarker. Judge rendered pixels, text legibility, image relevance, specificity, narrative progression, and the close. A 5 is average; 8+ requires unusually strong evidence.",
        },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "slideshow_benchmark",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              scores: {
                type: "object",
                additionalProperties: false,
                properties: scoreProperties,
                required: keys,
              },
              rationales: {
                type: "object",
                additionalProperties: false,
                properties: rationaleProperties,
                required: keys,
              },
            },
            required: ["scores", "rationales"],
          },
        },
      },
    },
  })
  const grade = parseJsonContent(response.choices?.[0]?.message?.content)
  const scores = Object.fromEntries(
    keys.map((key) => [
      key,
      Math.max(0, Math.min(10, Math.round(Number(grade?.scores?.[key]) || 0))),
    ])
  )
  scores.overall =
    Math.round(
      (keys.reduce((sum, key) => sum + scores[key], 0) / keys.length) * 10
    ) / 10
  return {
    id: `benchmark-${runId}`,
    slideshowId: slideshow.id,
    runId,
    automationId: automation.id,
    title: plan.title,
    icp: [plan.title, ...plan.slides.map((slide) => slide.text)].join(" · "),
    slides: slideshow.renderedSlides.map((slide) => ({
      id: slide.id,
      imageUrl: slide.imageUrl,
      originalImageUrl: slide.sourceImageUrl,
      text: slide.text,
      role: slide.role,
    })),
    scores,
    rationales: Object.fromEntries(
      keys.map((key) => [key, clean(grade?.rationales?.[key])])
    ),
    model: benchmarkModel,
    createdAt: new Date().toISOString(),
    ownerId,
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
  const signed = await postFastRequest("/file/get-signed-upload-urls", {
    contentType,
    count: sources.length,
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
      const response = await postFastRequest(
        "/social-posts",
        postFastSchedulePayload({
          content,
          integrationId: integration.integration_id,
          media,
          provider: integration.provider,
          scheduledFor,
          settings: schema.social_post_settings?.[integration.provider],
        })
      )
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
  const record = {
    ...existing,
    id:
      existing?.id || postRecordId(ownerId, runId, integration.integration_id),
    sourceType: "automation",
    sourceId: runId,
    postfastPostId: postfastPostId || existing?.postfastPostId,
    integrationId: integration.integration_id,
    provider: integration.provider,
    status,
    scheduledAt: scheduledFor,
    content,
    media,
    error,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastSyncedAt: now,
    ownerId,
  }
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
  runId,
  scheduledFor,
  text,
}) {
  const now = new Date().toISOString()
  const dedupe = `manual-post:${runId}:${scheduledFor}`
  const id = jobId(`${ownerId}:${dedupe}`)
  try {
    await tables.createRow(databaseId, JOBS, id, {
      type: "send-notification",
      status: "queued",
      payload: JSON.stringify({ text }),
      priority: 0,
      attempts: 0,
      max_attempts: 5,
      available_at: Date.parse(scheduledFor) > Date.now() ? scheduledFor : now,
      dedupe_key: dedupe,
      created_at: now,
      updated_at: now,
      owner_id: ownerId,
    })
  } catch (error) {
    if (error?.code !== 409) throw error
  }
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
  if (!isHookInstruction(plan.hook)) {
    records.push({ kind: "hook", key: normalizeSignature(plan.hook) })
  }
  if (plan.hookTemplate && Object.keys(plan.hookSubstitutions || {}).length) {
    records.push({
      kind: "hook_combination",
      key: hookCombinationKey(plan.hookTemplate, plan.hookSubstitutions),
    })
  }
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

async function imageDataUrl(bytes) {
  const image = sharp(bytes, { animated: false })
  const metadata = await image.metadata()
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

async function postFastRequest(path, body) {
  const apiKey = clean(process.env.POSTFAST_API_KEY)
  if (!apiKey) throw new Error("POSTFAST_API_KEY is not configured")
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://api.postfa.st${path}`, {
        method: "POST",
        headers: { "pf-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.ok) return payload
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === 3) {
        throw new Error(
          payload?.message ||
            payload?.error?.message ||
            `PostFast failed (${response.status})`
        )
      }
    } catch (error) {
      lastError = error
      if (attempt === 3) break
    }
    await delay(500 * 2 ** (attempt - 1))
  }
  throw lastError || new Error("PostFast request failed")
}

async function openRouterRequest({ apiKey, body, timeoutMs }) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `OpenRouter failed (${response.status})`
    )
  }
  return payload
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
  await tables.upsertRow(databaseId, table, rowId, {
    rid: rid.slice(0, 1024),
    name:
      clean(record.name || record.title || record.automationTitle).slice(
        0,
        2048
      ) || null,
    status: clean(record.status).slice(0, 255) || null,
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
    publication_status: publicationSummary(publications).status,
    scheduled_at: publicationSummary(publications).scheduledAt,
    published_at: publicationSummary(publications).publishedAt,
    primary_post_id: publicationSummary(publications).postId,
    primary_release_url: publicationSummary(publications).releaseUrl,
    publications: JSON.stringify(publications),
    evaluation: JSON.stringify(record.evaluation || null),
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
    await tables.createRow(
      databaseId,
      OUTPUT_MEDIA,
      outputMediaRowId(outputRowId, item),
      {
        output_id: outputRowId,
        owner_id: ownerId,
        permanent_asset_id: null,
        kind: item.kind,
        role: item.role,
        position: item.position,
        storage_bucket: path ? bucketForPath(path) : null,
        storage_file_id: path ? fileId(path) : null,
        storage_path: path,
        url: item.url,
        mime_type: null,
        bytes: null,
        width: null,
        height: null,
        duration_ms: null,
        checksum: null,
        data: "null",
        created_at: new Date().toISOString(),
      }
    )
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
  const summary = publicationSummary(publications)
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

function publicationSummary(publications) {
  const rank = [
    "published",
    "scheduled",
    "ready_for_review",
    "awaiting_manual_post",
    "failed",
    "draft",
  ]
  const primary = rank
    .flatMap((status) =>
      publications.filter((record) => record.status === status)
    )
    .at(0)
  return {
    status: primary?.status || null,
    scheduledAt:
      publications.find((record) => record.scheduledAt)?.scheduledAt || null,
    publishedAt:
      publications.find((record) => record.publishedAt)?.publishedAt || null,
    postId:
      publications.find((record) => record.postfastPostId)?.postfastPostId ||
      null,
    releaseUrl:
      publications.find((record) => record.releaseUrl)?.releaseUrl || null,
  }
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
        id: clean(image.hash) || `${id}-${index}`,
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

function textWidth(value, text) {
  const parsed = Number(clean(value).replace("%", ""))
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : Math.max(20, Math.min(100, text.length * 4))
}

function deepLTarget(language) {
  switch (clean(language).toLowerCase()) {
    case "chinese":
      return "ZH-HANS"
    case "malay":
      return "MS"
    case "indian":
    case "hindi":
      return "HI"
    case "spanish":
      return "ES"
    default:
      return null
  }
}

function parseWebSources(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((annotation) => {
    const nested = annotation?.url_citation || annotation
    return clean(nested?.url)
      ? [
          {
            url: clean(nested.url),
            title: clean(nested.title) || undefined,
            content: clean(nested.content) || undefined,
          },
        ]
      : []
  })
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
    "knowledge-base-files": "knowledge_base_files",
    benchmarks: "benchmark_images",
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

function hookCombinationKey(template, substitutions) {
  return `${template}::${Object.entries(substitutions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|")}`
}

function normalizeSignature(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ")
}

function seededBytes(value) {
  return crypto.createHash("sha256").update(value).digest()
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function parseJsonContent(value) {
  if (value && typeof value === "object") return value
  return safeJson(
    clean(value)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
  )
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
