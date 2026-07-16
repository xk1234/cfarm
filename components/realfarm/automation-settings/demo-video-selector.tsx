import { IconCheck, IconVideoOff } from "@tabler/icons-react"

import { GeneratedVideoThumbnail } from "@/components/realfarm/generated-video-thumbnail"
import type { LocalAsset } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

export function DemoVideoSelector({
  videos,
  value,
  label = "Demo video",
  onChange,
}: {
  videos: LocalAsset[]
  value: string
  label?: string
  onChange: (videoId: string) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[11px] font-bold text-app-muted-text">
        {label}
      </legend>
      {videos.length > 0 ? (
        <div className="grid max-h-[264px] grid-cols-2 gap-2 overflow-y-auto pr-1">
          {videos.map((video) => {
            const selected = video.id === value
            return (
              <button
                key={video.id}
                type="button"
                aria-pressed={selected}
                aria-label={`Use ${video.name}`}
                className={cn(
                  "group min-w-0 overflow-hidden rounded-[8px] border bg-[#f5f4ef] text-left transition focus-visible:ring-2 focus-visible:ring-[#6d28d9] focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]",
                  selected
                    ? "border-[#6d28d9] ring-1 ring-[#6d28d9]"
                    : "border-app-panel-border hover:border-[#aaa8a0]"
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  onChange(video.id)
                }}
              >
                <span className="relative block aspect-video overflow-hidden bg-[#d8d7d1]">
                  <GeneratedVideoThumbnail
                    videoUrl={video.url}
                    preload="metadata"
                  />
                  {selected ? (
                    <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-app-action text-white shadow-sm">
                      <IconCheck className="size-3.5" stroke={2.5} />
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "block truncate px-2 py-1.5 text-[11px] font-semibold",
                    selected ? "text-[#5b21b6]" : "text-[#4f4e49]"
                  )}
                  title={video.name}
                >
                  {video.name}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid min-h-24 place-items-center rounded-[8px] border border-dashed border-[#c9c8c0] bg-app-surface-subtle px-4 text-center">
          <div>
            <IconVideoOff className="mx-auto mb-1.5 size-5 text-app-text-faint" />
            <p className="text-[11px] font-semibold text-[#6a6963]">
              No demo videos uploaded
            </p>
          </div>
        </div>
      )}
    </fieldset>
  )
}
