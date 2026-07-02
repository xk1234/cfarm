"use client"

import {
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPlay,
  IconPlus,
} from "@tabler/icons-react"

import { AvatarDot, PinterestPreviewTile, SlideThumb } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"

export function CreatorsView() {
  return (
    <div className="mx-auto max-w-[1160px]">
      <h1 className="text-[24px] font-semibold">Creators</h1>
    </div>
  )
}

export function HomeView({
  data,
  onCreate,
  onAutomations,
}: {
  data: RealFarmData
  onCreate: () => void
  onAutomations: () => void
}) {
  const quickStartAutomations = data.automations.slice(0, 6)

  return (
    <div className="mx-auto max-w-[1260px] pb-12">
      <section className="pt-14 text-center">
        <h1 className="text-[42px] font-bold tracking-normal text-[#30302e]">Welcome, UU odi</h1>
        <p className="mt-3 text-[20px] font-semibold text-[#888883]">use AI to generate TikTok videos that don&apos;t feel like AI</p>
        <div className="mt-7 flex justify-center gap-3">
          <Button variant="action" size="largeAction" onClick={onCreate}>
            <IconPlus className="size-5" />
            New Automation
          </Button>
          <Button variant="softControl" size="largeAction" onClick={onAutomations}>
            <IconPlayerPlay className="size-5" />
            Automations
          </Button>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-[900px]">
        <div className="mb-16 flex items-center justify-between">
          <h2 className="text-[24px] font-bold text-[#30302e]">Slideshows (0)</h2>
          <div className="flex items-center gap-3 text-[14px] font-semibold text-[#6f7888]">
            <Button variant="iconControl" size="icon-control" aria-label="Previous slideshow page">
              <IconChevronLeft className="size-4" />
            </Button>
            Page 1 of 1
            <Button variant="iconControl" size="icon-control" aria-label="Next slideshow page">
              <IconChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="grid min-h-[86px] place-items-center text-[16px] font-medium text-[#667085]">
          You have no videos yet. Create your first video to get started!
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-[1210px]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-[#30302e]">Quick start. <span className="text-[#888883]">Use our formats.</span></h2>
          <div className="flex gap-3">
            <Button variant="iconControl" size="icon-control" aria-label="Previous format">
              <IconChevronLeft className="size-4" />
            </Button>
            <Button variant="iconControl" size="icon-control" aria-label="Next format">
              <IconChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quickStartAutomations.map((automation, index) => (
            <QuickStartFormatCard
              key={automation.id}
              automation={automation}
              images={data.defaultCollections.backgrounds.images.slice(index, index + 4)}
              hooks={data.editor.slides.map((slide) => slide.text)}
              index={index}
              onAutomate={onCreate}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function QuickStartFormatCard({
  automation,
  images,
  hooks,
  index,
  onAutomate,
}: {
  automation: Automation
  images: PinterestSearchResult[]
  hooks: string[]
  index: number
  onAutomate: () => void
}) {
  const tiles = images.length > 0 ? images : []

  return (
    <article className="overflow-hidden rounded-[9px] border border-[#dddddc] bg-white shadow-sm">
      <div className="grid h-[170px] grid-cols-3 overflow-hidden bg-[#ddd]">
        {[0, 1, 2].map((tileIndex) => {
          const image = tiles[tileIndex % Math.max(tiles.length, 1)]
          return (
            <div key={tileIndex} className="relative overflow-hidden">
              {image ? (
                <PinterestPreviewTile image={image} index={index + tileIndex} className="h-full rounded-none" />
              ) : (
                <SlideThumb index={index + tileIndex} className="h-full rounded-none" />
              )}
              <div className="absolute inset-0 bg-black/12" />
              <div className="font-tiktok absolute inset-x-4 top-[36%] text-center text-[10px] font-bold leading-tight text-white drop-shadow">
                {hooks.length > 0 ? hooks[(index + tileIndex) % hooks.length] : automation.name}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <AvatarDot name={automation.name} index={index} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold leading-5 text-[#30302e]">{automation.name}</div>
          <div className="truncate text-[13px] font-medium text-[#7f7e78]">Start automating this format</div>
        </div>
        <Button variant="blueAction" size="appDefault" className="font-semibold" onClick={onAutomate}>
          <IconPlus className="size-4" />
          Automate
        </Button>
      </div>
    </article>
  )
}
