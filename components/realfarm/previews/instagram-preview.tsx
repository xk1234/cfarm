import {
  IconBookmark,
  IconHeart,
  IconMessageCircle,
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

export function InstagramPreview(props: NetworkPreviewProps) {
  return (
    <PreviewCard label="Instagram">
      <PreviewHeader {...props} />
      <PreviewMediaBlock media={props.media} aspect="square" />
      <ActionRow>
        <PreviewAction icon={<IconHeart className="size-5" />} label="2,418" />
        <PreviewAction
          icon={<IconMessageCircle className="size-5" />}
          label="86"
        />
        <PreviewAction icon={<IconSend className="size-5" />} label="" />
        <span className="ml-auto">
          <IconBookmark className="size-5" />
        </span>
      </ActionRow>
      <PreviewBody text={props.text} />
    </PreviewCard>
  )
}
