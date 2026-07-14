import { clean } from "@/lib/guards"
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import {
  automationRunSlidesToSlideshowSlides,
  automationSlideshowSettings,
  previewAutomationRunPlan,
} from "@/lib/automation-runner"
import {
  automationTemplateRecordToSchema,
  listAutomationTemplateRecords,
} from "@/lib/automation-templates"
import {
  defaultTempSlideSystemPrompt,
  defaultTempSlideUserInstructions,
} from "@/lib/temp-slide-testing"
import {
  listBenchmarkCorpus,
  randomBenchmarkReferences,
  renderSlidesForBenchmark,
  scoreSlideshowBenchmark,
  type GeneratedSlideshowBenchmark,
} from "@/lib/slideshow-benchmarks"

export const dynamic = "force-dynamic"

type GenerateRequestBody = {
  automationId?: string
  model?: string
  systemPrompt?: string
  promptInstructions?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequestBody
    const automationId = clean(body.automationId)
    const model = clean(body.model)
    const systemPrompt =
      clean(body.systemPrompt) || defaultTempSlideSystemPrompt
    const promptInstructions =
      clean(body.promptInstructions) || defaultTempSlideUserInstructions

    if (!automationId) {
      return NextResponse.json(
        { error: "Automation is required" },
        { status: 400 }
      )
    }

    if (!model) {
      return NextResponse.json(
        { error: "OpenRouter model is required" },
        { status: 400 }
      )
    }

    const records = await listAutomationTemplateRecords()
    const record = records.find((item) => item.id === automationId)
    if (!record) {
      return NextResponse.json(
        { error: "Automation template was not found" },
        { status: 404 }
      )
    }

    const preview = await previewAutomationRunPlan(
      automationTemplateRecordToSchema(record),
      {
        automationId,
        textModel: model,
        systemPrompt,
        promptInstructions,
        includeTextGenerationResult: true,
      }
    )
    const result = preview.plan.debug?.textGenerationResult

    if (!result && preview.plan.debug?.textGenerationError) {
      return NextResponse.json(
        { error: preview.plan.debug.textGenerationError },
        { status: 503 }
      )
    }

    if (!result) {
      return NextResponse.json(
        { error: "The automation engine did not return generated slide text" },
        { status: 500 }
      )
    }

    let benchmarkComparison
    let benchmarkError = ""
    try {
      const benchmarkSchema = automationTemplateRecordToSchema(record)
      const benchmarkSlides = automationRunSlidesToSlideshowSlides(
        benchmarkSchema,
        preview.plan
      )
      const benchmarkSettings = automationSlideshowSettings(benchmarkSchema)
      const benchmarkImageBytes = await renderSlidesForBenchmark(
        benchmarkSlides,
        {
          aspectRatio: benchmarkSettings.aspect_ratio,
          font: benchmarkSettings.font,
        }
      )
      const displaySlides = preview.plan.slides.map((slide, index) => ({
        id: `debug-${automationId}-${index + 1}`,
        imageUrl: slide.imageUrl,
        text: slide.text,
        role: slide.role,
      }))
      const icp = [record.name, record.theme, `Hook topic: ${preview.plan.hook}`]
        .filter(Boolean)
        .join(" · ")
      const grade = await scoreSlideshowBenchmark({
        title: preview.plan.title || record.name,
        icp,
        slides: displaySlides,
        imageBytes: benchmarkImageBytes,
      })
      const benchmarkSubject: GeneratedSlideshowBenchmark = {
        id: `debug-benchmark-${randomUUID()}`,
        slideshowId: `debug-${randomUUID()}`,
        automationId,
        title: preview.plan.title || record.name,
        icp,
        slides: displaySlides,
        ...grade,
        createdAt: new Date().toISOString(),
      }
      benchmarkComparison = {
        subject: benchmarkSubject,
        references: randomBenchmarkReferences(await listBenchmarkCorpus(), 3),
      }
    } catch (error) {
      benchmarkError =
        error instanceof Error ? error.message : "Debug benchmark failed"
    }

    return NextResponse.json({
      automationId,
      model: preview.plan.textModel || model,
      selectedHook: preview.plan.hook,
      result,
      plan: preview.plan,
      status: preview.status,
      benchmarkComparison,
      benchmarkError: benchmarkError || undefined,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate slide text",
      },
      { status: 500 }
    )
  }
}
