import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

export const WORKFLOW_TOOL_NAMES = [
  "lumenclip_workflow_run",
  "lumenclip_workflow_step_run",
] as const

export type WorkflowToolName = (typeof WORKFLOW_TOOL_NAMES)[number]

export type WorkflowStep = {
  id: string
  tool: string
  arguments?: Record<string, unknown>
}

export type WorkflowToolRegistration = {
  inputSchema: z.ZodType
  call: (arguments_: Record<string, unknown>) => Promise<CallToolResult>
}

export type WorkflowToolRegistry = Map<string, WorkflowToolRegistration>

export type WorkflowStepResult = {
  id: string
  tool: string
  status: "succeeded" | "failed"
  output?: Record<string, unknown>
  error?: string
}

export function captureMcpWorkflowTools(server: McpServer) {
  const tools: WorkflowToolRegistry = new Map()
  const registerTool = server.registerTool.bind(server)

  server.registerTool = ((
    name: string,
    config: { inputSchema?: unknown },
    callback: unknown
  ) => {
    if (!(WORKFLOW_TOOL_NAMES as readonly string[]).includes(name)) {
      const inputSchema = zodInputSchema(config.inputSchema)
      const call = callback as (
        arguments_: Record<string, unknown>,
        extra: never
      ) => CallToolResult | Promise<CallToolResult>
      tools.set(name, {
        inputSchema,
        call: (arguments_) => Promise.resolve(call(arguments_, {} as never)),
      })
    }
    return registerTool(name, config as never, callback as never)
  }) as typeof server.registerTool

  return tools
}

function zodInputSchema(value: unknown): z.ZodType {
  if (
    value &&
    typeof value === "object" &&
    "parse" in value &&
    typeof value.parse === "function"
  ) {
    return value as z.ZodType
  }
  return z.object((value ?? {}) as z.ZodRawShape)
}
const referenceSchema = z.object({
  $ref: z.string().trim().min(1),
  path: z.string().trim().optional(),
})

export function workflowInputSchema() {
  return {
    workflowId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        'Caller-defined workflow identifier used for tracing, e.g. "weekly-slideshow-draft".'
      ),
    steps: z
      .array(
        z.object({
          id: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
            .describe('Unique step identifier, e.g. "generate".'),
          tool: z
            .string()
            .trim()
            .min(1)
            .describe(
              'Callable LumenClip MCP tool name, e.g. "lumenclip_automation_run".'
            ),
          arguments: z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
              'Tool arguments. Use {"$ref":"step-id","path":"outputs.0.id"} anywhere a value should come from an earlier step.'
            ),
        })
      )
      .min(1)
      .max(20),
    continueOnError: z
      .boolean()
      .default(false)
      .describe(
        "Whether independent later steps should continue after a failure. References to failed steps still fail closed."
      ),
  }
}

export function workflowStepInputSchema() {
  return {
    tool: z
      .string()
      .trim()
      .min(1)
      .describe(
        'Callable LumenClip MCP tool name, e.g. "lumenclip_output_validate".'
      ),
    arguments: z.record(z.string(), z.unknown()).optional(),
  }
}

export async function executeMcpWorkflow(input: {
  workflowId: string
  steps: WorkflowStep[]
  continueOnError?: boolean
  tools: WorkflowToolRegistry
}) {
  assertUniqueStepIds(input.steps)
  const outputs = new Map<string, Record<string, unknown>>()
  const results: WorkflowStepResult[] = []

  for (const step of input.steps) {
    try {
      const arguments_ = resolveWorkflowReferences(
        step.arguments ?? {},
        outputs
      )
      if (!isRecord(arguments_)) {
        throw new Error(
          `Workflow step arguments must resolve to an object: ${step.id}`
        )
      }
      const output = await executeMcpWorkflowStep({
        tool: step.tool,
        arguments: arguments_,
        tools: input.tools,
      })
      outputs.set(step.id, output)
      results.push({
        id: step.id,
        tool: step.tool,
        status: "succeeded",
        output,
      })
    } catch (error) {
      results.push({
        id: step.id,
        tool: step.tool,
        status: "failed",
        error: errorMessage(error),
      })
      if (!input.continueOnError) break
    }
  }

  const failed = results.find((result) => result.status === "failed")
  return {
    workflowId: input.workflowId,
    status: failed
      ? results.length < input.steps.length
        ? "stopped"
        : "failed"
      : "succeeded",
    completedSteps: results.filter((result) => result.status === "succeeded")
      .length,
    totalSteps: input.steps.length,
    failedStepId: failed?.id,
    steps: results,
  }
}

export async function executeMcpWorkflowStep(input: {
  tool: string
  arguments?: Record<string, unknown>
  tools: WorkflowToolRegistry
}) {
  if ((WORKFLOW_TOOL_NAMES as readonly string[]).includes(input.tool)) {
    throw new Error("Workflow tools cannot invoke themselves")
  }
  const registration = input.tools.get(input.tool)
  if (!registration) {
    throw new Error(`Unknown or unavailable workflow step tool: ${input.tool}`)
  }
  const arguments_ = registration.inputSchema.parse(
    input.arguments ?? {}
  ) as Record<string, unknown>
  const result = await registration.call(arguments_)
  if (result.isError) {
    throw new Error(textFromToolResult(result) || `${input.tool} failed`)
  }
  if (result.structuredContent && isRecord(result.structuredContent)) {
    return result.structuredContent
  }
  const text = textFromToolResult(result)
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    return isRecord(parsed) ? parsed : { value: parsed }
  } catch {
    return { text }
  }
}

export function resolveWorkflowReferences(
  value: unknown,
  outputs: ReadonlyMap<string, Record<string, unknown>>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveWorkflowReferences(item, outputs))
  }
  if (!isRecord(value)) return value

  const reference = referenceSchema.safeParse(value)
  if (
    reference.success &&
    Object.keys(value).every((key) => key === "$ref" || key === "path")
  ) {
    const output = outputs.get(reference.data.$ref)
    if (!output) {
      throw new Error(
        `Workflow reference points to missing step: ${reference.data.$ref}`
      )
    }
    return valueAtPath(output, reference.data.path)
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      resolveWorkflowReferences(item, outputs),
    ])
  )
}

function valueAtPath(value: unknown, path?: string) {
  if (!path) return value
  let current = value
  for (const segment of path.split(".")) {
    if (!segment || !isRecordOrArray(current) || !(segment in current)) {
      throw new Error(`Workflow reference path does not exist: ${path}`)
    }
    current = current[segment as keyof typeof current]
  }
  return current
}

function assertUniqueStepIds(steps: WorkflowStep[]) {
  const seen = new Set<string>()
  for (const step of steps) {
    if (seen.has(step.id))
      throw new Error(`Duplicate workflow step id: ${step.id}`)
    seen.add(step.id)
  }
}

function textFromToolResult(result: CallToolResult) {
  return result.content
    .filter(
      (
        item
      ): item is Extract<(typeof result.content)[number], { type: "text" }> =>
        item.type === "text"
    )
    .map((item) => item.text)
    .join("\n")
    .trim()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRecordOrArray(
  value: unknown
): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null
}
