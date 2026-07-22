import {
  IconBulb,
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

export function LinkedInPreview(props: NetworkPreviewProps) {
  return (
    <PreviewCard label="LinkedIn">
      <PreviewHeader {...props} meta="1h · Edited" />
      <PreviewBody text={props.text} />
      <PreviewMediaBlock media={props.media} />
      <div className="flex justify-between px-4 py-2 text-caption text-brand-muted">
        <span>💡 138 reactions</span>
        <span>24 comments</span>
      </div>
      <ActionRow>
        <PreviewAction icon={<IconBulb className="size-4" />} label="Like" />
        <PreviewAction
          icon={<IconMessageCircle className="size-4" />}
          label="Comment"
        />
        <PreviewAction
          icon={<IconRepeat className="size-4" />}
          label="Repost"
        />
        <PreviewAction icon={<IconSend className="size-4" />} label="Send" />
      </ActionRow>
    </PreviewCard>
  )
}
