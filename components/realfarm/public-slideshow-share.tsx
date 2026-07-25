"use client"

import { useState } from "react"
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconPhoto,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function PublicSlideshowShare({
  outputId,
  token,
  title,
  caption,
  hashtags,
  imageUrls,
}: {
  outputId: string
  token: string
  title: string
  caption: string
  hashtags: string
  imageUrls: string[]
}) {
  const [copied, setCopied] = useState<"title" | "caption" | "">("")
  const combinedCaption = [caption, hashtags].filter(Boolean).join("\n\n")

  async function copy(kind: "title" | "caption", value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(""), 1600)
  }

  return (
    <main className="min-h-screen bg-app-page-bg px-4 py-10 text-app-text sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-app-action text-white shadow-sm">
            <IconPhoto className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-app-text-faint uppercase">
              LumenClip delivery
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          </div>
        </div>

        <section className="grid gap-4 rounded-2xl border border-app-panel-border bg-background p-5 shadow-sm sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-app-text-faint uppercase">
              Title
            </p>
            <p className="mt-2 text-base font-semibold">{title}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => void copy("title", title)}
          >
            {copied === "title" ? (
              <IconCheck className="size-4" />
            ) : (
              <IconCopy className="size-4" />
            )}
            Copy title
          </Button>

          <div className="min-w-0 border-t border-app-panel-border pt-4 sm:col-span-2">
            <p className="text-xs font-semibold text-app-text-faint uppercase">
              Description + hashtags
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {combinedCaption || "No description or hashtags were generated."}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              disabled={!combinedCaption}
              onClick={() => void copy("caption", combinedCaption)}
            >
              {copied === "caption" ? (
                <IconCheck className="size-4" />
              ) : (
                <IconCopy className="size-4" />
              )}
              Copy description + hashtags
            </Button>
          </div>

          <div className="border-t border-app-panel-border pt-4 sm:col-span-2">
            <Button asChild variant="action">
              <a
                href={`/api/public/slideshows/${encodeURIComponent(outputId)}/download?token=${encodeURIComponent(token)}`}
              >
                <IconDownload className="size-4" />
                Download all slides (.zip)
              </a>
            </Button>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Slides</h2>
            <span className="text-xs text-app-text-faint">
              {imageUrls.length} images
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {imageUrls.map((url, index) => (
              // Publicly rendered slideshow assets are already immutable output
              // images; keep their original aspect ratio instead of recropping.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${index}`}
                src={url}
                alt={`Slide ${index + 1}`}
                className="w-full rounded-xl border border-app-panel-border bg-app-control-bg object-contain shadow-sm"
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
