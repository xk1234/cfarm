"use client"

import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"

import { VideoCopyFields } from "./video-copy-fields"

export function GeneratedVideoExportViewer({
  item,
  onClose,
}: {
  item: GeneratedVideoExport
  onClose: () => void
}) {
  return (
    <AppModal onClose={onClose}>
      <AppModalPanel
        accessibleTitle={`${item.title} video`}
        className="max-h-[90vh] max-w-[880px] overflow-hidden rounded-[10px] bg-white"
      >
        <AppModalHeader
          title={item.title}
          description={videoStatusLabel(item.status)}
          closeLabel="Close generated video"
          onClose={onClose}
        />
        <main className="grid max-h-[calc(90vh-73px)] gap-5 overflow-y-auto bg-[#f7f7f4] p-5 md:grid-cols-[minmax(260px,360px)_1fr]">
          <section className="min-w-0">
            <div className="grid aspect-[9/16] max-h-[68vh] place-items-center overflow-hidden rounded-[9px] bg-black shadow-xl">
              {item.videoUrl ? (
                <video
                  src={item.videoUrl}
                  poster={item.previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full bg-black object-contain"
                />
              ) : (
                <div className="grid h-full w-full place-items-center px-6 text-center text-[13px] font-semibold text-white/65">
                  {item.status === "processing" || item.status === "queued"
                    ? "Rendering video…"
                    : "This export does not have a rendered video."}
                </div>
              )}
            </div>
          </section>
          <section className="min-w-0 space-y-4">
            <VideoCopyFields
              title={item.title}
              description={item.description || item.caption}
              hashtags={item.hashtags.join(" ")}
            />
          </section>
        </main>
      </AppModalPanel>
    </AppModal>
  )
}

function videoStatusLabel(status: GeneratedVideoExport["status"]) {
  switch (status) {
    case "ready":
      return "Ready"
    case "processing":
      return "Rendering"
    case "failed":
      return "Failed"
    default:
      return "Queued"
  }
}
