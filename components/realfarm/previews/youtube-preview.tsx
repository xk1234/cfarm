import {
  IconBell,
  IconShare,
  IconThumbDown,
  IconThumbUp,
} from "@tabler/icons-react"

import {
  ActionRow,
  PreviewAction,
  PreviewBody,
  PreviewCard,
  PreviewHeader,
  PreviewMediaBlock,
} from "./preview-parts"
import type { NetworkPreviewProps } from "./preview-types"

export function YouTubePreview(props: NetworkPreviewProps) {
  const title =
    props.fields?.title || props.text.split("\n")[0] || "Untitled video"
  return (
    <PreviewCard label="YouTube">
      <PreviewMediaBlock media={props.media} />
      <div className="p-4">
        <h3 className="text-heading font-semibold">{title}</h3>
        <p className="mt-1 text-caption text-brand-muted">
          1.2K views · just now
        </p>
      </div>
      <PreviewHeader {...props} meta="82K subscribers" />
      <ActionRow>
        <PreviewAction icon={<IconThumbUp className="size-5" />} label="1.1K" />
        <PreviewAction icon={<IconThumbDown className="size-5" />} label="" />
        <PreviewAction icon={<IconShare className="size-5" />} label="Share" />
        <PreviewAction
          icon={<IconBell className="size-5" />}
          label="Subscribe"
        />
      </ActionRow>
      <PreviewBody text={props.text} />
    </PreviewCard>
  )
}
