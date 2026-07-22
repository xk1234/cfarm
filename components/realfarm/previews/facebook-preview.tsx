import { IconMessageCircle, IconShare, IconThumbUp } from "@tabler/icons-react"

import {
  ActionRow,
  PreviewAction,
  PreviewBody,
  PreviewCard,
  PreviewHeader,
  PreviewMediaBlock,
} from "./preview-parts"
import type { NetworkPreviewProps } from "./preview-types"

export function FacebookPreview(props: NetworkPreviewProps) {
  return (
    <PreviewCard label="Facebook">
      <PreviewHeader {...props} meta="Just now · Public" />
      <PreviewBody text={props.text} />
      {props.media?.length ? <PreviewMediaBlock media={props.media} /> : null}
      <div className="flex justify-between px-4 py-2 text-caption text-brand-muted">
        <span>👍 ❤️ 326</span>
        <span>42 comments · 9 shares</span>
      </div>
      <ActionRow>
        <PreviewAction icon={<IconThumbUp className="size-4" />} label="Like" />
        <PreviewAction
          icon={<IconMessageCircle className="size-4" />}
          label="Comment"
        />
        <PreviewAction icon={<IconShare className="size-4" />} label="Share" />
      </ActionRow>
    </PreviewCard>
  )
}
