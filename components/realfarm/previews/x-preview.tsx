import {
  IconHeart,
  IconMessageCircle,
  IconRepeat,
  IconShare,
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

export function XPreview(props: NetworkPreviewProps) {
  return (
    <PreviewCard label="X">
      <PreviewHeader {...props} meta="2m" />
      <PreviewBody text={props.text} />
      {props.media?.length ? (
        <div className="px-4 pb-3">
          <PreviewMediaBlock media={props.media} />
        </div>
      ) : null}
      <ActionRow>
        <PreviewAction
          icon={<IconMessageCircle className="size-4" />}
          label="12"
        />
        <PreviewAction icon={<IconRepeat className="size-4" />} label="8" />
        <PreviewAction icon={<IconHeart className="size-4" />} label="142" />
        <PreviewAction icon={<IconShare className="size-4" />} label="" />
      </ActionRow>
    </PreviewCard>
  )
}
