export async function main(
  runtime_env_json: string,
  default_owner_id: string,
  stage_id: string,
  stage_input: Record<string, unknown>,
  owner_id = "",
  request_id = "",
  checkpoint_name = ""
) {
  installRuntimeEnvironment(runtime_env_json)
  const ownerId = owner_id?.trim() || required("default_owner_id", default_owner_id)
  const requestId =
    request_id?.trim() ||
    process.env.WM_ROOT_FLOW_JOB_ID?.trim() ||
    process.env.WM_FLOW_JOB_ID?.trim() ||
    process.env.WM_JOB_ID?.trim() ||
    `windmill-${crypto.randomUUID()}`
  const [
    { createPipelineStageRegistry, executePipelineStage },
    { createProductionPipelineHandlers },
    { getReminderSettings, sendTelegramReminder },
    { withSystemOwner },
  ] =
    await Promise.all([
      import("../../lib/pipeline-executor"),
      import("./production-pipeline-handlers"),
      import("../../lib/reminder-settings"),
      import("../../lib/system-owner-context"),
    ])
  return withSystemOwner(ownerId, async () => {
    const registry = createPipelineStageRegistry(
      createProductionPipelineHandlers({
        now: () => new Date(),
        getReminderSettings,
        sendGeneratedReminder: async (text) => {
          const settings = await getReminderSettings()
          if (settings.events.generated.channel !== "telegram") {
            return { sent: false }
          }
          await sendTelegramReminder({
            text,
            chatId: settings.telegramChatId,
            botToken: settings.telegramBotToken,
          })
          return { sent: true }
        },
      })
    )
    const stageId = required("stage_id", stage_id)
    const checkpoint =
      checkpoint_name?.trim() || ugcCheckpointForStage(stageId)
    if (!checkpoint) {
      return executePipelineStage({
        registry,
        ownerId,
        stageId,
        stageInput: stage_input,
        requestId,
      })
    }

    return executeUgcComponentInsideWindmill({
      registry,
      ownerId,
      requestId,
      stageId,
      checkpoint,
      stageInput: stage_input,
    })
  })
}

function ugcCheckpointForStage(stageId: string) {
  const checkpoints: Record<string, string> = {
    "ugc-video-generation.analyze-product": "analysis",
    "ugc-video-generation.generate-script-plan": "script",
    "ugc-video-generation.resolve-generate-actor": "actor",
    "ugc-video-generation.synthesize-voice": "voice",
    "ugc-video-generation.animate-actor": "motion",
    "ugc-video-generation.lip-sync-performance": "lipsync",
    "ugc-video-generation.generate-broll": "broll",
    "ugc-video-generation.composite-output": "composite",
    "ugc-video-generation.store-final-output": "store",
  }
  return checkpoints[stageId]
}

async function executeUgcComponentInsideWindmill(input: {
  registry: Map<string, Record<string, unknown>>
  ownerId: string
  requestId: string
  stageId: string
  checkpoint: string
  stageInput: Record<string, unknown>
}) {
  const [{ getAppwrite, APPWRITE_DATABASE_ID }, { runUgcAutomationJob }] =
    await Promise.all([
      import("../../lib/appwrite"),
      import("./ugc-automation.js"),
    ])
  const clients = getAppwrite()
  if (!clients) throw new Error("LumenClip persistence is not configured")
  const generation = record(input.stageInput.generation)
  const generationId =
    `${text(generation.generationId) || input.requestId}-${input.checkpoint}`
  const scheduledFor =
    text(generation.scheduledFor) || new Date().toISOString()
  const result = (await runUgcAutomationJob({
    payload: {
      templateId: text(generation.templateId) || undefined,
      generationId,
      scheduledFor,
      requestId: input.requestId,
      source: "windmill_native_stage",
      draftOnly: true,
      componentExecution: true,
      stopAfter: input.checkpoint,
      onlyStage: input.checkpoint,
      components: record(input.stageInput.components),
      checkpoints: record(input.stageInput.checkpoints),
    },
    tables: clients.tables,
    storage: clients.storage,
    job: { id: generationId, $id: generationId, owner_id: input.ownerId },
    databaseId: APPWRITE_DATABASE_ID,
    sendTelegram: async () => undefined,
  })) as Record<string, unknown>
  if (result.skipped === true) {
    throw new Error(
      `${input.checkpoint} component was skipped: ${text(result.reason) || "unknown reason"}`
    )
  }
  const artifact = record(record(result.checkpoints)[input.checkpoint])
  if (!Object.keys(artifact).length) {
    throw new Error(
      `${input.checkpoint} completed without a checkpoint artifact`
    )
  }
  const registered = input.registry.get(input.stageId)
  if (!registered) throw new Error(`Unknown pipeline stage: ${input.stageId}`)
  return {
    stage: publicStageMetadata(registered),
    requestId: input.requestId,
    status: "succeeded" as const,
    externalCalls: 0,
    output: {
      component: input.checkpoint,
      artifact,
      generation,
      components: record(input.stageInput.components),
      execution: { runtime: "windmill", generationId },
    },
  }
}

function publicStageMetadata(stage: Record<string, unknown>) {
  const { handler: _handler, inputSchema: _inputSchema, ...metadata } = stage
  return metadata
}

function installRuntimeEnvironment(serialized: string) {
  const parsed = JSON.parse(required("runtime_env_json", serialized)) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LumenClip runtime_env_json must contain a JSON object")
  }
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value) process.env[name] = value
  }
  process.env.WINDMILL_TOKEN ??= process.env.WM_TOKEN
  process.env.WINDMILL_WORKSPACE_ID ??= process.env.WM_WORKSPACE
}

function required(name: string, value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new Error(`LumenClip ${name} is not configured`)
  return text
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
