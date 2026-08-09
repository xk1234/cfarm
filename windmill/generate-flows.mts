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

function yamlString(value: string) {
  return JSON.stringify(value)
}
