import { IconDownload, IconVideo } from "@tabler/icons-react"
import { notFound } from "next/navigation"

import { Button } from "@/components/ui/button"
import { loadSharedGeneratedVideo } from "@/lib/generated-video-share"
import { publicGeneratedVideoMediaUrl } from "@/lib/public-generated-video-assets"

export const dynamic = "force-dynamic"

export default async function SharedGeneratedVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const token = typeof query.token === "string" ? query.token : ""
  const video = token ? await loadSharedGeneratedVideo(id, token) : null
  if (!video) notFound()

  const videoUrl = publicGeneratedVideoMediaUrl({
    outputId: video.id,
    token,
    kind: "video",
  })
  const thumbnailUrl = video.previewUrl
    ? publicGeneratedVideoMediaUrl({
        outputId: video.id,
        token,
        kind: "thumbnail",
      })
    : undefined

  return (
    <main className="bg-app-page-bg min-h-screen px-4 py-10 text-app-text sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-app-action text-white shadow-sm">
            <IconVideo className="size-5" />
          </span>
          <h1 className="text-2xl font-semibold">{video.title}</h1>
        </div>

        <section className="grid gap-6 rounded-2xl border border-app-panel-border bg-background p-5 shadow-sm lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="overflow-hidden rounded-xl bg-black">
            <video
              className="aspect-[9/16] max-h-[75vh] w-full object-contain"
              src={videoUrl}
              poster={thumbnailUrl}
              controls
              playsInline
              preload="metadata"
            />
          </div>

          <div className="flex min-w-0 flex-col">
            <div>
              <p className="text-xs font-semibold text-app-text-faint uppercase">
                Description
              </p>
              <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">
                {video.description || "No description was generated."}
              </p>
            </div>
            {video.hashtags.length > 0 ? (
              <div className="mt-6 border-t border-app-panel-border pt-5">
                <p className="text-xs font-semibold text-app-text-faint uppercase">
                  Hashtags
                </p>
                <p className="mt-2 text-sm leading-6">
                  {video.hashtags.join(" ")}
                </p>
              </div>
            ) : null}
            <div className="mt-auto pt-8">
              <Button asChild variant="action">
                <a
                  href={publicGeneratedVideoMediaUrl({
                    outputId: video.id,
                    token,
                    kind: "video",
                    download: true,
                  })}
                  download
                >
                  <IconDownload className="size-4" />
                  Download video
                </a>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
