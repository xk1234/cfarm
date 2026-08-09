import * as wmill from "windmill-client"

type PipelineStageExecution = {
  stage: { id: string; workflowId: string }
  requestId: string
  status: "succeeded" | "running"
  externalCalls: number
  output: Record<string, unknown>
  operation?: Record<string, unknown>
}

export async function main(
  stage_id: string,
  owner_id: string,
  request_id: string,
  stage_input: Record<string, unknown>
): Promise<PipelineStageExecution> {
  const baseUrl = requiredVariable(
    "f/lumenclip/internal_base_url",
    await wmill.getVariable("f/lumenclip/internal_base_url")
  ).replace(/\/$/, "")
  const sharedSecret = requiredVariable(
    "f/lumenclip/shared_secret",
    await wmill.getVariable("f/lumenclip/shared_secret")
  )
  const response = await fetch(
    `${baseUrl}/api/internal/windmill/stages/${encodeURIComponent(stage_id)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${sharedSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerId: owner_id,
        requestId: request_id,
        input: stage_input,
      }),
    }
  )
  const payload = (await response.json().catch(() => null)) as {
    execution?: PipelineStageExecution
    error?: string
  } | null
  if (!response.ok || !payload?.execution) {
    throw new Error(
      payload?.error || `Lumenclip stage request failed with ${response.status}`
    )
  }
  return payload.execution
}

function requiredVariable(path: string, input: unknown) {
  const value = typeof input === "string" ? input.trim() : ""
  if (!value) throw new Error(`Windmill variable ${path} is not configured`)
  return value
}
