import {
  IconArrowRight,
  IconArrowUpRight,
  IconEye,
  IconPhoto,
  IconScript,
} from "@tabler/icons-react"

import type { ProductSalesInspiration } from "@/lib/product-sales-inspirations"

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

export function ProductSalesInspirationList({
  inspirations,
}: {
  inspirations: ProductSalesInspiration[]
}) {
  if (inspirations.length === 0) return null

  return (
    <section className="mt-4 border-t border-app-panel-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[11px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
          Sales inspiration
        </h4>
        <span className="text-[10px] font-semibold text-app-text-faint">
          {inspirations.length} patterns
        </span>
      </div>

      <div className="mt-2 divide-y divide-app-panel-border border-y border-app-panel-border">
        {inspirations.map((inspiration) => (
          <InspirationMapping key={inspiration.id} inspiration={inspiration} />
        ))}
      </div>
    </section>
  )
}

function InspirationMapping({
  inspiration,
}: {
  inspiration: ProductSalesInspiration
}) {
  const source = inspiration.source
  const sourceSummary =
    typeof source.views === "number" &&
    typeof source.engagementRate === "number"
      ? `${source.creator} · ${compactNumber.format(source.views)} views · ${formatEngagement(source.engagementRate)} engagement`
      : `${source.assetName ?? source.creator}${source.page ? ` · page ${source.page}` : ""}`

  return (
    <details className="group py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden">
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-bold text-app-text">
            {source.label ?? source.category ?? "Source inspiration"}
          </span>
          <span className="mt-0.5 block text-[10px] font-semibold text-app-muted-text">
            {sourceSummary}
          </span>
        </span>
        <span className="shrink-0 text-[10px] font-bold text-app-muted-text group-open:hidden">
          View
        </span>
        <span className="hidden shrink-0 text-[10px] font-bold text-app-muted-text group-open:inline">
          Hide
        </span>
      </summary>

      <div className="mt-4 space-y-5">
        <MappingRow
          icon={<IconScript className="size-3.5" />}
          label="Text hook"
          original={inspiration.original.textHook}
          repurposed={inspiration.repurposed.textHook}
        />
        <MappingRow
          icon={<IconEye className="size-3.5" />}
          label="Visual hook"
          original={inspiration.original.visualHook}
          repurposed={inspiration.repurposed.visualHook}
        />
        <ScriptMapping inspiration={inspiration} />
        <div className="rounded-[7px] border border-app-warning/25 bg-app-warning-surface px-3 py-2 text-[11px] leading-[17px] text-app-text">
          <span className="font-bold">Why it fits:</span>{" "}
          {inspiration.analysis?.whyItFits ??
            "This source pattern has been adapted to the product's strongest visible proof."}
        </div>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-bold text-app-muted-text underline underline-offset-2 hover:text-app-text"
          >
            Open source in Reel Farm
            <IconArrowUpRight className="size-3" />
          </a>
        ) : null}
      </div>
    </details>
  )
}

function formatEngagement(value: number) {
  const percentage = value <= 1 ? value * 100 : value
  return `${percentage.toFixed(1)}%`
}

function MappingRow({
  icon,
  label,
  original,
  repurposed,
}: {
  icon: React.ReactNode
  label: string
  original: string
  repurposed: string
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
        {icon}
        {label}
      </div>
      <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)]">
        <InspirationValue label="Original" value={original} />
        <IconArrowRight className="mx-auto mt-5 hidden size-4 text-app-text-faint sm:block" />
        <InspirationValue label="For this product" value={repurposed} />
      </div>
    </div>
  )
}

function ScriptMapping({
  inspiration,
}: {
  inspiration: ProductSalesInspiration
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] text-app-muted-text uppercase">
        <IconPhoto className="size-3.5" />
        Script
      </div>
      <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)]">
        <ScriptSteps label="Original" steps={inspiration.original.script} />
        <IconArrowRight className="mx-auto mt-5 hidden size-4 text-app-text-faint sm:block" />
        <ScriptSteps
          label="For this product"
          steps={inspiration.repurposed.script}
        />
      </div>
    </div>
  )
}

function InspirationValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold tracking-[0.08em] text-app-text-faint uppercase">
        {label}
      </div>
      <p className="mt-1 text-[11px] leading-[17px] font-medium text-app-text">
        {value}
      </p>
    </div>
  )
}

function ScriptSteps({ label, steps }: { label: string; steps: string[] }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold tracking-[0.08em] text-app-text-faint uppercase">
        {label}
      </div>
      <ol className="mt-1 space-y-1.5">
        {steps.map((step, index) => (
          <li
            key={`${index}-${step}`}
            className="grid grid-cols-[16px_minmax(0,1fr)] gap-1.5 text-[11px] leading-[17px] font-medium text-app-text"
          >
            <span className="font-mono text-[9px] font-bold text-app-text-faint">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
