import { clean } from "@/lib/guards"
import { NextResponse } from "next/server"

import { listAutomationTemplateRecords } from "@/lib/automation-templates"
import {
  automationTemplateToTempSlideTestingAutomation,
  defaultTempSlideSystemPrompt,
  defaultTempSlideUserInstructions,
} from "@/lib/temp-slide-testing"
import { generateSlideshowText } from "@/lib/slideshow-text-generation"

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

    const automation = automationTemplateToTempSlideTestingAutomation(record)
    const apiKey = clean(process.env.OPENROUTER_API_KEY)
    const generation = await generateSlideshowText({
      automation,
      model,
      systemPrompt,
      promptInstructions,
      apiKey,
    }).catch((error) => {
      if (error instanceof Error && error.message === "OPENROUTER_API_KEY is not configured") {
        return null
      }
      throw error
    })

    if (!generation) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured" },
        { status: 503 }
      )
    }

    return NextResponse.json({
      automationId,
      model: generation.model,
      selectedHook: generation.selectedHook,
      result: generation.result,
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

