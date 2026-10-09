import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import { runDueAutomations } from "@/lib/automation-runner"
import { compositionPrompt, generationRecord } from "@/lib/content-composition"
import { getContentOutputs } from "@/lib/content-output-repository"
import { outputFromGeneratedPost } from "@/lib/content-outputs"
import { getAutomationRecord } from "@/lib/automations"
import { clean } from "@/lib/guards"
import { isRecord } from "@/lib/guards"
import type { XTrendCandidate } from "@/lib/x-automation"
import { generateStoredXAutomationRun } from "@/lib/x-automation-runner"
import { getXAutomation } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export const POST = withHandler<RouteContext<"/api/templates/[id]/generate">>(
  async (request, context) => {
    const templateId = await readRouteId(context.params)
    if (!templateId) throw new ApiError(400, "A template id is required")
    const payload = await request.json().catch(() => null)
    const inputOutputIds = Array.isArray(payload?.inputOutputIds)
      ? payload.inputOutputIds.map((id: unknown) => clean(id)).filter(Boolean)
      : []
    const inputs = await getContentOutputs(inputOutputIds)
    if (inputs.length !== new Set(inputOutputIds).size) {
      throw new ApiError(404, "One or more input outputs were not found")
    }
    const contextPrompt = [
      clean(payload?.topic),
      clean(payload?.prompt),
      compositionPrompt(inputs),
    ]
      .filter(Boolean)
      .join("\n\n")

    const textTemplate = await getXAutomation(templateId)
    if (textTemplate) {
      const run = await generateStoredXAutomationRun({
        automation: textTemplate,
        topic: contextPrompt,
        sourceCandidate: isRecord(payload?.sourceCandidate)
          ? (payload.sourceCandidate as XTrendCandidate)
          : undefined,
        requestId: clean(payload?.requestId),
      })
      const output = outputFromGeneratedPost(run)
      return NextResponse.json(
        {
          generation: generationRecord({
            id: run.id,
            templateId,
            inputOutputIds,
            outputIds: [output.id],
          }),
          output,
          editorRun: run,
        },
        { status: 201 }
      )
    }

    const mediaTemplate = await getAutomationRecord(templateId)
    if (!mediaTemplate) throw new ApiError(404, "Template not found")
    if (mediaTemplate.schema.automationKind === "video") {
      throw new ApiError(
        409,
        "Video templates are generated from their block editor for now"
      )
    }
    const result = await runDueAutomations({
      automationId: templateId,
      force: true,
      requestId: clean(payload?.requestId),
      promptInstructions: contextPrompt || undefined,
    })
    const outputIds = result.created.flatMap((run) =>
      run.slideshowId ? [run.slideshowId] : []
    )
    const generation = generationRecord({
      id: result.created[0]?.id,
      templateId,
      inputOutputIds,
      outputIds,
      status: outputIds.length > 0 ? "ready" : "failed",
      error:
        outputIds.length > 0
          ? undefined
          : result.skipped[0]?.reason || "Generation produced no output",
    })
    return NextResponse.json(
      { generation, ...result },
      { status: outputIds.length > 0 ? 201 : 422 }
    )
  }
)
