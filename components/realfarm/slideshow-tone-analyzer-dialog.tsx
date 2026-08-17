"use client"

import { useState } from "react"
import { IconSparkles } from "@tabler/icons-react"

import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { AutomationSchema } from "@/lib/realfarm-automation"
import type {
  SlideshowToneAnalysis,
  TikTokSlideshowTranscript,
} from "@/lib/slideshow-tone-analysis"

type AnalyzeResponse = {
  transcript: TikTokSlideshowTranscript
  analysis: SlideshowToneAnalysis
  suggestedFields: Partial<AutomationSchema>
  warning?: string
}

export function SlideshowToneAnalyzerDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (fields: Partial<AutomationSchema>) => Promise<void>
}) {
  const [url, setUrl] = useState("")
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  async function analyze() {
    setLoading(true)
    setError("")
    try {
      setResult(
        await fetchJsonWithTimeout<AnalyzeResponse>(
          "/api/slideshows/analyze-tone",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
            timeoutMs: 150_000,
          }
        )
      )
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Could not analyze this slideshow"))
    } finally {
      setLoading(false)
    }
  }

  async function createAutomation() {
    if (!result) return
    setCreating(true)
    setError("")
    try {
      await onCreate(result.suggestedFields)
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Could not create template"))
      setCreating(false)
    }
  }

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel
        className="max-h-[calc(100dvh-1rem)] max-w-4xl overflow-hidden sm:max-h-[90dvh]"
        accessibleTitle="Match a TikTok slideshow"
      >
        <AppModalHeader title="Match a TikTok slideshow" onClose={onClose} />
        <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto p-4 sm:max-h-[calc(90dvh-5rem)] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="app-field-label flex-1">
              TikTok slideshow URL
              <input
                className="app-field mt-1 w-full"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.tiktok.com/@creator/photo/..."
              />
            </label>
            <Button
              className="self-end"
              variant="action"
              size="appDefault"
              disabled={!url.trim() || loading}
              onClick={() => void analyze()}
            >
              <IconSparkles className="size-4" />
              {loading ? "Analyzing…" : "Analyze"}
            </Button>
          </div>

          {error ? (
            <p className="mt-3 text-sm font-medium text-app-danger">{error}</p>
          ) : null}
          {result?.warning ? (
            <p className="bg-app-control mt-3 rounded-control border border-app-panel-border px-3 py-2 text-sm text-app-muted-text">
              {result.warning}
            </p>
          ) : null}

          {result ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section>
                <h3 className="text-role-heading">Transcript</h3>
                <div className="mt-3 space-y-2">
                  {result.transcript.slides.map((slide) => (
                    <div
                      key={slide.index}
                      className="border-b border-app-panel-border pb-2 text-sm"
                    >
                      <span className="mr-2 font-mono text-xs text-app-muted-text">
                        {slide.index}
                      </span>
                      {slide.text || (
                        <span className="text-app-muted-text">No text</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-role-heading">Writing pattern</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-app-muted-text">Tone</dt>
                    <dd className="font-semibold">
                      {result.analysis.tone.value}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-app-muted-text">Language</dt>
                    <dd className="font-semibold">
                      {result.analysis.language}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-app-muted-text">Words per slide</dt>
                    <dd className="font-semibold">
                      {result.analysis.wordRange.min}–
                      {result.analysis.wordRange.max}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-app-muted-text">Structure</dt>
                    <dd className="font-semibold">
                      {result.analysis.structure.hookSlides} hook ·{" "}
                      {result.analysis.structure.bodySlides} body ·{" "}
                      {result.analysis.structure.ctaSlides} CTA
                    </dd>
                  </div>
                </dl>
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-app-muted-text">
                  {result.analysis.observations.map((observation) => (
                    <li key={observation}>{observation}</li>
                  ))}
                </ul>
                <Button
                  className="mt-5"
                  variant="action"
                  size="appDefault"
                  disabled={creating}
                  onClick={() => void createAutomation()}
                >
                  {creating ? "Creating…" : "Create matching template"}
                </Button>
              </section>
            </div>
          ) : null}
        </div>
      </AppModalPanel>
    </AppModal>
  )
}
