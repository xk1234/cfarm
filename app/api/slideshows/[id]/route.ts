import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import {
  deleteAutomationRuns,
  listAutomationRuns,
  markAutomationRunPublished,
  removeAutomationRunSlide,
  replaceAutomationRunSlideImage,
  updateAutomationRunMetadata,
} from "@/lib/automation-runner"
import { listImageCollections } from "@/lib/image-collections"
import {
  deletePostFastPostRecords,
  listPostFastPostRecords,
} from "@/lib/postfast-posts"
import { deleteGeneratedSlideshowBenchmarks } from "@/lib/slideshow-benchmarks"
import { slideshowDeletionBlockReason } from "@/lib/slideshow-lifecycle"
import {
  deleteSlideshowRecord,
  listSlideshowRecords,
  removeSlideshowSlide,
  replaceSlideshowSlideImage,
  updateSlideshowMetadata,
} from "@/lib/slideshows"
import {
  collectionAliases,
  storedToCollection,
} from "@/lib/realfarm-collections"

export const dynamic = "force-dynamic"

export const GET = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "A slideshow id is required" },
        { status: 400 }
      )
    }
    const runs = await listAutomationRuns({ limit: Number.MAX_SAFE_INTEGER })
    const run = runs.find((item) => item.slideshowId === id)
    if (!run) {
      return NextResponse.json(
        { error: "Automation run not found" },
        { status: 404 }
      )
    }
    return NextResponse.json({ images: await availableRunImages(run) })
  }
)

export const PATCH = withHandler<{ params: Promise<{ id: string }> }>(
  async (request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "A slideshow id is required" },
        { status: 400 }
      )
    }
    const payload = (await request.json().catch(() => null)) as {
      action?: string
      slideIndex?: number
      imageUrl?: string
      title?: string
      caption?: string
      hashtags?: string
    } | null
    const slideAction =
      payload?.action === "removeSlide" || payload?.action === "replaceImage"
    const metadataAction = payload?.action === "updateMetadata"
    const publicationAction = payload?.action === "markPublished"
    if (
      (!slideAction && !metadataAction && !publicationAction) ||
      (slideAction && !Number.isInteger(payload?.slideIndex)) ||
      (metadataAction &&
        (typeof payload?.title !== "string" ||
          typeof payload?.caption !== "string" ||
          typeof payload?.hashtags !== "string" ||
          !payload.title.trim()))
    ) {
      return NextResponse.json(
        { error: "Unsupported slideshow update" },
        { status: 400 }
      )
    }

    if (publicationAction) {
      const updatedRun = await markAutomationRunPublished({ slideshowId: id })
      if (!updatedRun) {
        return NextResponse.json(
          { error: "Automation run not found" },
          { status: 404 }
        )
      }
      return NextResponse.json({ run: updatedRun })
    }

    const runs = await listAutomationRuns({ limit: Number.MAX_SAFE_INTEGER })
    const run = runs.find((item) => item.slideshowId === id)
    const posts = await listPostFastPostRecords().catch(() => [])
    const blocked = slideshowDeletionBlockReason({
      slideshowStatus: "exported",
      runStatus: run?.status,
      slideshowId: id,
      runId: run?.id,
      posts,
    })
    if (blocked === "published" || blocked === "scheduled") {
      return NextResponse.json(
        {
          error:
            blocked === "published"
              ? "Published slideshows cannot be edited."
              : "Scheduled slideshows cannot be edited before the scheduled post is cancelled.",
        },
        { status: 409 }
      )
    }

    let slideshow
    try {
      if (payload.action === "updateMetadata") {
        if (!run) {
          return NextResponse.json(
            { error: "Automation run not found" },
            { status: 404 }
          )
        }
        slideshow = await updateSlideshowMetadata({
          id,
          title: payload.title!,
          caption: payload.caption!,
          hashtags: payload.hashtags!,
        })
        if (!slideshow) {
          return NextResponse.json(
            { error: "Slideshow not found" },
            { status: 404 }
          )
        }
        const updatedRun = await updateAutomationRunMetadata({
          slideshowId: id,
          title: slideshow.title,
          caption: slideshow.caption,
          hashtags: slideshow.hashtags,
        })
        return NextResponse.json({ slideshow, run: updatedRun })
      }
      if (payload.action === "replaceImage") {
        if (!run) {
          return NextResponse.json(
            { error: "Automation run not found" },
            { status: 404 }
          )
        }
        const image = (await availableRunImages(run)).find(
          (item) => item.imageUrl === payload.imageUrl?.trim()
        )
        if (!image) {
          return NextResponse.json(
            { error: "Choose an image from this automation's collections." },
            { status: 400 }
          )
        }
        if (
          image.usedInSlideIndexes.some((index) => index !== payload.slideIndex)
        ) {
          return NextResponse.json(
            { error: "That image is already used by another slide." },
            { status: 409 }
          )
        }
        slideshow = await replaceSlideshowSlideImage({
          id,
          slideIndex: payload.slideIndex!,
          imageUrl: image.imageUrl,
        })
        if (!slideshow) {
          return NextResponse.json(
            { error: "Slideshow not found" },
            { status: 404 }
          )
        }
        const updatedRun = await replaceAutomationRunSlideImage({
          slideshowId: id,
          slideIndex: payload.slideIndex!,
          imageUrl: image.imageUrl,
          imageKey: image.imageKey,
          imageCaption: image.caption,
          slideshow,
        })
        return NextResponse.json({ slideshow, run: updatedRun })
      }
      slideshow = await removeSlideshowSlide({
        id,
        slideIndex: payload.slideIndex!,
      })
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : payload.action === "replaceImage"
                ? "The slide image could not be changed."
                : payload.action === "updateMetadata"
                  ? "The slideshow details could not be saved."
                  : "The slide could not be removed.",
        },
        { status: 400 }
      )
    }
    if (!slideshow) {
      return NextResponse.json(
        { error: "Slideshow not found" },
        { status: 404 }
      )
    }
    const updatedRun = await removeAutomationRunSlide({
      slideshowId: id,
      slideIndex: payload.slideIndex!,
    })

    return NextResponse.json({ slideshow, run: updatedRun })
  }
)

async function availableRunImages(
  run: Awaited<ReturnType<typeof listAutomationRuns>>[number]
) {
  const requested = new Set(run.plan.imageCollectionIds)
  const collections = (await listImageCollections())
    .map(storedToCollection)
    .filter(
      (collection) =>
        collection.mediaType !== "video" &&
        collectionAliases(collection).some((alias) => requested.has(alias))
    )
  const seen = new Set<string>()
  return collections.flatMap((collection) =>
    collection.images.flatMap((image) => {
      const imageUrl = image.imageUrl?.trim()
      if (!imageUrl || seen.has(imageUrl)) return []
      seen.add(imageUrl)
      return [
        {
          id: image.id || `${collection.id}-${seen.size}`,
          imageUrl,
          imageKey: image.hash || imageUrl,
          caption: image.description || image.title || "",
          collectionName: collection.title,
          usedInSlideIndexes: run.plan.slides.flatMap((slide, index) => {
            const slideKey = slide.imageKey || slide.imageUrl
            return slideKey === (image.hash || imageUrl) ||
              slide.imageUrl === imageUrl
              ? [index]
              : []
          }),
        },
      ]
    })
  )
}

export const DELETE = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "A slideshow id is required" },
        { status: 400 }
      )
    }

    const [slideshow] = await listSlideshowRecords({ id, limit: 1 })
    if (!slideshow) {
      return NextResponse.json(
        { error: "Slideshow not found" },
        { status: 404 }
      )
    }

    const runs = await listAutomationRuns({ limit: Number.MAX_SAFE_INTEGER })
    const run = runs.find((item) => item.slideshowId === id)
    const posts = await listPostFastPostRecords().catch(() => [])
    const blocked = slideshowDeletionBlockReason({
      slideshowStatus: slideshow.status,
      runStatus: run?.status,
      slideshowId: id,
      runId: run?.id,
      posts,
    })
    if (blocked) {
      const error =
        blocked === "published"
          ? "Published slideshows cannot be deleted."
          : blocked === "scheduled"
            ? "Scheduled slideshows cannot be deleted before the scheduled post is cancelled."
            : "Only completed slideshows can be deleted."
      return NextResponse.json({ error }, { status: 409 })
    }

    const deletedSlideshow = await deleteSlideshowRecord({ id })
    if (!deletedSlideshow) {
      return NextResponse.json(
        { error: "Slideshow not found" },
        { status: 404 }
      )
    }

    const [deletedRuns] = await Promise.all([
      deleteAutomationRuns({ slideshowIds: [id] }),
      deleteGeneratedSlideshowBenchmarks(id),
      deletePostFastPostRecords({
        sourceType: "slideshow",
        sourceIds: [id],
      }),
      ...(run
        ? [
            deletePostFastPostRecords({
              sourceType: "automation" as const,
              sourceIds: [run.id],
            }),
          ]
        : []),
    ])

    return NextResponse.json({
      slideshow: deletedSlideshow,
      deletedRunIds: deletedRuns.map((item) => item.id),
    })
  }
)
