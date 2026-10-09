import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, readRouteId, validate, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import {
  forkSlideshowWorkflow,
  WorkflowForkError,
} from "@/lib/slideshow-workflow-fork"
import { withSystemOwner } from "@/lib/system-owner-context"

export const dynamic = "force-dynamic"

const forkSchema = z
  .object({
    stageId: z.literal("generate-text"),
    scope: z.enum(["input", "selection"]).default("selection"),
    path: z.string().trim().min(1).max(500),
    selectionStart: z.number().int().nonnegative().optional(),
    selectionEnd: z.number().int().positive().optional(),
    selectedText: z.string().min(1).max(20_000).optional(),
    variations: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          replacement: z.string().max(20_000),
        })
      )
      .min(1)
      .max(4),
  })
  .superRefine((input, context) => {
    if (
      input.scope === "selection" &&
      (input.selectionStart === undefined ||
        input.selectionEnd === undefined ||
        input.selectionEnd <= input.selectionStart ||
        !input.selectedText)
    ) {
      context.addIssue({
        code: "custom",
        message: "Select a non-empty part of the prompt",
        path: ["selectedText"],
      })
    }
  })

export const POST = withHandler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const runId = await readRouteId(context.params)
    if (!runId) throw new ApiError(400, "Workflow run is required")
    const user = await getCurrentUser()
    if (!user) throw new ApiError(401, "Authentication required")
    const input = validate(forkSchema, await request.json().catch(() => null))

    try {
      const fork = await withSystemOwner(user.$id, () =>
        forkSlideshowWorkflow(user.$id, {
          parentRunId: runId,
          ...input,
        })
      )
      return NextResponse.json(fork)
    } catch (error) {
      if (error instanceof WorkflowForkError) {
        throw new ApiError(error.status, error.message)
      }
      throw error
    }
  }
)
