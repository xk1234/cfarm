import { authorizeWindmillRequest } from "@/lib/windmill-auth"
import { executePipelineStage } from "@/lib/pipeline-executor"
import { createProductionPipelineRegistry } from "@/lib/production-pipeline-runtime"
import { clean, isRecord } from "@/lib/guards"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: Promise<{ stageId: string }> }
) {
  if (!authorizeWindmillRequest(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as unknown
  if (!isRecord(body) || !isRecord(body.input)) {
    return Response.json(
      { error: "ownerId, requestId, and input are required" },
      { status: 400 }
    )
  }
  const ownerId = clean(body.ownerId)
  const requestId = clean(body.requestId)
  if (!ownerId || !requestId) {
    return Response.json(
      { error: "ownerId, requestId, and input are required" },
      { status: 400 }
    )
  }
  const { stageId } = await params
  try {
    const execution = await executePipelineStage({
      registry: createProductionPipelineRegistry(),
      ownerId,
      stageId,
      stageInput: body.input,
      requestId,
    })
    return Response.json({ execution })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    )
  }
}
