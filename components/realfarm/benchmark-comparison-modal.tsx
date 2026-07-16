"use client"

import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import type {
  BenchmarkCorpusRecord,
  BenchmarkSlideInfo,
  GeneratedSlideshowBenchmark,
  SlideshowBenchmarkComparison,
  SlideshowBenchmarkRationales,
  SlideshowBenchmarkScores,
} from "@/lib/slideshow-benchmarks"
import { cn } from "@/lib/utils"
import type { XBenchmarkComparison } from "@/lib/x-benchmarks"

type BenchmarkRow = {
  id: string
  label: string
  detail: string
  slides: BenchmarkSlideInfo[]
  stats?: BenchmarkCorpusRecord["stats"]
  scores: SlideshowBenchmarkScores
  rationales: SlideshowBenchmarkRationales
  model?: string
  gradedAt?: string
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
          description="Your slideshow versus up to three niche-matched ReelFarm references. The grader’s evidence appears under every score. A stored result is reused only when the slide copy, rendered pixels, rubric, and model are unchanged."
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

export function TextBenchmarkComparisonModal({
  comparison,
  onClose,
}: {
  comparison: XBenchmarkComparison
  onClose: () => void
}) {
  const rows = [
    {
      id: comparison.subject.id,
      label: "Current draft",
      detail: comparison.subject.text,
      grade: comparison.subject.grade,
      current: true,
    },
    ...comparison.references.map((reference) => ({
      id: reference.id,
      label: `${reference.author || "Reference"} · ${reference.platform}`,
      detail: reference.text || reference.texts?.join("\n\n") || "",
      grade: reference.grade!,
      current: false,
    })),
  ]
  return (
    <AppModal className="z-[90]" onClose={onClose}>
      <AppModalPanel className="flex max-h-[90vh] max-w-[1100px] flex-col rounded-[12px] border border-[#d9d8d1]">
        <AppModalHeader
          title={`${comparison.subject.platform === "threads" ? "Threads" : "X"} benchmark`}
          description="Your draft versus up to three niche-matched winning references, graded by a model family different from the generator."
          onClose={onClose}
        />
        <div className="min-h-0 overflow-auto p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((row) => (
              <article key={row.id} className={cn("rounded-xl border p-4", row.current ? "border-[#8d76c8] bg-[#fbf8ff]" : "border-app-panel-border bg-app-surface")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold">{row.label}</div>
                  <div className="text-xl font-bold">{row.grade.scores.overall}</div>
                </div>
                <p className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap text-sm leading-6 text-[#3f3e39]">{row.detail}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {Object.entries(row.grade.scores).filter(([key]) =>
                    key !== "overall" && Boolean(row.grade.rationales[key as keyof typeof row.grade.rationales])
                  ).map(([key, score]) => (
                    <div key={key} className="rounded-lg bg-app-surface-subtle p-2">
                      <div className="flex justify-between text-[10px] font-bold uppercase"><span>{key.replace(/([A-Z])/g, " $1")}</span><span>{score}</span></div>
                      <p className="mt-1 text-[11px] leading-4 text-app-muted-text">{row.grade.rationales[key as keyof typeof row.grade.rationales]}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function BenchmarkTable({ rows }: { rows: BenchmarkRow[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[1080px] border-collapse text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-[#f6f5f0] text-[10px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
          <tr>
            <th className="px-4 py-3">Slides / picture info</th>
            <th className="px-3 py-3">Source / context</th>
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
                    <span className="grid h-[84px] w-[42px] place-items-center rounded-[5px] bg-[#eeede7] font-bold text-app-muted-text">
                      +{row.slides.length - 3}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 font-mono text-[10px] text-app-text-faint">
                  {pictureInfo(row.slides[0], row.slides.length)}
                </div>
              </td>
              <td className="max-w-[270px] px-3 py-4">
                <div className="font-bold text-app-text">{row.label}</div>
                <div className="mt-1 line-clamp-3 leading-4 text-app-muted-text">
                  {row.detail}
                </div>
              </td>
              <td className="px-3 py-4 font-mono text-[11px] text-app-text-soft">
                {row.stats ? (
                  <div className="space-y-1">
                    <div>{row.stats.viewsLabel} views</div>
                    <div>{row.stats.likesLabel} likes</div>
                    <div>{row.stats.bookmarksLabel} saves</div>
                  </div>
                ) : (
                  <div className="space-y-1 text-app-muted-text">
                    <div>{benchmarkDate(row.gradedAt)}</div>
                    <div className="max-w-[150px] truncate" title={row.model}>
                      {row.model || "Benchmark model"}
                    </div>
                  </div>
                )}
              </td>
              <ScoreCell
                score={row.scores.hookVirality}
                rationale={row.rationales.hookVirality}
              />
              <ScoreCell
                score={row.scores.pictureTextFit}
                rationale={row.rationales.pictureTextFit}
              />
              <ScoreCell
                score={row.scores.usefulnessToIcp}
                rationale={row.rationales.usefulnessToIcp}
              />
              <ScoreCell
                score={row.scores.conversationPotential}
                rationale={row.rationales.conversationPotential}
              />
              <ScoreCell
                score={row.scores.overall}
                rationale="Average of the four benchmark dimensions."
                overall
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScoreCell({
  score,
  rationale,
  overall = false,
}: {
  score: number
  rationale: string
  overall?: boolean
}) {
  return (
    <td className="min-w-[150px] px-3 py-4 text-center">
      <span
        className={cn(
          "inline-flex min-w-10 justify-center rounded-full px-2 py-1 font-mono text-[12px] font-bold",
          overall
            ? "bg-app-action text-white"
            : score >= 8
              ? "bg-emerald-100 text-emerald-800"
              : score >= 6
                ? "bg-amber-100 text-amber-800"
                : "bg-[#eeede7] text-app-muted-text"
        )}
      >
        {score.toFixed(score % 1 ? 1 : 0)}
      </span>
      <p className="mt-2 text-left text-[10px] leading-4 font-medium text-app-muted-text">
        {rationale || "The grader did not return an explanation."}
      </p>
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
    rationales: benchmarkRationales(record.rationales),
    model: record.model,
    gradedAt: record.createdAt,
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
    rationales: benchmarkRationales(record.rationales),
    model: record.model,
    gradedAt: record.gradedAt,
  }
}

function benchmarkRationales(
  value: SlideshowBenchmarkRationales | undefined
): SlideshowBenchmarkRationales {
  return {
    hookVirality: value?.hookVirality || "",
    pictureTextFit: value?.pictureTextFit || "",
    usefulnessToIcp: value?.usefulnessToIcp || "",
    conversationPotential: value?.conversationPotential || "",
  }
}

function benchmarkDate(value: string | undefined) {
  if (!value) return "Stored benchmark"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Stored benchmark"
  return `Graded ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`
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
