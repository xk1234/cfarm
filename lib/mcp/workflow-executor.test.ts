import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  executeMcpWorkflow,
  executeMcpWorkflowStep,
  resolveWorkflowReferences,
  type WorkflowToolRegistry,
} from "@/lib/mcp/workflow-executor"

function result(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  }
}

describe("MCP workflow executor", () => {
  it("runs a complete workflow and pipes structured output into later steps", async () => {
    const create = vi.fn(async () => result({ output: { id: "output-1" } }))
    const inspect = vi.fn(async (input: Record<string, unknown>) =>
      result({ id: input.outputId, status: "ready" })
    )
    const tools: WorkflowToolRegistry = new Map([
      [
        "lumenclip_generate",
        {
          inputSchema: z.object({ requestId: z.string() }),
          call: create,
        },
      ],
      [
        "lumenclip_inspect",
        {
          inputSchema: z.object({ outputId: z.string() }),
          call: inspect,
        },
      ],
    ])

    const workflow = await executeMcpWorkflow({
      workflowId: "draft-and-inspect",
      tools,
      steps: [
        {
          id: "generate",
          tool: "lumenclip_generate",
          arguments: { requestId: "request-1" },
        },
        {
          id: "inspect",
          tool: "lumenclip_inspect",
          arguments: {
            outputId: { $ref: "generate", path: "output.id" },
          },
        },
      ],
    })

    expect(workflow).toMatchObject({
      workflowId: "draft-and-inspect",
      status: "succeeded",
      completedSteps: 2,
      totalSteps: 2,
    })
    expect(inspect).toHaveBeenCalledWith({ outputId: "output-1" })
  })

  it("validates an individual step with the original tool schema", async () => {
    const call = vi.fn(async () => result({ deleted: true }))
    const tools: WorkflowToolRegistry = new Map([
      [
        "lumenclip_delete",
        {
          inputSchema: z.object({
            id: z.string(),
            confirmDelete: z.literal(true),
          }),
          call,
        },
      ],
    ])

    await expect(
      executeMcpWorkflowStep({
        tool: "lumenclip_delete",
        arguments: { id: "output-1" },
        tools,
      })
    ).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()

    await expect(
      executeMcpWorkflowStep({
        tool: "lumenclip_delete",
        arguments: { id: "output-1", confirmDelete: true },
        tools,
      })
    ).resolves.toEqual({ deleted: true })
  })

  it("stops after a failed step by default and reports partial results", async () => {
    const later = vi.fn(async () => result({ reached: true }))
    const tools: WorkflowToolRegistry = new Map([
      [
        "lumenclip_fail",
        {
          inputSchema: z.object({}),
          call: async () => {
            throw new Error("provider unavailable")
          },
        },
      ],
      ["lumenclip_later", { inputSchema: z.object({}), call: later }],
    ])

    const workflow = await executeMcpWorkflow({
      workflowId: "fail-fast",
      tools,
      steps: [
        { id: "first", tool: "lumenclip_fail" },
        { id: "later", tool: "lumenclip_later" },
      ],
    })

    expect(workflow).toMatchObject({
      status: "stopped",
      completedSteps: 0,
      failedStepId: "first",
    })
    expect(workflow.steps).toHaveLength(1)
    expect(later).not.toHaveBeenCalled()
  })

  it("rejects missing references, duplicate ids, and recursive workflow calls", async () => {
    expect(() =>
      resolveWorkflowReferences(
        { outputId: { $ref: "missing", path: "id" } },
        new Map()
      )
    ).toThrow("missing step")

    await expect(
      executeMcpWorkflow({
        workflowId: "duplicate",
        tools: new Map(),
        steps: [
          { id: "same", tool: "one" },
          { id: "same", tool: "two" },
        ],
      })
    ).rejects.toThrow("Duplicate workflow step id")

    await expect(
      executeMcpWorkflowStep({
        tool: "lumenclip_workflow_run",
        tools: new Map(),
      })
    ).rejects.toThrow("cannot invoke themselves")
  })
})
