import {
  createPipelineStageRegistry,
  type PipelineHandlerMap,
} from "@/lib/pipeline-executor"
import { createProductionPipelineHandlers } from "@/lib/mcp/production-pipeline-handlers"
import { enqueueJob, getJob } from "@/lib/queue"
import { getReminderSettings } from "@/lib/reminder-settings"

export function createProductionPipelineRegistry() {
  return createPipelineStageRegistry(createProductionPipelineHandlerMap())
}

export function createProductionPipelineHandlerMap(): PipelineHandlerMap {
  return createProductionPipelineHandlers({
    now: () => new Date(),
    getReminderSettings,
    enqueueJob,
    getJob,
    ugcGenerationEnabled: () => process.env.ENABLE_UGC_AUTOMATION === "true",
  })
}
