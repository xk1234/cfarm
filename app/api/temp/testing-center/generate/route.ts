import { clean } from "@/lib/guards"
import { NextResponse } from "next/server"

import { internalToolsEnabled } from "@/lib/internal-tools"

import { previewAutomationRunPlan } from "@/lib/automation-runner"
import {
  automationTemplateSchemaToRuntime,
  listAutomationTemplateRecords,
} from "@/lib/automation-templates"
import {
  defaultTempSlideSystemPrompt,
  defaultTempSlideUserInstructions,
} from "@/lib/temp-slide-testing"

export const dynamic = "force-dynamic"

type GenerateRequestBody = {
  automationId?: string
  model?: string
  systemPrompt?: string
  promptInstructions?: string
}

export async function POST(request: Request) {
  if (!internalToolsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

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
      automationTemplateSchemaToRuntime(record),
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

    return NextResponse.json({
      automationId,
      model: preview.plan.textModel || model,
      selectedHook: preview.plan.hook,
      result,
      plan: preview.plan,
      status: preview.status,
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
