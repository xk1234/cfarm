"use client"

import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import type {
  BenchmarkCorpusRecord,
  BenchmarkSlideInfo,
  GeneratedSlideshowBenchmark,
  SlideshowBenchmarkComparison,
  SlideshowBenchmarkScores,
} from "@/lib/slideshow-benchmarks"
import { cn } from "@/lib/utils"

type BenchmarkRow = {
  id: string
  label: string
  detail: string
  slides: BenchmarkSlideInfo[]
  stats?: BenchmarkCorpusRecord["stats"]
  scores: SlideshowBenchmarkScores
  current?: boolean
}

export function BenchmarkComparisonModal({
  comparison,
  title = "Slideshow benchmark",
  onClose,
}: {
  comparison: SlideshowBenchmarkComparison
  title?: string
  onClose: () => void
}) {
  const rows: BenchmarkRow[] = [
    generatedRow(comparison.subject),
    ...comparison.references.map(referenceRow),
  ]
  return (
    <AppModal className="z-[90]" onClose={onClose}>
      <AppModalPanel className="flex max-h-[90vh] max-w-[1180px] flex-col rounded-[12px] border border-[#d9d8d1]">
        <AppModalHeader
          title={title}
          description="Your slideshow versus three randomly selected ReelFarm references. Scores are out of 10."
          onClose={onClose}
        />
        <BenchmarkTable rows={rows} />
      </AppModalPanel>
    </AppModal>
  )
}

export function BenchmarkCorpusModal({
  records,
  onClose,
}: {
  records: BenchmarkCorpusRecord[]
  onClose: () => void
}) {
  return (
    <AppModal className="z-[90]" onClose={onClose}>
      <AppModalPanel className="flex max-h-[90vh] max-w-[1280px] flex-col rounded-[12px] border border-[#d9d8d1]">
        <AppModalHeader
          title="ReelFarm benchmark corpus"
          description={`${records.length} stored slideshows with copied images, source performance, ICP context, and multimodal grades.`}
          onClose={onClose}
        />
        <BenchmarkTable rows={records.map(referenceRow)} />
      </AppModalPanel>
    </AppModal>
  )
}

function BenchmarkTable({ rows }: { rows: BenchmarkRow[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[1080px] border-collapse text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-[#f6f5f0] text-[10px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
          <tr>
            <th className="px-4 py-3">Slides / picture info</th>
            <th className="px-3 py-3">Source / ICP</th>
            <th className="px-3 py-3">Performance</th>
            <th className="px-3 py-3 text-center">Hook</th>
            <th className="px-3 py-3 text-center">Pic + text</th>
            <th className="px-3 py-3 text-center">ICP value</th>
            <th className="px-3 py-3 text-center">Conversation</th>
            <th className="px-4 py-3 text-center">Overall</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "border-t border-[#ecebe5] align-top",
                row.current && "bg-[#fbf8ff]"
              )}
            >
              <td className="px-4 py-4">
                <div className="flex gap-1.5">
                  {row.slides.slice(0, 3).map((slide) => (
                    // eslint-disable-next-line @next/next/no-img-element -- Benchmark thumbnails use dynamic Appwrite and authenticated asset URLs.
                    <img
                      key={slide.id}
                      src={slide.imageUrl}
                      alt=""
                      className="h-[84px] w-[52px] rounded-[5px] bg-black object-cover"
                    />
                  ))}
                  {row.slides.length > 3 ? (
                    <span className="grid h-[84px] w-[42px] place-items-center rounded-[5px] bg-[#eeede7] font-bold text-[#77766f]">
                      +{row.slides.length - 3}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 font-mono text-[10px] text-[#8a8982]">
                  {pictureInfo(row.slides[0], row.slides.length)}
                </div>
              </td>
              <td className="max-w-[270px] px-3 py-4">
                <div className="font-bold text-[#242421]">{row.label}</div>
                <div className="mt-1 line-clamp-3 leading-4 text-[#77766f]">
                  {row.detail}
                </div>
              </td>
              <td className="px-3 py-4 font-mono text-[11px] text-[#55544f]">
                {row.stats ? (
                  <div className="space-y-1">
                    <div>{row.stats.viewsLabel} views</div>
                    <div>{row.stats.likesLabel} likes</div>
                    <div>{row.stats.bookmarksLabel} saves</div>
                  </div>
                ) : (
                  <span className="text-[#aaa89f]">New generation</span>
                )}
              </td>
              <ScoreCell score={row.scores.hookVirality} />
              <ScoreCell score={row.scores.pictureTextFit} />
              <ScoreCell score={row.scores.usefulnessToIcp} />
              <ScoreCell score={row.scores.conversationPotential} />
              <ScoreCell score={row.scores.overall} overall />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScoreCell({
  score,
  overall = false,
}: {
  score: number
  overall?: boolean
}) {
  return (
    <td className="px-3 py-4 text-center">
      <span
        className={cn(
          "inline-flex min-w-10 justify-center rounded-full px-2 py-1 font-mono text-[12px] font-bold",
          overall
            ? "bg-app-action text-white"
            : score >= 8
              ? "bg-emerald-100 text-emerald-800"
              : score >= 6
                ? "bg-amber-100 text-amber-800"
                : "bg-[#eeede7] text-[#66655f]"
        )}
      >
        {score.toFixed(score % 1 ? 1 : 0)}
      </span>
    </td>
  )
}

function generatedRow(record: GeneratedSlideshowBenchmark): BenchmarkRow {
  return {
    id: record.id,
    label: "Your new slideshow",
    detail: record.icp || record.title,
    slides: record.slides,
    scores: record.scores,
    current: true,
  }
}

function referenceRow(record: BenchmarkCorpusRecord): BenchmarkRow {
  return {
    id: record.id,
    label: `@${record.creator.username}`,
    detail: [
      record.creator.niche,
      record.creator.productMedium,
      record.creator.product,
    ]
      .filter(Boolean)
      .join(" · "),
    slides: record.slides,
    stats: record.stats,
    scores: record.scores,
  }
}

function pictureInfo(slide: BenchmarkSlideInfo | undefined, count: number) {
  const size =
    slide?.width && slide?.height
      ? `${slide.width}×${slide.height}`
      : "size n/a"
  const bytes = slide?.bytes
    ? `${Math.max(1, Math.round(slide.bytes / 1024))} KB first image`
    : ""
  return `${count} slides · ${size}${bytes ? ` · ${bytes}` : ""}`
}
