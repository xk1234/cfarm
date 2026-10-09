import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import {
  derivePillarsFromNicheWithDiagnostics,
  XStrategyDerivationError,
} from "@/lib/x-automation-generation"
import type { XAutomationOperation } from "@/lib/x-automation"
import { getXAutomation, upsertXAutomation } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export const POST = withHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params
    const automation = await getXAutomation(id)
    if (!automation) throw new ApiError(404, "X automation not found")
    if (!automation.niche.label.trim()) {
      throw new ApiError(400, "Add a niche before generating its strategy")
    }
    const startedAt = new Date().toISOString()
    const operationId = `derive-${crypto.randomUUID()}`
    try {
      const result = await derivePillarsFromNicheWithDiagnostics({
        niche: automation.niche.label,
        model: automation.generation.model,
      })
      const operation: XAutomationOperation = {
        id: operationId,
        kind: "derive_brief",
        status: "succeeded",
        startedAt,
        completedAt: new Date().toISOString(),
        selectedModel: result.selectedModel,
        retryable: false,
        attempts: result.attempts,
      }
      const updated = await upsertXAutomation({
        ...automation,
        brief: result.brief,
        operations: [...automation.operations, operation].slice(-20),
      })
      return NextResponse.json({
        automation: updated,
        brief: result.brief,
        operation,
      })
    } catch (error) {
      if (!(error instanceof XStrategyDerivationError)) throw error
      const operation: XAutomationOperation = {
        id: operationId,
        kind: "derive_brief",
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        retryable: error.retryable,
        message: error.message,
        attempts: error.attempts,
      }
      const updated = await upsertXAutomation({
        ...automation,
        operations: [...automation.operations, operation].slice(-20),
      })
      return NextResponse.json(
        {
          error: error.message,
          retryable: error.retryable,
          operation,
          automation: updated,
        },
        { status: error.retryable ? 503 : 422 }
      )
    }
  }
)
