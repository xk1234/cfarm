"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { SelectControl, SwitchPillButton } from "@/components/ui/form-controls"
import type { UgcCostBreakdown } from "@/lib/ugc-cost"
import {
  normalizeUgcConfig,
  ugcLiveConfigurationErrors,
  type AutomationSchema,
  type AutomationUgcConfig,
} from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

const inputClass =
  "mt-2 w-full rounded-lg border border-app-panel-border bg-app-surface px-3 py-2 text-sm font-medium text-app-text outline-none placeholder:text-app-text-faint focus:border-app-panel-border-strong"

export function UgcAutomationFormatPanel({
  config,
  onConfigChange,
  onBack,
  onSave,
}: {
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
  onBack: () => void
  onSave: () => void
}) {
  const ugc = normalizeUgcConfig(config.ugc)
  const [estimate, setEstimate] = useState<UgcCostBreakdown | null>(null)
  const [estimateError, setEstimateError] = useState("")
  const validationErrors = ugcLiveConfigurationErrors("live", {
    ...config,
    ugc,
  })
  const productMissing = validationErrors.some((error) =>
    error.includes("product URL or brief")
  )
  const voiceMissing = validationErrors.some((error) =>
    error.includes("voice id")
  )

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void requestUgcEstimate(ugc, controller.signal)
        .then((nextEstimate) => {
          setEstimate(nextEstimate)
          setEstimateError("")
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          setEstimateError(
            error instanceof Error ? error.message : "Cost estimate unavailable."
          )
        })
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    ugc.actorAssetUrl,
    ugc.actorSource,
    ugc.brollCount,
    ugc.lipSyncTier,
    ugc.targetDurationSeconds,
    ugc.voiceModel,
  ])

  function update(patch: Partial<AutomationUgcConfig>) {
    onConfigChange({ ...config, ugc: { ...ugc, ...patch } })
  }

  function save() {
    if (validationErrors.length) return
    onSave()
  }

  return (
    <div className="min-h-full bg-app-surface px-9 py-8 pr-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl leading-tight font-bold text-app-text">
            AI actor format
          </h2>
          <p className="mt-2 text-base leading-6 font-medium text-app-muted-text">
            Turn a product brief into a voiced, lip-synced talking-actor video.
          </p>
        </div>
        <SwitchPillButton
          enabled={ugc.enabled}
          onClick={() => update({ enabled: !ugc.enabled })}
          aria-label="Toggle AI UGC"
        />
      </div>

      <p className="mt-5 rounded-lg border border-app-panel-border bg-app-surface-subtle p-3 text-sm font-medium text-app-muted-text">
        Gated — needs FAL_KEY, ELEVENLABS_API_KEY, and ENABLE_UGC_AUTOMATION.
      </p>

      <Section title="Product input" description="Provide either a product URL or a self-contained brief.">
        <Field label="Product URL" error={productMissing ? "Add a product URL or product brief before going live." : ""}>
          <input
            className={inputClass}
            type="url"
            value={ugc.productUrl ?? ""}
            placeholder="https://example.com/product"
            onChange={(event) => update({ productUrl: event.target.value })}
          />
        </Field>
        <div className="my-3 text-center text-xs font-bold tracking-wide text-app-text-faint uppercase">or</div>
        <Field label="Product brief">
          <textarea
            className={cn(inputClass, "min-h-28 resize-y")}
            value={ugc.productBrief ?? ""}
            placeholder="What it is, who it helps, benefits, proof, and offer"
            onChange={(event) => update({ productBrief: event.target.value })}
          />
        </Field>
      </Section>

      <Section title="Actor" description="Generate a new actor or use an existing portrait asset.">
        <Segmented
          label="Actor source"
          value={ugc.actorSource}
          options={[
            ["generate", "Generate"],
            ["gallery", "Gallery"],
            ["upload", "Upload"],
          ]}
          onChange={(actorSource) => update({ actorSource })}
        />
        {ugc.actorSource === "generate" ? (
          <Field label="Actor prompt">
            <textarea
              className={cn(inputClass, "min-h-24 resize-y")}
              value={ugc.actorPrompt ?? ""}
              placeholder="Friendly creator in their 30s, natural window light, direct to camera"
              onChange={(event) => update({ actorPrompt: event.target.value })}
            />
          </Field>
        ) : (
          <Field label={ugc.actorSource === "gallery" ? "Gallery asset URL" : "Uploaded asset URL"}>
            <input
              className={inputClass}
              type="url"
              value={ugc.actorAssetUrl ?? ""}
              placeholder="https://…"
              onChange={(event) => update({ actorAssetUrl: event.target.value })}
            />
          </Field>
        )}
      </Section>

      <Section title="Voice and lip sync" description="Premium uses Kling and costs more than Standard.">
        <Field label="ElevenLabs voice ID" error={voiceMissing ? "Choose a voice before going live." : ""}>
          <input
            className={inputClass}
            value={ugc.voiceId}
            placeholder="ElevenLabs voice ID"
            onChange={(event) => update({ voiceId: event.target.value })}
          />
        </Field>
        <Field label="Voice model">
          <input
            className={inputClass}
            value={ugc.voiceModel ?? ""}
            placeholder="Registry default"
            onChange={(event) => update({ voiceModel: event.target.value })}
          />
        </Field>
        <Segmented
          label="Lip-sync tier"
          value={ugc.lipSyncTier}
          options={[["standard", "Standard"], ["premium", "Premium · Kling"]]}
          onChange={(lipSyncTier) => update({ lipSyncTier })}
        />
        {estimate ? (
          <p className="mt-2 text-sm font-semibold text-app-muted-text">
            Current {ugc.lipSyncTier} estimate: {money(estimate.totalUsd)} total.
          </p>
        ) : null}
      </Section>

      <Section title="Length and supporting footage" description="Duration affects voice usage; b-roll adds one image generation per item.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target duration (seconds)">
            <input className={inputClass} type="number" min={10} max={90} value={ugc.targetDurationSeconds} onChange={(event) => update({ targetDurationSeconds: Number(event.target.value) })} />
          </Field>
          <Field label="B-roll count">
            <input className={inputClass} type="number" min={0} max={6} value={ugc.brollCount} onChange={(event) => update({ brollCount: Number(event.target.value) })} />
          </Field>
        </div>
      </Section>

      <Section title="On-screen text" description="Configure captions and the opening hook overlay.">
        <Toggle label="Captions" enabled={ugc.captions.enabled} onToggle={() => update({ captions: { ...ugc.captions, enabled: !ugc.captions.enabled } })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Caption style"><input className={inputClass} value={ugc.captions.style} disabled={!ugc.captions.enabled} onChange={(event) => update({ captions: { ...ugc.captions, style: event.target.value } })} /></Field>
          <Field label="Caption fallback"><SelectControl className="mt-2" value={ugc.captions.fallback} disabled={!ugc.captions.enabled} onChange={(event) => update({ captions: { ...ugc.captions, fallback: event.target.value as AutomationUgcConfig["captions"]["fallback"] } })}><option value="drawtext">Draw text</option><option value="png_frames">PNG frames</option></SelectControl></Field>
        </div>
        <Toggle label="Hook overlay" enabled={ugc.hookOverlay.enabled} onToggle={() => update({ hookOverlay: { ...ugc.hookOverlay, enabled: !ugc.hookOverlay.enabled } })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hook style"><input className={inputClass} value={ugc.hookOverlay.style} disabled={!ugc.hookOverlay.enabled} onChange={(event) => update({ hookOverlay: { ...ugc.hookOverlay, style: event.target.value } })} /></Field>
          <Field label="Hook duration (milliseconds)"><input className={inputClass} type="number" min={500} max={10000} step={100} value={ugc.hookOverlay.durationMs} disabled={!ugc.hookOverlay.enabled} onChange={(event) => update({ hookOverlay: { ...ugc.hookOverlay, durationMs: Number(event.target.value) } })} /></Field>
        </div>
      </Section>

      <Section title="Estimated provider cost" description="Updates after changes to tier, duration, actor source, or b-roll.">
        {estimate ? <CostEstimate estimate={estimate} /> : <p className="text-sm font-medium text-app-muted-text">{estimateError || "Calculating estimate…"}</p>}
      </Section>

      {validationErrors.length ? <div role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive">{validationErrors.join(". ")}.</div> : null}
      <div className="mt-8 flex justify-end gap-3 border-t border-app-panel-border pt-5">
        <Button type="button" variant="softControl" onClick={onBack}>Cancel</Button>
        <Button type="button" variant="action" disabled={validationErrors.length > 0} onClick={save}>Save changes</Button>
      </div>
    </div>
  )
}

export async function requestUgcEstimate(ugc: AutomationUgcConfig, signal?: AbortSignal) {
  const response = await fetch("/api/ugc-runs/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ugc }),
    signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || "Cost estimate unavailable.")
  return body.estimate as UgcCostBreakdown
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="mt-8 border-t border-app-panel-border pt-6"><h3 className="text-lg font-bold text-app-text">{title}</h3><p className="mt-1 text-sm font-medium text-app-muted-text">{description}</p><div className="mt-5 space-y-4">{children}</div></section>
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-semibold text-app-text">{label}</span>{children}{error ? <span className="mt-1 block text-xs font-semibold text-destructive">{error}</span> : null}</label>
}
function Toggle({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-sm font-semibold text-app-text">{label}</span><SwitchPillButton enabled={enabled} onClick={onToggle} aria-label={`Toggle ${label.toLowerCase()}`} /></div>
}
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (value: T) => void }) {
  return <fieldset><legend className="text-sm font-semibold text-app-text">{label}</legend><div className="app-segmented-control mt-2 inline-flex flex-wrap gap-1 rounded-lg bg-app-surface-subtle p-1">{options.map(([id, text]) => <button key={id} type="button" aria-pressed={value === id} className={cn("rounded-md px-3 py-2 text-sm font-semibold", value === id ? "bg-app-strong text-white" : "text-app-muted-text hover:bg-app-control-hover")} onClick={() => onChange(id)}>{text}</button>)}</div></fieldset>
}
function CostEstimate({ estimate }: { estimate: UgcCostBreakdown }) {
  return <div className="rounded-lg border border-app-panel-border p-4"><ul className="space-y-2">{estimate.items.map((item) => <li key={`${item.stage}-${item.model}`} className="flex justify-between gap-4 text-sm"><span className="min-w-0 truncate font-medium text-app-muted-text capitalize" title={`${item.provider} · ${item.model}`}>{item.stage}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</span><span className="font-mono font-semibold text-app-text">{money(item.costUsd)}</span></li>)}</ul><div className="mt-4 flex justify-between border-t border-app-panel-border pt-3 text-base font-bold text-app-text"><span>{estimate.tier === "premium" ? "Premium" : "Standard"} total</span><span className="font-mono">{money(estimate.totalUsd)}</span></div></div>
}
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value) }
