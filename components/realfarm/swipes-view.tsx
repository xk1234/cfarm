"use client"

import { useEffect, useState } from "react"
import { IconPlayerPlay, IconSearch, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { SelectLike } from "@/components/ui/form-controls"
import type { SwipeRecord } from "@/lib/swipes"
import { cn } from "@/lib/utils"

export function SwipesView() {
  const [swipes, setSwipes] = useState<SwipeRecord[]>([])
  const [selectedSwipe, setSelectedSwipe] = useState<SwipeRecord | null>(null)
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState("All")
  const [format, setFormat] = useState("All")
  const [sort, setSort] = useState("Recent")
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let cancelled = false

    async function loadSwipes() {
      try {
        const response = await fetch("/api/swipes", { cache: "no-store" })
        const payload = (await response.json()) as { swipes?: SwipeRecord[] }
        if (!cancelled) {
          setSwipes(payload.swipes ?? [])
          setStatus("ready")
        }
      } catch {
        if (!cancelled) {
          setStatus("error")
        }
      }
    }

    void loadSwipes()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredSwipes = swipes
    .filter((swipe) => {
      const haystack = `${swipe.advertiser} ${swipe.title} ${swipe.caption} ${swipe.platform}`.toLowerCase()
      return haystack.includes(search.trim().toLowerCase())
    })
    .filter((swipe) => platform === "All" || platform === swipe.platform)
    .filter((swipe) => format === "All" || format === swipe.format)
    .toSorted((a, b) => {
      if (sort === "Oldest") {
        return Date.parse(a.swipedAt) - Date.parse(b.swipedAt)
      }
      return Date.parse(b.swipedAt) - Date.parse(a.swipedAt)
    })

  return (
    <div className="mx-auto max-w-[1540px]">
      <div className="mb-5 grid gap-4 xl:grid-cols-[220px_1fr_auto]">
        <div>
          <h1 className="text-[17px] font-semibold text-[#28255d]">Swipe File</h1>
          <p className="mt-1 text-[13px] font-medium text-[#6d6b90]">All your private swipes</p>
        </div>
        <label className="relative block max-w-[430px]">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#aaa9c6]" />
          <input
            className="h-10 w-full rounded-[7px] border border-[#e4e3f4] bg-white pl-10 pr-3 text-[13px] font-medium outline-none placeholder:text-[#b5b4ca]"
            placeholder="Search By Brand Name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <SelectLike
            value={`Platform: ${platform}`}
            options={["Platform: All", "Platform: facebook", "Platform: tiktok", "Platform: tiktok-creative", "Platform: tiktok-seller", "Platform: google"]}
            onChange={(value) => setPlatform(value.replace("Platform: ", ""))}
            placement="bottom"
          />
          <SelectLike
            value={`Sort by: ${sort}`}
            options={["Sort by: Recent", "Sort by: Oldest"]}
            onChange={(value) => setSort(value.replace("Sort by: ", ""))}
            placement="bottom"
          />
          <SelectLike
            value={`Format: ${format}`}
            options={["Format: All", "Format: image", "Format: video", "Format: carousel", "Format: unknown"]}
            onChange={(value) => setFormat(value.replace("Format: ", ""))}
            placement="bottom"
          />
        </div>
      </div>

      {status === "error" && (
        <div className="rounded-[8px] border border-[#f1c5bc] bg-[#fff3f0] px-4 py-3 text-[13px] font-semibold text-[#b44d38]">
          Could not load local swipes. Make sure the dev server has access to data/swipes/swipes.json.
        </div>
      )}

      {status === "loading" ? (
        <div className="grid min-h-[360px] place-items-center rounded-[10px] bg-[#f0efff] text-[14px] font-semibold text-[#6d6b90]">
          Loading swipe file...
        </div>
      ) : filteredSwipes.length === 0 ? (
        <div className="grid min-h-[360px] place-items-center rounded-[10px] border border-dashed border-[#d6d4ee] bg-[#f6f5ff] text-center">
          <div>
            <div className="text-[18px] font-semibold text-[#28255d]">No swipes yet</div>
            <p className="mt-2 max-w-[420px] text-[13px] leading-5 text-[#6d6b90]">
              Load the extension, visit a supported ad platform, and click Swipe to save ads into this local file.
            </p>
          </div>
        </div>
      ) : (
        <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
          {filteredSwipes.map((swipe, index) => (
            <SwipeCard key={swipe.id} swipe={swipe} index={index} onInspect={() => setSelectedSwipe(swipe)} />
          ))}
        </div>
      )}

      {selectedSwipe && <SwipeDetailModal swipe={selectedSwipe} onClose={() => setSelectedSwipe(null)} />}
    </div>
  )
}

function SwipeCard({ swipe, index, onInspect }: { swipe: SwipeRecord; index: number; onInspect: () => void }) {
  return (
    <article className="mb-5 break-inside-avoid overflow-hidden rounded-[6px] border border-[#e6e4f7] bg-white shadow-[0_4px_16px_rgba(40,37,93,0.08)]">
      <div className="flex items-start gap-3 p-4 pb-3">
        <SwipeAvatar name={swipe.advertiser} index={index} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-[#28255d]">{swipe.advertiser}</div>
          <div className="text-[11px] font-medium lowercase text-[#7d7aa6]">{swipe.platform}</div>
        </div>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.08em] text-[#9b99bd]">Swipe</span>
      </div>
      <SwipeMedia swipe={swipe} className={cn(index % 5 === 1 ? "h-72" : index % 5 === 2 ? "h-56" : "h-64")} />
      <div className="p-4 pt-3">
        <h2 className="line-clamp-2 text-[14px] font-semibold leading-5 text-[#28255d]">{swipe.title}</h2>
        <p className="mt-2 line-clamp-3 text-[12px] font-medium leading-5 text-[#5f5d80]">{swipe.caption || "No caption captured yet."}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold text-[#7d7aa6]">
          <span>Swiped: {formatSwipeDate(swipe.swipedAt)}</span>
          <span>Format: {swipe.format}</span>
          <span className="col-span-2">{swipe.folder}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="softControl" size="appDefault" className="min-w-0 rounded px-2 text-[11px] text-[#343197]">
            + Generate Script
          </Button>
          <Button variant="indigoAction" size="appDefault" className="min-w-0 rounded px-2 text-[11px]" onClick={onInspect}>
            Inspect Swipe
          </Button>
        </div>
      </div>
    </article>
  )
}

function SwipeDetailModal({ swipe, onClose }: { swipe: SwipeRecord; onClose: () => void }) {
  const metadata = Object.entries(swipe.metadata ?? {})
  const structuredStats = swipeStructuredStats(swipe)
  const stats = [...structuredStats, ...Object.entries(swipe.stats ?? {}).filter(([label]) => !structuredStats.some(([existing]) => existing === label))]
  const transcriptText = swipe.full_script_transcription?.full_text?.trim()
  const ugcSummary = swipeUgcSummary(swipe)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#26218e]/95 p-6">
      <button className="fixed right-6 top-6 z-10 grid size-10 place-items-center rounded-full bg-white/12 text-white hover:bg-white/20" onClick={onClose} aria-label="Close swipe data">
        <IconX className="size-6" />
      </button>
      <div className="mx-auto grid min-h-[calc(100svh-48px)] max-w-[1480px] items-center gap-6 lg:grid-cols-[430px_1fr]">
        <section className="rounded-[12px] bg-white p-5">
          <div className="mb-4 text-center text-[20px] font-bold text-[#128363]">✓ Swiped</div>
          <SwipeCard swipe={swipe} index={2} onInspect={() => undefined} />
        </section>
        <section className="overflow-hidden rounded-[12px] bg-white shadow-2xl">
          <h2 className="border-b border-[#ecebfd] px-7 py-5 text-[16px] font-semibold text-[#343197]">Swipe Data</h2>
          <div className="grid bg-[#f4f6ff] p-6 lg:grid-cols-[470px_1fr]">
            <div className="rounded-[7px] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <SwipeAvatar name={swipe.advertiser} index={4} />
                <div>
                  <div className="text-[16px] font-semibold text-[#343197]">{swipe.advertiser}</div>
                  <div className="text-[12px] lowercase text-[#7d7aa6]">{swipe.platform}</div>
                </div>
              </div>
              <p className="mb-4 text-[14px] font-medium leading-6 text-[#34325c]">{swipe.caption}</p>
              <SwipeMedia swipe={swipe} className="h-[420px] rounded-[4px]" />
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase text-[#343197]">{domainFromUrl(swipe.landingPageUrl || swipe.sourceUrl)}</div>
                  <div className="text-[13px] font-semibold text-[#34325c]">{swipe.title}</div>
                </div>
                {swipe.cta && (
                  <Button variant="softControl" size="lg" className="rounded-[5px] px-5 text-[#343197]">
                    {swipe.cta}
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-4 lg:pl-6">
              <SwipeInfoPanel title="Landing Page Screenshots">
                <div className="flex flex-wrap gap-3">
                  <Button variant="softControl" size="lg" className="rounded text-[13px] text-[#343197]">View Mobile Landing Page</Button>
                  <Button variant="softControl" size="lg" className="rounded text-[13px] text-[#343197]">View Desktop Landing Page</Button>
                </div>
              </SwipeInfoPanel>
              <SwipeInfoPanel title="Metadata">
                <InfoGrid entries={metadata.length > 0 ? metadata : [["Source", swipe.source], ["Format", swipe.format], ["CTA", swipe.cta ?? "N/A"]]} />
              </SwipeInfoPanel>
              <SwipeInfoPanel title="Stats">
                {stats.length > 0 ? <InfoGrid entries={stats} /> : <div className="text-[13px] font-semibold text-[#9b99bd]">Not Available</div>}
              </SwipeInfoPanel>
              {(transcriptText || ugcSummary.length > 0) && (
                <SwipeInfoPanel title="UGC Analysis">
                  <div className="space-y-3">
                    {transcriptText && (
                      <div>
                        <div className="text-[11px] font-bold text-[#aaa8c8]">Transcript</div>
                        <p className="mt-1 max-h-32 overflow-y-auto text-[13px] font-medium leading-5 text-[#34325c]">{transcriptText}</p>
                      </div>
                    )}
                    {ugcSummary.length > 0 && <InfoGrid entries={ugcSummary} />}
                  </div>
                </SwipeInfoPanel>
              )}
              <SwipeInfoPanel title="Folders">
                <span className="inline-flex rounded-[3px] bg-[#eef0ff] px-6 py-2 text-[13px] font-semibold text-[#343197]">{swipe.folder}</span>
              </SwipeInfoPanel>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SwipeInfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[5px] bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-[17px] font-semibold text-[#343197]">{title}</h3>
      {children}
    </section>
  )
}

function InfoGrid({ entries }: { entries: [string, string][] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map(([label, value]) => (
        <div key={`${label}-${value}`}>
          <div className="text-[11px] font-bold text-[#aaa8c8]">{label}</div>
          <div className="mt-1 break-words text-[13px] font-semibold text-[#343197]">{value}</div>
        </div>
      ))}
    </div>
  )
}

function swipeStructuredStats(swipe: SwipeRecord): [string, string][] {
  const entries: Array<[string, string | number | undefined]> = [
    ["Uploaded", swipe.uploaded_at],
    ["Length", typeof swipe.time === "number" ? `${swipe.time}s` : undefined],
    ["Likes", swipe.likes],
    ["Comments", swipe.comments],
    ["Shares", swipe.shares],
    ["CTR rank", swipe.ctr_rank],
    ["CVR rank", swipe.cvr_rank],
    ["Clicks rank", swipe.clicks_rank],
    ["Conversion rank", swipe.conversion_rank],
    ["Remain rank", swipe.remain_rank],
    ["Budget level", swipe.budget_level],
    ["Benchmark", swipe.industry_benchmark ? `${swipe.industry_benchmark.metric}: ${swipe.industry_benchmark.rank} ${swipe.industry_benchmark.comparison}` : undefined],
  ]

  return entries
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== "")
    .map(([label, value]) => [label, String(value)])
}

function swipeUgcSummary(swipe: SwipeRecord): [string, string][] {
  const analysis = swipe.core_ugc_aesthetic_analysis
  if (!analysis) {
    return []
  }

  return [
    ["Device", analysis.implied_device_and_capture.inferred_device],
    ["Scenario", analysis.social_context_and_scenario.scenario],
    ["Setting", analysis.social_context_and_scenario.setting],
    ["Speaking style", analysis.subject_and_performance.delivery_and_kinesics.speaking_style],
    ["Tone", analysis.subject_and_performance.delivery_and_kinesics.tone],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[1] !== "unknown")
}

function SwipeMedia({ swipe, className }: { swipe: SwipeRecord; className?: string }) {
  const mediaIsVideo = Boolean(swipe.mediaUrl && /\.(mp4|webm|mov)(\?|#|$)/i.test(swipe.mediaUrl))
  const image = mediaIsVideo ? swipe.mediaUrl : swipe.screenshotPath || swipe.mediaUrl
  const isVideo = Boolean(image && /\.(mp4|webm|mov)(\?|#|$)/i.test(image))

  return (
    <div
      className={cn("relative overflow-hidden bg-[#eef0ff]", !image && "bg-white", className)}
      style={
        image && !isVideo
          ? {
              backgroundImage: `url(${image})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }
          : undefined
      }
    >
      {image && isVideo && (
        <video className="h-full w-full object-cover" src={image} muted playsInline preload="metadata" />
      )}
      {swipe.format === "video" && (
        <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white">
          <IconPlayerPlay className="size-8 fill-current" />
        </span>
      )}
    </div>
  )
}

function SwipeAvatar({ name, index }: { name: string; index: number }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white", swipeAvatarTone(index))}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function formatSwipeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toUpperCase()
  } catch {
    return "N/A"
  }
}

function swipeAvatarTone(index: number) {
  const tones = ["bg-[#54b75d]", "bg-[#111111]", "bg-[#b5448e]", "bg-[#343197]", "bg-[#0b7a68]"]
  return tones[index % tones.length]
}
