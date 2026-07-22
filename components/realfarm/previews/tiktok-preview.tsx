import {
  IconHeart,
  IconMessageCircle,
  IconMusic,
  IconShare,
} from "@tabler/icons-react"

import { PreviewCard, PreviewMediaBlock } from "./preview-parts"
import type { NetworkPreviewProps } from "./preview-types"

export function TikTokPreview({
  accountName = "LumenClip Studio",
  handle = "@lumenclip",
  media,
  text,
}: NetworkPreviewProps) {
  return (
    <PreviewCard
      className="relative mx-auto max-w-xs bg-app-strong text-app-on-strong"
      label="TikTok"
    >
      <PreviewMediaBlock media={media} aspect="portrait" />
      <div className="absolute inset-x-0 bottom-0 bg-app-overlay p-4 pr-16">
        <p className="text-label font-semibold">{handle}</p>
        <p className="mt-2 text-label whitespace-pre-wrap">
          {text || "Your caption will appear here."}
        </p>
        <p className="mt-3 flex items-center gap-2 text-caption">
          <IconMusic className="size-4" /> {accountName} · original sound
        </p>
      </div>
      <div className="absolute right-3 bottom-5 flex flex-col gap-5 text-center text-caption">
        <span>
          <IconHeart className="mx-auto size-6" />
          24K
        </span>
        <span>
          <IconMessageCircle className="mx-auto size-6" />
          312
        </span>
        <span>
          <IconShare className="mx-auto size-6" />
          Share
        </span>
      </div>
    </PreviewCard>
  )
}
