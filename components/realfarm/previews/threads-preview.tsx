import {
  IconHeart,
  IconMessageCircle,
  IconRepeat,
  IconSend,
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

export function ThreadsPreview(props: NetworkPreviewProps) {
  return (
    <PreviewCard label="Threads">
      <PreviewHeader {...props} meta="3m" />
      <PreviewBody text={props.text} />
      {props.media?.length ? (
        <div className="px-4 pb-3">
          <PreviewMediaBlock media={props.media} />
        </div>
      ) : null}
      <ActionRow>
        <PreviewAction icon={<IconHeart className="size-5" />} label="" />
        <PreviewAction
          icon={<IconMessageCircle className="size-5" />}
          label="18"
        />
        <PreviewAction icon={<IconRepeat className="size-5" />} label="5" />
        <PreviewAction icon={<IconSend className="size-5" />} label="" />
      </ActionRow>
    </PreviewCard>
  )
}
