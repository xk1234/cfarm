"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { IconForms, IconPhoto } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  ApiClientError,
  createRender,
  listTemplates,
} from "@/components/realfarm/api-client"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SlotValues, SpecIssue } from "@/lib/render/spec"

import { SlotFiller, type RenderTarget } from "./slot-filler"
import { analyzeSpecJson } from "./spec-json"
import { SpecJsonInput } from "./spec-json-input"
import { SpecPreview, useSpecPreview } from "./spec-preview"
import { mergeTemplates } from "./starter-templates"
import { TemplateGallery } from "./template-gallery"

export type NewRenderMode = "template" | "json"

export function NewRenderView({
  initialMode = "template",
  onRendered,
}: {
  initialMode?: NewRenderMode
  onRendered: (renderId: string) => void
}) {
  const [mode, setMode] = useState<NewRenderMode>(initialMode)
  const [filling, setFilling] = useState<{
    target: RenderTarget
    values?: SlotValues
    from: NewRenderMode
  } | null>(null)
  const [json, setJson] = useState("")
  const [rendering, setRendering] = useState(false)
  const [serverIssues, setServerIssues] = useState<SpecIssue[]>([])
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
    retry: false,
    staleTime: 60_000,
  })
  const gallery = useMemo(
    () => (templates.isLoading ? [] : mergeTemplates(templates.data ?? null)),
    [templates.data, templates.isLoading]
  )
  const analysis = useMemo(() => analyzeSpecJson(json), [json])
  const valid = analysis.status === "valid" ? analysis : null
  const preview = useSpecPreview({
    spec: valid?.spec ?? null,
    slotValues: valid?.slotValues,
    enabled: mode === "json" && !!valid,
  })

  if (filling) {
    return (
      <SlotFiller
        key={filling.target.id}
        target={filling.target}
        initialValues={filling.values}
        backLabel={filling.from === "json" ? "Back to JSON" : "Back to templates"}
        onBack={() => {
          setMode(filling.from)
          setFilling(null)
        }}
        onRendered={onRendered}
      />
    )
  }

  async function renderPasted() {
    if (!valid) return
    if (valid.needsSlotValues) {
      setFilling({
        target: {
          id: valid.spec.id ?? "pasted-spec",
          name: valid.title ?? "Pasted template",
          spec: valid.spec,
          source: "pasted",
        },
        from: "json",
      })
      return
    }
    setRendering(true)
    setServerIssues([])
    try {
      const result = await createRender({
        spec: valid.spec,
        ...(valid.slotValues ? { slotValues: valid.slotValues } : {}),
        ...(valid.title ? { title: valid.title } : {}),
        output: { format: "png", zip: true },
        wait: true,
      })
      onRendered(result.id)
    } catch (error) {
      if (error instanceof ApiClientError) setServerIssues(error.issues)
      toast.error(error instanceof Error ? error.message : "Render failed.")
    } finally {
      setRendering(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-app-text">New render</h1>
        {mode === "json" ? (
          <Button
            type="button"
            variant="action"
            size="appDefault"
            className="min-w-[132px] self-start sm:self-auto"
            disabled={!valid || rendering}
            onClick={() => void renderPasted()}
          >
            {valid?.needsSlotValues ? <IconForms /> : <IconPhoto />}
            {rendering ? "Rendering…" : valid?.needsSlotValues ? "Fill slots" : "Render"}
          </Button>
        ) : null}
      </header>
      <Tabs value={mode} onValueChange={(value) => setMode(value as NewRenderMode)}>
        <TabsList>
          <TabsTrigger value="template">From template</TabsTrigger>
          <TabsTrigger value="json">Paste JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="template" className="pt-6">
          <TemplateGallery
            templates={gallery}
            loading={templates.isLoading}
            onSelect={(template) =>
              setFilling({
                target: { id: template.id, name: template.name, spec: template.spec, starter: template.starter },
                from: "template",
              })
            }
          />
        </TabsContent>
        <TabsContent value="json" className="pt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <div className="min-w-0 space-y-4">
              <SpecJsonInput value={json} analysis={analysis} onChange={setJson} />
              {serverIssues.length > 0 ? (
                <ul role="alert" className="space-y-1 rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted">
                  {serverIssues.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>
                      <span className="font-mono text-xs">{issue.path || "/"}</span> {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <section className="min-w-0 space-y-3">
              <h2 className="text-sm font-semibold text-app-text">Preview</h2>
              {valid ? (
                <SpecPreview spec={valid.spec} state={preview} emptyLabel="Spec preview" />
              ) : (
                <p className="rounded-xl border border-dashed border-app-panel-border p-6 text-center text-sm text-app-muted-text">
                  Paste a valid spec to preview it.
                </p>
              )}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
