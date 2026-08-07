import { NextResponse } from "next/server"
import { z } from "zod"

import {
  AUTOMATION_EXPERIMENT_CELL_CAP,
  getAutomationExperimentDimensions,
  runAutomationExperiment,
} from "@/lib/automation-experiment"
import { ApiError, validate, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { withSystemOwner } from "@/lib/system-owner-context"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const requestSchema = z.object({
  vary: z
    .array(
      z.object({
        dimension: z.enum([
          "hook",
          "variable",
          "tone",
          "model",
          "collection",
          "contentDirection",
        ]),
        name: z.string().trim().min(1).max(200).optional(),
        slideIndex: z.number().int().min(1).max(100).optional(),
        values: z.array(z.string().trim().min(1).max(1_000)).min(1).max(200),
      })
    )
    .max(20),
  allHooks: z.boolean().optional(),
  repeats: z.number().int().min(1).max(20).optional(),
  seed: z.number().int().optional(),
  textOnly: z.boolean().optional(),
})

export const GET = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const user = await getCurrentUser()
    if (!user) throw new ApiError(401, "Authentication required")
    const { id } = await context.params
    const automationId = id.trim()
    if (!automationId) throw new ApiError(400, "Template is required")
    const dimensions = await withSystemOwner(user.$id, () =>
      getAutomationExperimentDimensions(automationId)
    )
    return NextResponse.json(dimensions)
  }
)

export const POST = withHandler<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const user = await getCurrentUser()
    if (!user) throw new ApiError(401, "Authentication required")
    const [{ id }, body] = await Promise.all([
      context.params,
      request.json().catch(() => null),
    ])
    const automationId = id.trim()
    if (!automationId) throw new ApiError(400, "Template is required")
    const input = validate(requestSchema, body)
    try {
      const result = await withSystemOwner(user.$id, () =>
        runAutomationExperiment({
          automationId,
          ...input,
        })
      )
      return NextResponse.json(result)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Experiment failed"
      throw new ApiError(/not found/i.test(message) ? 404 : 400, message)
    }
  }
)

export { AUTOMATION_EXPERIMENT_CELL_CAP }
