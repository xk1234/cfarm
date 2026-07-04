"use client"

import { useMemo, useState } from "react"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { SwipeMedia } from "@/components/realfarm/swipe-media"
import { toSwipeDisplayModel, type SwipeDisplayEntry } from "@/components/realfarm/swipe-display-model"
import { Button } from "@/components/ui/button"
import type { SwipeRecord } from "@/lib/swipes"
import { cn } from "@/lib/utils"

export function SwipeDetailPage({ swipe, onBack }: { swipe: SwipeRecord; onBack: () => void }) {
  const model = useMemo(() => toSwipeDisplayModel(swipe), [swipe])
  const [landingView, setLandingView] = useState<"mobile" | "desktop">(
    model.landingPageMobileScreenshotPath || !model.landingPageDesktopScreenshotPath ? "mobile" : "desktop",
  )
  const landingPath = landingView === "mobile" ? model.landingPageMobileScreenshotPath : model.landingPageDesktopScreenshotPath

  return (
    <div className="mx-auto max-w-[1380px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button variant="softControl" size="appDefault" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to swipes
        </Button>
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
          <StatusBadge status={model.processingStatus} />
          <span className="rounded-full bg-[#eef0ff] px-3 py-1 text-[#343197]">{model.platform}</span>
          <span className="rounded-full bg-white px-3 py-1 text-[#6d6b90] shadow-sm">{model.format}</span>
        </div>
      </div>

      <header className="mb-5 border-b border-[#e4e3f4] pb-5">
        <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#8b89ad]">{model.advertiser}</div>
        <h1 className="mt-2 max-w-[980px] text-[26px] font-semibold leading-tight text-[#28255d]">{model.title}</h1>
        <p className="mt-3 max-w-[980px] text-[14px] font-medium leading-6 text-[#56537a]">{model.caption}</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.95fr)]">
        <section>
          <SectionTitle title="Creative media" />
          <SwipeMedia swipe={model} fit="contain" className="aspect-[4/5] max-h-[680px] rounded-[8px] border border-[#e2e0f2] bg-white" />
          <div className="mt-4 flex flex-wrap gap-3">
            {model.landingPageUrl && (
              <Button variant="softControl" size="appDefault" asChild>
                <a href={model.landingPageUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Open landing page
                </a>
              </Button>
            )}
            {model.sourceUrl && (
              <Button variant="softControl" size="appDefault" asChild>
                <a href={model.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Open source
                </a>
              </Button>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <InfoSection title="Overview">
            <InfoGrid
              entries={[
                { label: "Advertiser", value: model.advertiser },
                { label: "Platform", value: model.platform },
                { label: "Format", value: model.format },
                { label: "CTA", value: model.cta || "N/A" },
                { label: "Folder", value: model.folder },
                { label: "Swiped", value: formatDateTime(model.swipedAt) },
              ]}
            />
          </InfoSection>

          <InfoSection title="Landing page captures">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={landingView === "mobile" && model.landingPageMobileScreenshotPath ? "action" : "softControl"}
                size="appDefault"
                disabled={!model.landingPageMobileScreenshotPath}
                onClick={() => setLandingView("mobile")}
              >
                View mobile landing page
              </Button>
              <Button
                variant={landingView === "desktop" && model.landingPageDesktopScreenshotPath ? "action" : "softControl"}
                size="appDefault"
                disabled={!model.landingPageDesktopScreenshotPath}
                onClick={() => setLandingView("desktop")}
              >
                View desktop landing page
              </Button>
            </div>
            {landingPath ? (
              <a href={landingPath} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-[7px] border border-[#e2e0f2] bg-white">
                <img src={landingPath} alt={`${landingView} landing page screenshot`} className="max-h-[460px] w-full object-contain" />
              </a>
            ) : (
              <p className="mt-4 text-[13px] font-medium leading-5 text-[#77749e]">
                {model.landingPageCaptureError || "No landing page screenshot has been captured for this swipe yet."}
              </p>
            )}
          </InfoSection>

          {model.stats.length > 0 && (
            <InfoSection title="Platform stats">
              <InfoGrid entries={model.stats} />
            </InfoSection>
          )}

          {model.metadata.length > 0 && (
            <InfoSection title="Metadata">
              <InfoGrid entries={model.metadata} />
            </InfoSection>
          )}

          {(model.transcript || model.ugcSummary.length > 0 || model.processingStatus === "processing" || model.processingStatus === "failed") && (
            <InfoSection title="Transcript and UGC analysis">
              {model.processingStatus === "processing" && (
                <p className="text-[13px] font-semibold text-[#6d6b90]">processing...</p>
              )}
              {model.processingStatus === "failed" && (
                <p className="text-[13px] font-semibold text-[#b44d38]">{model.processingError || "Processing failed."}</p>
              )}
              {model.transcript && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#aaa8c8]">Transcript</div>
                  <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-[13px] font-medium leading-5 text-[#34325c]">{model.transcript}</p>
                </div>
              )}
              {model.ugcSummary.length > 0 && <InfoGrid entries={model.ugcSummary} className="mt-4" />}
            </InfoSection>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[8px] border border-[#e2e0f2] bg-white p-5 shadow-[0_3px_14px_rgba(40,37,93,0.06)]">
      <SectionTitle title={title} />
      {children}
    </section>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="mb-4 text-[16px] font-semibold text-[#28255d]">{title}</h2>
}

function InfoGrid({ entries, className }: { entries: SwipeDisplayEntry[]; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {entries.map((entry) => (
        <div key={`${entry.label}-${entry.value}`} className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#aaa8c8]">{entry.label}</div>
          <div className="mt-1 overflow-wrap-anywhere text-[13px] font-semibold leading-5 text-[#343197] [overflow-wrap:anywhere]">{entry.value}</div>
        </div>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status?: SwipeRecord["processingStatus"] }) {
  if (!status) {
    return null
  }
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1",
        status === "processing" && "bg-[#fff5d6] text-[#8a6400]",
        status === "complete" && "bg-[#e7f8f0] text-[#128363]",
        status === "failed" && "bg-[#fff0ed] text-[#b44d38]",
      )}
    >
      {status === "processing" ? "processing..." : status}
    </span>
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
