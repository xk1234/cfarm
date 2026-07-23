import { clean, isRecord } from "@/lib/guards"
import type {
  AutomationRunRecord,
  AutomationRunSlide,
} from "@/lib/automation-runner"
import type { GeneratedVideoExport } from "@/lib/generated-videos"
import type {
  PostFastMetricSnapshot,
  TikTokStudioSlideMetric,
} from "@/lib/postfast-metric-snapshots"
import type { PostFastPostRecord } from "@/lib/postfast-posts"
import type { SlideshowRecord } from "@/lib/slideshows"
import type {
  TikTokStudioImportRecord,
  TikTokStudioOverview,
} from "@/lib/tiktok-studio-analytics"

export type TikTokStudioReportInput = {
  importId?: string
  batchId?: string
  postIds?: string[]
  integrationIds?: string[]
  automationId?: string
  days: number
  offset: number
  limit: number
  historyLimit: number
  now: Date
}

export type TikTokStudioReportServices = {
  listMetricSnapshots: () => Promise<PostFastMetricSnapshot[]>
  listPostFastPostRecords: () => Promise<PostFastPostRecord[]>
  listAutomationRuns: (input: {
    limit: number
  }) => Promise<AutomationRunRecord[]>
  listSlideshowRecords: (input: {
    ids: string[]
    limit: number
  }) => Promise<SlideshowRecord[]>
  listGeneratedVideoExports: (input: {
    limit: number
  }) => Promise<GeneratedVideoExport[]>
  inspectTikTokStudioAnalyticsImport: (
    importId: string
  ) => Promise<TikTokStudioImportRecord>
  inspectTikTokStudioAnalyticsBatch: (
    batchId: string
  ) => Promise<{ items: Array<{ id: string }> }>
}

type ReportCandidate = {
  publication?: PostFastPostRecord
  postId: string
  externalPostId?: string
  integrationId: string
  sourceType?: string
  sourceId?: string
  importRecord?: TikTokStudioImportRecord
  snapshots: PostFastMetricSnapshot[]
  latestSnapshot?: PostFastMetricSnapshot
  run?: AutomationRunRecord
  automationId?: string
  sortAt: string
}

type TikTokStudioSection = "overview" | "viewers" | "engagement"

type StudioSnapshotComposition = {
  currentSnapshot?: PostFastMetricSnapshot
  effectiveSnapshot?: PostFastMetricSnapshot
  effectiveSections: TikTokStudioSection[]
  currentSections: TikTokStudioSection[]
  missingCurrentSections: TikTokStudioSection[]
  isCurrentPartial: boolean
  sectionSources: Partial<
    Record<TikTokStudioSection, { snapshotId: string; capturedAt: string }>
  >
}

export async function buildTikTokStudioMcpReport(
  input: TikTokStudioReportInput,
  services: TikTokStudioReportServices
) {
  if (input.importId && input.batchId) {
    throw new Error("Choose importId or batchId, not both")
  }
  const [snapshots, publications, runs, videos, imports] = await Promise.all([
    services.listMetricSnapshots(),
    services.listPostFastPostRecords(),
    services.listAutomationRuns({ limit: 500 }),
    services.listGeneratedVideoExports({ limit: 500 }),
    reportImports(input, services),
  ])
  const candidates = reportCandidates({
    input,
    snapshots,
    publications,
    runs,
    imports,
  })
  const total = candidates.length
  const page = candidates.slice(input.offset, input.offset + input.limit)
  const slideshowIds = [
    ...new Set(
      page
        .map((candidate) => slideshowIdFor(candidate))
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const slideshows =
    slideshowIds.length > 0
      ? await services.listSlideshowRecords({
          ids: slideshowIds,
          limit: slideshowIds.length,
        })
      : []
  const slideshowById = new Map(slideshows.map((item) => [item.id, item]))
  const videoById = new Map(videos.map((item) => [item.id, item]))

  return {
    generatedAt: input.now.toISOString(),
    scope: {
      importId: clean(input.importId) || undefined,
      batchId: clean(input.batchId) || undefined,
      postIds: input.postIds,
      integrationIds: input.integrationIds,
      automationId: clean(input.automationId) || undefined,
      days: input.days,
    },
    pagination: {
      offset: input.offset,
      limit: input.limit,
      total,
      hasMore: input.offset + page.length < total,
      nextOffset:
        input.offset + page.length < total
          ? input.offset + page.length
          : undefined,
    },
    posts: page.map((candidate) =>
      reportPost({
        candidate,
        slideshow: slideshowById.get(slideshowIdFor(candidate) ?? ""),
        video: videoById.get(candidate.sourceId ?? ""),
        historyLimit: input.historyLimit,
      })
    ),
  }
}

async function reportImports(
  input: TikTokStudioReportInput,
  services: TikTokStudioReportServices
) {
  if (input.importId) {
    return [await services.inspectTikTokStudioAnalyticsImport(input.importId)]
  }
  if (!input.batchId) return []
  const batch = await services.inspectTikTokStudioAnalyticsBatch(input.batchId)
  return Promise.all(
    batch.items.map((item) =>
      services.inspectTikTokStudioAnalyticsImport(item.id)
    )
  )
}

function reportCandidates(input: {
  input: TikTokStudioReportInput
  snapshots: PostFastMetricSnapshot[]
  publications: PostFastPostRecord[]
  runs: AutomationRunRecord[]
  imports: TikTokStudioImportRecord[]
}) {
  const publicationById = new Map(
    input.publications.map((item) => [item.id, item])
  )
  const importsByPost = new Map(
    input.imports.map((item) => [item.targetPostId, item])
  )
  const snapshotsByPost = new Map<string, PostFastMetricSnapshot[]>()
  for (const snapshot of input.snapshots) {
    if (snapshot.source !== "tiktok_studio") continue
    const current = snapshotsByPost.get(snapshot.postId) ?? []
    current.push(snapshot)
    snapshotsByPost.set(snapshot.postId, current)
  }
  const runById = new Map(input.runs.map((item) => [item.id, item]))
  const runBySlideshowId = new Map(
    input.runs.flatMap((item) =>
      item.slideshowId ? [[item.slideshowId, item] as const] : []
    )
  )
  const postIds = new Set(
    input.imports.length > 0 ? importsByPost.keys() : snapshotsByPost.keys()
  )
  const requestedPosts = new Set(
    (input.input.postIds ?? []).map(clean).filter(Boolean)
  )
  const requestedIntegrations = new Set(
    (input.input.integrationIds ?? []).map(clean).filter(Boolean)
  )
  const since =
    input.input.now.getTime() - input.input.days * 24 * 60 * 60 * 1000
  const candidates: ReportCandidate[] = []

  for (const postId of postIds) {
    const publication = publicationById.get(postId)
    const importRecord = importsByPost.get(postId)
    const snapshots = (snapshotsByPost.get(postId) ?? []).sort((left, right) =>
      right.capturedAt.localeCompare(left.capturedAt)
    )
    const latestSnapshot = snapshots[0]
    const externalPostId =
      importRecord?.externalPostId ||
      clean(publication?.externalPostId) ||
      clean(latestSnapshot?.platformPostId) ||
      undefined
    const integrationId =
      publication?.integrationId ?? latestSnapshot?.integrationId ?? ""
    const sourceType =
      publication?.sourceType ?? latestSnapshot?.sourceType ?? undefined
    const sourceId =
      publication?.sourceId ?? latestSnapshot?.sourceId ?? undefined
    const run =
      (sourceType === "automation" && sourceId
        ? runById.get(sourceId)
        : undefined) ??
      (sourceType === "slideshow" && sourceId
        ? runBySlideshowId.get(sourceId)
        : undefined)
    const automationId =
      run?.automationId ??
      (sourceType === "automation" ? sourceId : undefined) ??
      (clean(
        isRecord(publication)
          ? (publication as Record<string, unknown>).automationId
          : undefined
      ) ||
        undefined)
    const sortAt =
      importRecord?.updatedAt ??
      latestSnapshot?.capturedAt ??
      publication?.updatedAt ??
      ""
    const requested =
      requestedPosts.size === 0 ||
      requestedPosts.has(postId) ||
      Boolean(externalPostId && requestedPosts.has(externalPostId))

    if (
      !requested ||
      (requestedIntegrations.size > 0 &&
        !requestedIntegrations.has(integrationId)) ||
      (input.input.automationId && automationId !== input.input.automationId) ||
      (!importRecord &&
        (!latestSnapshot || Date.parse(latestSnapshot.capturedAt) < since))
    ) {
      continue
    }
    candidates.push({
      publication,
      postId,
      externalPostId,
      integrationId,
      sourceType,
      sourceId,
      importRecord,
      snapshots,
      latestSnapshot,
      run,
      automationId,
      sortAt,
    })
  }
  return candidates.sort((left, right) =>
    right.sortAt.localeCompare(left.sortAt)
  )
}

function reportPost(input: {
  candidate: ReportCandidate
  slideshow?: SlideshowRecord
  video?: GeneratedVideoExport
  historyLimit: number
}) {
  const { candidate } = input
  const publication = candidate.publication
  const composition = composeStudioSnapshots(candidate.snapshots)
  const snapshot =
    composition.effectiveSnapshot ?? composition.currentSnapshot
  const currentSnapshot = composition.currentSnapshot
  const importRecord = candidate.importRecord
  const studio = analyticsDetail(importRecord, snapshot, composition)
  const output = input.slideshow
    ? slideshowDetail(input.slideshow, candidate.run, studio.slides)
    : input.video
      ? videoDetail(input.video)
      : null
  const outputSlideCount =
    output?.kind === "slideshow" ? output.slides.length : undefined
  const analyticsIndexes = studio.slides.map((slide) => slide.slideIndex)
  const unmatchedAnalyticsSlideIndexes =
    outputSlideCount === undefined
      ? analyticsIndexes
      : analyticsIndexes.filter((index) => index > outputSlideCount)

  return {
    publication: {
      id: candidate.postId,
      externalPostId: candidate.externalPostId,
      integrationId: candidate.integrationId,
      provider:
        publication?.provider ??
        currentSnapshot?.provider ??
        snapshot?.provider ??
        "tiktok",
      status: publication?.status,
      publishedAt:
        publication?.publishedAt ??
        currentSnapshot?.publishedAt ??
        snapshot?.publishedAt,
      createdAt: publication?.createdAt,
      releaseUrl:
        publication?.releaseUrl ??
        currentSnapshot?.releaseUrl ??
        snapshot?.releaseUrl,
      content:
        publication?.content ?? currentSnapshot?.content ?? snapshot?.content,
      media: publication?.media ?? [],
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      automationId: candidate.automationId,
      runId: candidate.run?.id,
    },
    analytics: studio,
    history: candidate.snapshots
      .slice(0, input.historyLimit)
      .map((item) => snapshotHistory(item, composition.effectiveSections)),
    output,
    mapping: {
      kind: output?.kind ?? "unresolved",
      outputResolved: Boolean(output),
      outputSlideCount,
      analyticsSlideCount: studio.slides.length,
      matchedSlideCount:
        outputSlideCount === undefined
          ? 0
          : studio.slides.filter(
              (slide) => slide.slideIndex <= outputSlideCount
            ).length,
      unmatchedAnalyticsSlideIndexes,
      issues: [
        ...(!output
          ? ["No persisted LumenClip slideshow or video could be resolved"]
          : []),
        ...(unmatchedAnalyticsSlideIndexes.length > 0
          ? [
              `Studio contains analytics for slide indexes with no matching LumenClip slide: ${unmatchedAnalyticsSlideIndexes.join(", ")}`,
            ]
          : []),
        ...(studio.slideMetricsAvailability.status === "unavailable" &&
        output?.kind === "slideshow"
          ? [
              "Studio returned slide indexes but no retention or like-distribution values; slide-level performance is unavailable for this capture.",
            ]
          : []),
        ...(studio.slideMetricsAvailability.status === "partial" &&
        studio.slideMetricsAvailability.missingRetentionSlideIndexes.length > 0
          ? [
              `Retention is missing for Studio slide indexes: ${studio.slideMetricsAvailability.missingRetentionSlideIndexes.join(", ")}`,
            ]
          : []),
      ],
    },
  }
}

function analyticsDetail(
  importRecord: TikTokStudioImportRecord | undefined,
  snapshot: PostFastMetricSnapshot | undefined,
  composition: StudioSnapshotComposition
) {
  const persisted = snapshot?.tiktokStudio
  const capture = importRecord?.capture
  const slides = mergeStudioSlides(persisted?.slides ?? [], capture?.slides ?? [])
  const capturedSections = uniqueStudioSections([
    ...(persisted?.capturedSections ?? []),
    ...(importRecord?.capturedSections ?? []),
  ])
  const slideMetricsAvailability = describeSlideMetrics(slides)
  return {
    state: importRecord?.status ?? "linked",
    importId: importRecord?.id,
    snapshotId:
      composition.currentSnapshot?.id ??
      snapshot?.id ??
      importRecord?.linkedSnapshotId,
    capturedAt:
      composition.currentSnapshot?.capturedAt ??
      snapshot?.capturedAt ??
      importRecord?.updatedAt,
    studioUrl: importRecord?.studioUrl ?? persisted?.studioUrl,
    capturedSections,
    currentSnapshot: composition.currentSnapshot
      ? {
          snapshotId: composition.currentSnapshot.id,
          capturedAt: composition.currentSnapshot.capturedAt,
          capturedSections: composition.currentSections,
          partial: composition.isCurrentPartial,
          missingSections: composition.missingCurrentSections,
        }
      : undefined,
    effectiveSnapshotIds: [
      ...new Set(
        Object.values(composition.sectionSources).map(
          (source) => source.snapshotId
        )
      ),
    ],
    sectionSources: composition.sectionSources,
    isCurrentPartial: composition.isCurrentPartial,
    missingCurrentSections: composition.missingCurrentSections,
    readyToLink:
      Boolean(importRecord) &&
      importRecord?.status !== "linked" &&
      capturedSections.includes("overview"),
    overview:
      persisted?.overview || capture?.overview
        ? {
            ...(persisted?.overview ?? {}),
            ...(capture?.overview ?? {}),
          }
        : overviewFromSnapshot(snapshot),
    metrics: snapshot?.metrics ?? {},
    rawMetrics: snapshot?.rawMetrics ?? {},
    slides,
    slideMetricsAvailability,
    trafficSources:
      capture && Object.keys(capture.trafficSources).length > 0
        ? capture.trafficSources
        : (persisted?.trafficSources ?? {}),
    searchTerms:
      capture && capture.searchTerms.length > 0
        ? capture.searchTerms
        : (persisted?.searchTerms ?? []),
    audience: capture?.audience ?? persisted?.audience,
  }
}

function slideshowDetail(
  slideshow: SlideshowRecord,
  run: AutomationRunRecord | undefined,
  studioSlides: TikTokStudioSlideMetric[]
) {
  const analyticsByIndex = new Map(
    studioSlides.map((item) => [item.slideIndex, item])
  )
  return {
    kind: "slideshow" as const,
    id: slideshow.id,
    runId: slideshow.runId ?? run?.id,
    automationId: slideshow.automationId ?? run?.automationId,
    title: slideshow.title,
    caption: slideshow.caption,
    hashtags: slideshow.hashtags,
    prompt: slideshow.prompt,
    slideshowType: slideshow.slideshow_type,
    imageCollectionId: slideshow.image_collection,
    status: slideshow.status,
    createdAt: slideshow.created_at,
    updatedAt: slideshow.updated_at,
    settings: slideshow.settings,
    thumbnailUrl: slideshow.thumbnail_url,
    videoUrl: slideshow.video_url,
    renderedImages: slideshow.output_images,
    slides: slideshow.images.map((slide, index) => {
      const planSlide = run?.plan.slides[index]
      return {
        index: index + 1,
        id: slide.id,
        role: planSlide?.role,
        analytics: analyticsByIndex.get(index + 1),
        text: {
          primary: planSlide?.text ?? slide.textItems[0]?.text ?? "",
          items: slide.textItems,
        },
        media: {
          imageUrl: slide.image_url,
          sourceImageUrl: slide.source_image_url,
          renderedImageUrl: slideshow.output_images[index],
          imageCaption: planSlide?.imageCaption,
          imageKey: planSlide?.imageKey,
          fit: slide.imageFit,
          overlay: slide.overlay,
          overlayImage: slide.overlayImage,
          iconLayout: slide.iconLayout,
        },
        durationSeconds: slideshow.settings.duration,
        generation: planSlide ? planSlideDetail(planSlide) : undefined,
      }
    }),
  }
}

function planSlideDetail(slide: AutomationRunSlide) {
  return {
    id: slide.id,
    role: slide.role,
    imageCaption: slide.imageCaption,
    textPlacement: slide.textPlacement,
    aspectRatio: slide.aspectRatio,
    imageGrid: slide.imageGrid,
    displayText: slide.displayText,
  }
}

function videoDetail(video: GeneratedVideoExport) {
  return {
    kind: "video" as const,
    id: video.id,
    type: video.type,
    status: video.status,
    title: video.title,
    description: video.description,
    hashtags: video.hashtags,
    automationId:
      video.sourceAutomationId ?? clean(video.sourceConfig.automationId),
    runId: video.sourceRunId,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    previewUrl: video.previewUrl,
    videoUrl: video.videoUrl,
    sourceConfig: safeMcpValue(video.sourceConfig),
    publication: safeMcpValue(video.publication),
    error: video.error,
  }
}

function snapshotHistory(
  snapshot: PostFastMetricSnapshot,
  effectiveSections: TikTokStudioSection[]
) {
  const capturedSections = snapshot.tiktokStudio?.capturedSections ?? []
  const missingSections = effectiveSections.filter(
    (section) => !capturedSections.includes(section)
  )
  return {
    snapshotId: snapshot.id,
    capturedAt: snapshot.capturedAt,
    metrics: snapshot.metrics,
    rawMetrics: snapshot.rawMetrics,
    capturedSections,
    partial: missingSections.length > 0,
    missingSections,
    slides: snapshot.tiktokStudio?.slides ?? [],
    slideMetricsAvailability: describeSlideMetrics(
      snapshot.tiktokStudio?.slides ?? []
    ),
    studio: snapshot.tiktokStudio,
  }
}

function composeStudioSnapshots(
  snapshots: PostFastMetricSnapshot[]
): StudioSnapshotComposition {
  const ordered = [...snapshots].sort((left, right) =>
    right.capturedAt.localeCompare(left.capturedAt)
  )
  const currentSnapshot = ordered[0]
  if (!currentSnapshot) {
    return {
      effectiveSections: [],
      currentSections: [],
      missingCurrentSections: [],
      isCurrentPartial: false,
      sectionSources: {},
    }
  }
  const oldestFirst = [...ordered].reverse()
  const metrics = Object.assign({}, ...oldestFirst.map((item) => item.metrics))
  const rawMetrics = Object.assign(
    {},
    ...oldestFirst.map((item) => item.rawMetrics)
  )
  const latestWithOverview = ordered.find(
    (item) =>
      item.tiktokStudio?.overview ||
      item.tiktokStudio?.capturedSections.includes("overview")
  )
  const latestWithViewers = ordered.find(
    (item) =>
      item.tiktokStudio?.audience ||
      item.tiktokStudio?.capturedSections.includes("viewers")
  )
  const latestWithEngagement = ordered.find(
    (item) =>
      item.tiktokStudio?.capturedSections.includes("engagement") ||
      item.tiktokStudio?.slides.some(
        (slide) => slide.likeDistributionPercent !== undefined
      )
  )
  const sectionEntries = [
    ["overview", latestWithOverview],
    ["viewers", latestWithViewers],
    ["engagement", latestWithEngagement],
  ] as const
  const sectionSources = Object.fromEntries(
    sectionEntries.flatMap(([section, item]) =>
      item
        ? [
            [
              section,
              { snapshotId: item.id, capturedAt: item.capturedAt },
            ] as const,
          ]
        : []
    )
  ) as StudioSnapshotComposition["sectionSources"]
  const effectiveSections = sectionEntries.flatMap(([section, item]) =>
    item ? [section] : []
  )
  const currentSections =
    currentSnapshot.tiktokStudio?.capturedSections ?? []
  const missingCurrentSections = effectiveSections.filter(
    (section) => !currentSections.includes(section)
  )
  const studioSnapshots = oldestFirst
    .map((item) => item.tiktokStudio)
    .filter((item) => item !== undefined)
  const overview = Object.assign(
    {},
    ...studioSnapshots.map((item) => item.overview ?? {})
  )
  const trafficSources =
    [...studioSnapshots]
      .reverse()
      .find((item) => Object.keys(item.trafficSources).length > 0)
      ?.trafficSources ?? {}
  const searchTerms =
    [...studioSnapshots]
      .reverse()
      .find((item) => item.searchTerms.length > 0)?.searchTerms ?? []
  const audience = [...studioSnapshots]
    .reverse()
    .find((item) => item.audience)?.audience
  const slides = studioSnapshots.reduce<TikTokStudioSlideMetric[]>(
    (current, item) => mergeStudioSlides(current, item.slides),
    []
  )
  const studioUrl =
    currentSnapshot.tiktokStudio?.studioUrl ??
    [...studioSnapshots].reverse()[0]?.studioUrl ??
    ""
  const effectiveSnapshot: PostFastMetricSnapshot = {
    ...currentSnapshot,
    metrics,
    rawMetrics,
    latestMetric: rawMetrics,
    observedKeys: [...new Set(ordered.flatMap((item) => item.observedKeys))],
    tiktokStudio:
      studioSnapshots.length > 0
        ? {
            schemaVersion: 1,
            studioUrl,
            capturedSections: effectiveSections,
            overview:
              Object.keys(overview).length > 0 ? overview : undefined,
            slides,
            trafficSources,
            searchTerms,
            audience,
          }
        : undefined,
  }
  return {
    currentSnapshot,
    effectiveSnapshot,
    effectiveSections,
    currentSections,
    missingCurrentSections,
    isCurrentPartial: missingCurrentSections.length > 0,
    sectionSources,
  }
}

function mergeStudioSlides(
  current: TikTokStudioSlideMetric[],
  incoming: TikTokStudioSlideMetric[]
) {
  const byIndex = new Map<number, TikTokStudioSlideMetric>()
  for (const slide of [...current, ...incoming]) {
    const existing = byIndex.get(slide.slideIndex)
    byIndex.set(slide.slideIndex, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(slide).filter(([, value]) => value !== undefined)
      ),
      slideIndex: slide.slideIndex,
    })
  }
  return [...byIndex.values()].sort(
    (left, right) => left.slideIndex - right.slideIndex
  )
}

function describeSlideMetrics(slides: TikTokStudioSlideMetric[]) {
  const retentionCount = slides.filter(
    (slide) => slide.retentionPercent !== undefined
  ).length
  const likeDistributionCount = slides.filter(
    (slide) => slide.likeDistributionPercent !== undefined
  ).length
  const availableCount = slides.filter(
    (slide) =>
      slide.retentionPercent !== undefined ||
      slide.likeDistributionPercent !== undefined
  ).length
  return {
    status:
      slides.length === 0
        ? ("not_captured" as const)
        : availableCount === 0
          ? ("unavailable" as const)
          : availableCount < slides.length
            ? ("partial" as const)
            : ("available" as const),
    slideCount: slides.length,
    retentionCount,
    likeDistributionCount,
    missingRetentionSlideIndexes: slides
      .filter((slide) => slide.retentionPercent === undefined)
      .map((slide) => slide.slideIndex),
    missingLikeDistributionSlideIndexes: slides
      .filter((slide) => slide.likeDistributionPercent === undefined)
      .map((slide) => slide.slideIndex),
  }
}

function uniqueStudioSections(values: TikTokStudioSection[]) {
  return (["overview", "viewers", "engagement"] as const).filter((section) =>
    values.includes(section)
  )
}

function overviewFromSnapshot(
  snapshot: PostFastMetricSnapshot | undefined
): TikTokStudioOverview | undefined {
  if (!snapshot) return undefined
  const raw = snapshot.rawMetrics
  const overview: TikTokStudioOverview = {
    caption: snapshot.content,
    publishedAt: snapshot.publishedAt,
    photoCount: snapshot.mediaCount,
    views: numberValue(raw.videoViews) ?? snapshot.metrics.views,
    likes: numberValue(raw.likes) ?? snapshot.metrics.likes,
    comments: numberValue(raw.comments) ?? snapshot.metrics.comments,
    shares: numberValue(raw.shares) ?? snapshot.metrics.shares,
    saves: numberValue(raw.saves) ?? snapshot.metrics.saves,
    totalWatchTimeSeconds: numberValue(raw.totalWatchTimeSeconds),
    averageWatchTimeSeconds: numberValue(raw.avgWatchTimeSeconds),
    fullWatchPercent: numberValue(raw.full_video_watched_rate),
    newFollowers: numberValue(raw.newFollowers),
  }
  return Object.values(overview).some((value) => value !== undefined)
    ? overview
    : undefined
}

function slideshowIdFor(candidate: ReportCandidate) {
  if (candidate.sourceType === "slideshow") return candidate.sourceId
  return candidate.run?.slideshowId
}

function safeMcpValue(
  value: unknown,
  depth = 0
): Record<string, unknown> | unknown[] | string | number | boolean | null {
  if (value === null) return null
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return value
  if (depth >= 8) return "[truncated]"
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => safeMcpValue(item, depth + 1))
  }
  if (!isRecord(value)) return String(value ?? "")
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      sensitiveKey(key) ? [] : [[key, safeMcpValue(item, depth + 1)] as const]
    )
  )
}

function sensitiveKey(value: string) {
  return /token|secret|password|cookie|authorization|api.?key|credential/i.test(
    value
  )
}

function numberValue(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}
