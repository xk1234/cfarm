import { writeFile } from "node:fs/promises"
import path from "node:path"

import {
  pipelineStagesForWorkflow,
  type PipelineWorkflowId,
} from "../lib/pipeline-stages"

const workflows: Array<{
  id: PipelineWorkflowId
  folder: string
  summary: string
  description: string
}> = [
  {
    id: "slideshow-generation",
    folder: "slideshow_generation__flow",
    summary: "lumenclip - slideshow generation",
    description:
      "Generate a complete slideshow through individually observable and composable stages.",
  },
  {
    id: "ugc-video-generation",
    folder: "ugc_video_generation__flow",
    summary: "lumenclip - UGC video generation",
    description:
      "Generate a UGC product video through individually observable and composable stages.",
  },
  {
    id: "linkedin-generation",
    folder: "linkedin_generation__flow",
    summary: "lumenclip - LinkedIn generation",
    description:
      "Generate LinkedIn posts through individually observable and composable stages.",
  },
  {
    id: "x-threads-generation",
    folder: "x_threads_generation__flow",
    summary: "lumenclip - X and Threads generation",
    description:
      "Generate X or Threads content through individually observable and composable stages.",
  },
]

const pipelineStageModule = pipelineStageModuleSource()

for (const workflow of workflows) {
  if (workflow.id === "ugc-video-generation") {
    await writeFile(
      path.join(
        import.meta.dirname,
        "f",
        "lumenclip",
        workflow.folder,
        "flow.yaml"
      ),
      ugcComponentFlowYaml(workflow.summary, workflow.description)
    )
    continue
  }
  const stages = pipelineStagesForWorkflow(workflow.id)
  const stageIds = stages.map((stage) => stage.id)
  const publicInput = publicInputFor(workflow.id)
  const modules = stages
    .map((stage, index) => {
      const moduleId = stage.id.split(".").at(-1)!.replaceAll("-", "_")
      const priorOutput = stages
        .slice(0, index)
        .reverse()
        .map(
          (candidate) =>
            `results.${candidate.id.split(".").at(-1)!.replaceAll("-", "_")}?.output`
        )
        .concat(publicInput.stageInput)
        .join(" ?? ")
      return `    - id: ${moduleId}
      summary: ${yamlString(stage.title)}
      skip_if:
        expr: flow_input.start_at && ${JSON.stringify(stageIds)}.indexOf(flow_input.start_at) > ${index}
      stop_after_if:
        expr: result.status === "running" || flow_input.stop_after === ${yamlString(stage.id)}
        skip_if_stopped: false
      value:
        type: rawscript
        language: bun
        content: ${yamlString(pipelineStageModule)}
        input_transforms:
          base_url:
            type: static
            value: $var:f/lumenclip/internal_base_url
          shared_secret:
            type: static
            value: $var:f/lumenclip/shared_secret
          default_owner_id:
            type: static
            value: $var:f/lumenclip/default_owner_id
          stage_id:
            type: static
            value: ${yamlString(stage.id)}
          owner_id:
            type: javascript
            expr: flow_input.owner_id
          request_id:
            type: javascript
            expr: flow_input.request_id
          stage_input:
            type: javascript
            expr: ${yamlString(priorOutput)}`
    })
    .join("\n")

  const yaml = `summary: ${yamlString(workflow.summary)}
description: ${yamlString(workflow.description)}
value:
  modules:
${modules}
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
${publicInput.schema}
`

  await writeFile(
    path.join(
      import.meta.dirname,
      "f",
      "lumenclip",
      workflow.folder,
      "flow.yaml"
    ),
    yaml
  )
}

function pipelineStageModuleSource() {
  return `type PipelineStageExecution = {
  stage: { id: string; workflowId: string }
  requestId: string
  status: "succeeded" | "running"
  externalCalls: number
  output: Record<string, unknown>
  operation?: Record<string, unknown>
}

export async function main(
  base_url: string,
  shared_secret: string,
  default_owner_id: string,
  stage_id: string,
  stage_input: Record<string, unknown>,
  owner_id?: string,
  request_id?: string
): Promise<PipelineStageExecution> {
  const resolvedOwnerId = owner_id?.trim() || required("default_owner_id", default_owner_id)
  const resolvedRequestId =
    request_id?.trim() ||
    process.env.WM_ROOT_FLOW_JOB_ID?.trim() ||
    process.env.WM_FLOW_JOB_ID?.trim() ||
    process.env.WM_JOB_ID?.trim() ||
    \`windmill-\${crypto.randomUUID()}\`
  const response = await fetch(
    \`\${required("base_url", base_url).replace(/\\\/$/, "")}/api/internal/windmill/stages/\${encodeURIComponent(stage_id)}\`,
    {
      method: "POST",
      headers: {
        authorization: \`Bearer \${required("shared_secret", shared_secret)}\`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerId: resolvedOwnerId,
        requestId: resolvedRequestId,
        input: stage_input,
      }),
    }
  )
  const payload = (await response.json().catch(() => null)) as {
    execution?: PipelineStageExecution
    error?: string
  } | null
  if (!response.ok || !payload?.execution) {
    throw new Error(payload?.error || \`Lumenclip stage request failed with \${response.status}\`)
  }
  return payload.execution
}

function required(name: string, input: unknown) {
  const value = typeof input === "string" ? input.trim() : ""
  if (!value) throw new Error(\`Lumenclip \${name} is not configured\`)
  return value
}`
}

function publicInputFor(workflowId: PipelineWorkflowId) {
  if (workflowId === "linkedin-generation") {
    return {
      stageInput:
        'flow_input.input ?? { niche: flow_input.niche, topic: flow_input.topic, persona: flow_input.persona ?? "educator", count: flow_input.count ?? 1 }',
      schema: `  order:
    - niche
    - topic
    - persona
    - count
  properties:
    niche:
      type: string
      title: Niche
      description: The audience or market this content is for.
    topic:
      type: string
      title: Topic
      description: Optional topic for this generation.
    persona:
      type: string
      title: Voice
      enum:
        - educator
        - practitioner
      default: educator
    count:
      type: integer
      title: Posts
      minimum: 1
      maximum: 4
      default: 1
  required:
    - niche`,
    }
  }

  const kind =
    workflowId === "slideshow-generation"
      ? "slideshow"
      : workflowId === "ugc-video-generation"
        ? "ugc"
        : "x_threads"
  const noun = kind === "x_threads" ? "automation" : "template"
  const extra = kind === "x_threads" ? ", deriveBrief: true" : ""
  return {
    stageInput: `flow_input.input ?? { automationId: flow_input.automation_id${extra} }`,
    schema: `  order:
    - automation_id
  properties:
    automation_id:
      type: object
      format: dynselect-automation_id
      title: ${kind === "x_threads" ? "Automation" : "Template"}
      description: Choose the Lumenclip ${noun} to generate from.
  required:
    - automation_id
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(dynamicTemplateSelectCode(kind))}`,
  }
}

function dynamicTemplateSelectCode(kind: "slideshow" | "ugc" | "x_threads") {
  return `import * as wmill from "windmill-client"

export async function automation_id(filterText = "") {
  const [baseUrlValue, secretValue, ownerIdValue] = await Promise.all([
    wmill.getVariable("f/lumenclip/internal_base_url"),
    wmill.getVariable("f/lumenclip/shared_secret"),
    wmill.getVariable("f/lumenclip/default_owner_id"),
  ])
  const baseUrl = required("internal_base_url", baseUrlValue).replace(/\\/$/, "")
  const secret = required("shared_secret", secretValue)
  const ownerId = required("default_owner_id", ownerIdValue)
  const response = await fetch(\`${"${baseUrl}"}/api/internal/windmill/templates\`, {
    method: "POST",
    headers: {
      authorization: \`Bearer ${"${secret}"}\`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ownerId, kind: ${JSON.stringify(kind)} }),
  })
  const payload = await response.json()
  if (!response.ok || !Array.isArray(payload.options)) {
    throw new Error(payload.error || \`Template lookup failed with ${"${response.status}"}\`)
  }
  const query = filterText.trim().toLowerCase()
  return query
    ? payload.options.filter((option) => option.label.toLowerCase().includes(query))
    : payload.options
}

function required(name: string, value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new Error(\`Lumenclip variable ${"${name}"} is not configured\`)
  return text
}`
}

function ugcComponentFlowYaml(summary: string, description: string) {
  const resolveModule = ugcRawStageModule({
    id: "resolve_components",
    summary: "Resolve template and component overrides",
    stageId: "ugc-video-generation.resolve-components",
    source: pipelineStageModule,
    inputExpr:
      "({ templateId: flow_input.template_id, product: flow_input.product ?? {}, script: flow_input.script ?? {}, actor: flow_input.actor ?? {}, voice: flow_input.voice ?? {}, broll: flow_input.broll ?? {}, render: flow_input.render ?? {}, generationId: flow_input.generation_id, scheduledFor: flow_input.scheduled_for })",
  })
  const component = (input: {
    id: string
    summary: string
    stageId: string
    checkpoint: string
    inputExpr: string
    indent?: number
  }) =>
    ugcRawStageModule({
      ...input,
      source: ugcComponentModuleSource(),
      component: true,
    })

  const analyze = component({
    id: "analyze_product",
    summary: "Product component — analyze facts",
    stageId: "ugc-video-generation.analyze-product",
    checkpoint: "analysis",
    inputExpr: ugcComponentInputExpr("{}"),
  })
  const script = component({
    id: "generate_script_plan",
    summary: "Script component — hook, body, CTA and timing",
    stageId: "ugc-video-generation.generate-script-plan",
    checkpoint: "script",
    inputExpr: ugcComponentInputExpr(
      "{ analysis: results.analyze_product.output.artifact }"
    ),
  })
  const actor = component({
    id: "resolve_actor",
    summary: "Actor component — resolve or generate portrait",
    stageId: "ugc-video-generation.resolve-generate-actor",
    checkpoint: "actor",
    inputExpr: ugcComponentInputExpr(
      "{ analysis: results.analyze_product.output.artifact, script: results.generate_script_plan.output.artifact }"
    ),
  })
  const motion = component({
    id: "animate_actor",
    summary: "Actor component — animate portrait",
    stageId: "ugc-video-generation.animate-actor",
    checkpoint: "motion",
    inputExpr: ugcComponentInputExpr(
      "{ actor: results.resolve_actor.output.artifact }"
    ),
  })
  const voice = component({
    id: "synthesize_voice",
    summary: "Voice component — speech and word timings",
    stageId: "ugc-video-generation.synthesize-voice",
    checkpoint: "voice",
    inputExpr: ugcComponentInputExpr(
      "{ script: results.generate_script_plan.output.artifact }"
    ),
  })
  const broll = component({
    id: "generate_broll",
    summary: "B-roll component — timed visual inserts",
    stageId: "ugc-video-generation.generate-broll",
    checkpoint: "broll",
    inputExpr: ugcComponentInputExpr(
      "{ script: results.generate_script_plan.output.artifact }"
    ),
  })
  const lipsync = component({
    id: "lip_sync_performance",
    summary: "Performance join — actor motion plus voice",
    stageId: "ugc-video-generation.lip-sync-performance",
    checkpoint: "lipsync",
    inputExpr: ugcComponentInputExpr(
      "{ motion: results.prepare_media_components[0].output.artifact, voice: results.prepare_media_components[1].output.artifact }"
    ),
  })
  const composite = component({
    id: "composite_output",
    summary: "Render join — performance, B-roll and styling",
    stageId: "ugc-video-generation.composite-output",
    checkpoint: "composite",
    inputExpr: ugcComponentInputExpr(
      "{ script: results.generate_script_plan.output.artifact, voice: results.prepare_media_components[1].output.artifact, lipsync: results.lip_sync_performance.output.artifact, broll: results.prepare_media_components[2].output.artifact }"
    ),
  })
  const store = component({
    id: "store_final_output",
    summary: "Output component — persist draft video",
    stageId: "ugc-video-generation.store-final-output",
    checkpoint: "store",
    inputExpr: ugcComponentInputExpr(
      "{ script: results.generate_script_plan.output.artifact, composite: results.composite_output.output.artifact }"
    ),
  })

  const branch = `    - id: prepare_media_components
      summary: "Prepare independent media components"
      value:
        type: branchall
        parallel: false
        branches:
          - summary: "Actor portrait and motion"
            modules:
${indent(actor, 14)}
${indent(motion, 14)}
          - summary: "Voice track"
            modules:
${indent(voice, 14)}
          - summary: "B-roll inserts"
            modules:
${indent(broll, 14)}`

  return `summary: ${yamlString(summary)}
description: ${yamlString(description)}
value:
  modules:
${resolveModule}
${analyze}
${script}
${branch}
${lipsync}
${composite}
${store}
schema:
${ugcComponentSchema()}
`
}

function ugcComponentInputExpr(checkpoints: string) {
  return `({ componentExecution: true, generation: results.resolve_components.output.generation, ...results.resolve_components.output.generation, components: results.resolve_components.output.components, checkpoints: ${checkpoints} })`
}

function ugcRawStageModule(input: {
  id: string
  summary: string
  stageId: string
  source: string
  inputExpr: string
  component?: boolean
  checkpoint?: string
}) {
  return `    - id: ${input.id}
      summary: ${yamlString(input.summary)}
      timeout:
        type: static
        value: ${input.component ? 1800 : 300}
      value:
        type: rawscript
        language: bun
        content: ${yamlString(input.source)}
        input_transforms:
          base_url:
            type: static
            value: $var:f/lumenclip/internal_base_url
          shared_secret:
            type: static
            value: $var:f/lumenclip/shared_secret
          default_owner_id:
            type: static
            value: $var:f/lumenclip/default_owner_id
          stage_id:
            type: static
            value: ${yamlString(input.stageId)}
${
  input.component
    ? `          checkpoint_name:
            type: static
            value: ${yamlString(input.checkpoint ?? "")}
          max_wait_seconds:
            type: static
            value: 1500
`
    : ""
}          owner_id:
            type: javascript
            expr: flow_input.owner_id
          request_id:
            type: javascript
            expr: flow_input.request_id
          stage_input:
            type: javascript
            expr: ${yamlString(input.inputExpr)}`
}

function ugcComponentModuleSource() {
  return `type PipelineStageExecution = {
  stage: { id: string; workflowId: string }
  requestId: string
  status: "succeeded" | "running"
  externalCalls: number
  output: Record<string, unknown>
  operation?: { id?: string; status?: string }
}

export async function main(
  base_url: string,
  shared_secret: string,
  default_owner_id: string,
  stage_id: string,
  checkpoint_name: string,
  stage_input: Record<string, unknown>,
  max_wait_seconds = 1500,
  owner_id?: string,
  request_id?: string
): Promise<PipelineStageExecution> {
  const ownerId = owner_id?.trim() || required("default_owner_id", default_owner_id)
  const requestId = request_id?.trim() || process.env.WM_ROOT_FLOW_JOB_ID?.trim() || process.env.WM_FLOW_JOB_ID?.trim() || process.env.WM_JOB_ID?.trim() || \`windmill-\${crypto.randomUUID()}\`
  const queued = await callStage(base_url, shared_secret, ownerId, requestId, stage_id, stage_input)
  if (queued.status === "succeeded") return queued
  const jobId = text(queued.operation?.id)
  if (!jobId) throw new Error(\`\${checkpoint_name} did not return a queue job\`)
  const deadline = Date.now() + Math.max(30, max_wait_seconds) * 1000
  while (Date.now() < deadline) {
    await Bun.sleep(2000)
    const polled = await callStage(
      base_url,
      shared_secret,
      ownerId,
      requestId,
      "ugc-video-generation.get-checkpoint-job",
      { jobId }
    )
    const job = record(polled.output.job)
    const status = text(job.status)
    if (["failed", "dead", "canceled"].includes(status)) {
      throw new Error(text(job.error) || \`\${checkpoint_name} component failed\`)
    }
    if (status !== "completed") continue
    const result = record(job.result)
    if (result.skipped === true) {
      throw new Error(\`\${checkpoint_name} component was skipped: \${text(result.reason) || "unknown reason"}\`)
    }
    const artifact = record(record(result.checkpoints)[checkpoint_name])
    if (!Object.keys(artifact).length) {
      throw new Error(\`\${checkpoint_name} completed without a checkpoint artifact\`)
    }
    return {
      stage: queued.stage,
      requestId,
      status: "succeeded",
      externalCalls: queued.externalCalls + polled.externalCalls,
      output: {
        component: checkpoint_name,
        artifact,
        generation: record(stage_input.generation),
        operation: { id: jobId, status: "succeeded" },
      },
    }
  }
  throw new Error(\`\${checkpoint_name} component timed out after \${max_wait_seconds}s\`)
}

async function callStage(
  baseUrl: string,
  secret: string,
  ownerId: string,
  requestId: string,
  stageId: string,
  input: Record<string, unknown>
) {
  const response = await fetch(
    \`\${required("base_url", baseUrl).replace(/\\\/$/, "")}/api/internal/windmill/stages/\${encodeURIComponent(stageId)}\`,
    {
      method: "POST",
      headers: {
        authorization: \`Bearer \${required("shared_secret", secret)}\`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ownerId, requestId, input }),
    }
  )
  const payload = (await response.json().catch(() => null)) as { execution?: PipelineStageExecution; error?: string } | null
  if (!response.ok || !payload?.execution) {
    throw new Error(payload?.error || \`Lumenclip stage request failed with \${response.status}\`)
  }
  return payload.execution
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
function required(name: string, value: unknown) {
  const result = text(value)
  if (!result) throw new Error(\`Lumenclip \${name} is not configured\`)
  return result
}`
}

function ugcComponentSchema() {
  return `  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  order:
    - template_id
    - product
    - script
    - actor
    - voice
    - broll
    - render
  properties:
    template_id:
      type: object
      format: dynselect-template_id
      title: Template (optional)
      description: Load defaults from a UGC template; every component below can override it.
    product:
      type: object
      title: Product
      additionalProperties: false
      properties:
        url:
          type: string
          title: Product URL
        brief:
          type: string
          title: Product brief
          format: textarea
        analysis:
          type: object
          title: Supplied analysis
          description: Optional structured artifact that skips product analysis.
    script:
      type: object
      title: Script
      additionalProperties: false
      properties:
        targetDurationSeconds:
          type: integer
          title: Target duration (seconds)
          minimum: 15
          maximum: 180
          default: 60
        plan:
          type: object
          title: Supplied script plan
          description: Optional hook, segments, caption and hashtags artifact that skips script generation.
    actor:
      type: object
      title: Actor
      additionalProperties: false
      properties:
        source:
          type: string
          title: Source
          enum: [generate, asset]
          default: generate
        assetUrl:
          type: string
          title: Portrait asset URL
        prompt:
          type: string
          title: Portrait prompt
          format: textarea
        motionPrompt:
          type: string
          title: Motion prompt
          format: textarea
    voice:
      type: object
      title: Voice
      additionalProperties: false
      properties:
        voiceId:
          type: string
          title: ElevenLabs voice ID
        model:
          type: string
          title: Voice model
          default: eleven_multilingual_v2
    broll:
      type: object
      title: B-roll
      additionalProperties: false
      properties:
        enabled:
          type: boolean
          title: Generate B-roll
          default: true
        count:
          type: integer
          title: Images
          minimum: 0
          maximum: 6
          default: 3
    render:
      type: object
      title: Render
      additionalProperties: false
      properties:
        aspectRatio:
          type: string
          title: Aspect ratio
          enum: ["9:16", "1:1", "16:9"]
          default: "9:16"
        lipSyncTier:
          type: string
          title: Lip-sync tier
          enum: [standard, premium]
          default: standard
        captions:
          type: object
          title: Captions
        hookOverlay:
          type: object
          title: Hook overlay
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(dynamicTemplateSelectCode("ugc").replaceAll("automation_id", "template_id"))}`
}

function indent(value: string, spaces: number) {
  const prefix = " ".repeat(spaces)
  return value
    .split("\n")
    .map((line) => `${prefix}${line.startsWith("    ") ? line.slice(4) : line}`)
    .join("\n")
}

function yamlString(value: string) {
  return JSON.stringify(value)
}
