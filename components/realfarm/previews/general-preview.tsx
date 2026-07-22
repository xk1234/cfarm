import { IconHeart, IconMessageCircle, IconShare } from "@tabler/icons-react"

import {
  ActionRow,
  PreviewAction,
  PreviewBody,
  PreviewCard,
  PreviewHeader,
  PreviewMediaBlock,
} from "./preview-parts"
import type { NetworkPreviewProps } from "./preview-types"

export function GeneralPreview({
  platformName = "Social",
  ...props
}: NetworkPreviewProps & { platformName?: string }) {
  return (
    <PreviewCard label={platformName}>
      <PreviewHeader {...props} meta="Just now" />
      <PreviewBody text={props.text} />
      {props.media?.length ? <PreviewMediaBlock media={props.media} /> : null}
      <ActionRow>
        <PreviewAction icon={<IconHeart className="size-4" />} label="Like" />
        <PreviewAction
          icon={<IconMessageCircle className="size-4" />}
          label="Comment"
        />
        <PreviewAction icon={<IconShare className="size-4" />} label="Share" />
      </ActionRow>
    </PreviewCard>
  )
}
