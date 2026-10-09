"use client"

import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"
import { Dialog } from "radix-ui"

import { AppModal, AppModalPanel } from "@/components/ui/modal"

export type ViewerImage = {
  imageUrl: string
  title: string
}

export function ImageViewerModal({
  image,
  caption,
  index,
  total,
  onCaptionChange,
  onPrevious,
  onNext,
  onClose,
}: {
  image: ViewerImage
  caption: string
  index: number
  total: number
  onCaptionChange?: (caption: string) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}) {
  return (
    <AppModal className="z-50 bg-black/86 p-0" onClose={onClose}>
      <AppModalPanel className="relative flex h-full max-w-none flex-col rounded-none bg-transparent text-white shadow-none">
        <Dialog.Title className="sr-only">{image.title}</Dialog.Title>
        <button
          className="absolute top-5 right-6 z-10 grid size-9 place-items-center rounded-full hover:bg-white/10"
          onClick={onClose}
          aria-label="Close image viewer"
        >
          <IconX className="size-8" />
        </button>
        <button
          className="absolute top-1/2 left-8 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
          onClick={onPrevious}
          disabled={index === 0}
          aria-label="Previous image"
        >
          <IconChevronLeft className="size-10" />
        </button>
        <button
          className="absolute top-1/2 right-8 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
          onClick={onNext}
          disabled={index === total - 1}
          aria-label="Next image"
        >
          <IconChevronRight className="size-10" />
        </button>
        <div className="flex flex-1 items-center justify-center px-6 pt-14 pb-6 md:px-20">
          <div className="flex min-h-0 w-full max-w-[980px] flex-col items-center">
            <div
              className="h-[64vh] min-h-[280px] w-full bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${image.imageUrl})` }}
              role="img"
              aria-label={image.title}
            />
            <textarea
              className="mt-2 min-h-[44px] w-full max-w-[860px] resize-none bg-transparent text-center text-[15px] leading-6 font-semibold text-white outline-none placeholder:text-white/55"
              value={caption}
              readOnly={!onCaptionChange}
              placeholder="Add image caption..."
              onChange={(event) => onCaptionChange?.(event.target.value)}
            />
            <div className="mt-1 rounded-[3px] bg-black/55 px-4 py-1.5 text-[15px] font-bold">
              {index + 1} / {total}
            </div>
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}
