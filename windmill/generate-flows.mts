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

for (const workflow of workflows) {
  const stages = pipelineStagesForWorkflow(workflow.id)
  const stageIds = stages.map((stage) => stage.id)
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
        .concat("flow_input.input")
        .join(" ?? ")
      return `    - id: ${moduleId}
      summary: ${yamlString(stage.title)}
      skip_if:
        expr: flow_input.start_at && ${JSON.stringify(stageIds)}.indexOf(flow_input.start_at) > ${index}
      stop_after_if:
        expr: result.status === "running" || flow_input.stop_after === ${yamlString(stage.id)}
        skip_if_stopped: false
      value:
        type: script
        path: f/lumenclip/run_pipeline_stage
        input_transforms:
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
            expr: ${priorOutput}`
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
  order:
    - owner_id
    - request_id
    - input
    - start_at
    - stop_after
  properties:
    owner_id:
      type: string
      description: Lumenclip owner whose data this workflow may access.
    request_id:
      type: string
      description: Stable idempotency key for this workflow run.
    input:
      type: object
      additionalProperties: true
      description: Initial structured input for the first workflow stage.
    start_at:
      type: string
      enum: ${JSON.stringify(stageIds)}
      description: Optional first stage for a partial workflow run.
    stop_after:
      type: string
      enum: ${JSON.stringify(stageIds)}
      description: Optional final stage for a partial workflow run.
  required:
    - owner_id
    - request_id
    - input
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

function yamlString(value: string) {
  return JSON.stringify(value)
}
