import type { PipelineWorkflowId } from "../lib/pipeline-stages"
import { WINDMILL_WORKFLOW_DEPENDENCIES } from "./workflow-dependencies"

export type WindmillWorkflowDefinition = {
  id: PipelineWorkflowId
  folder: string
  summary: string
  description: string
}

export const WINDMILL_WORKFLOWS = [
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
    id: "react-reveal-generation",
    folder: "react_reveal_generation__flow",
    summary: "lumenclip - React & Reveal generation",
    description:
      "Play a full anticipation clip followed by a full reveal clip through named media, render, and draft-output components.",
  },
  {
    id: "greenscreen-meme-generation",
    folder: "greenscreen_meme_generation__flow",
    summary: "lumenclip - Greenscreen Meme generation",
    description:
      "Chroma-key a full meme clip over a background with a hook caption through named media, render, and draft-output components.",
  },
  {
    id: "template-video-generation",
    folder: "template_video_generation__flow",
    summary: "lumenclip - template video generation",
    description:
      "Generate every non-UGC video template through independent copy and media paths that join at render assembly.",
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
] as const satisfies readonly WindmillWorkflowDefinition[]

export const WINDMILL_WORKFLOW_MANIFEST = Object.fromEntries(
  WINDMILL_WORKFLOWS.map((workflow) => [
    workflow.id,
    {
      ...workflow,
      dependencies: WINDMILL_WORKFLOW_DEPENDENCIES[workflow.id],
    },
  ])
) as {
  [WorkflowId in PipelineWorkflowId]: Extract<
    (typeof WINDMILL_WORKFLOWS)[number],
    { id: WorkflowId }
  > & {
    dependencies: (typeof WINDMILL_WORKFLOW_DEPENDENCIES)[WorkflowId]
  }
}

export const WINDMILL_FLOW_FOLDERS = Object.fromEntries(
  WINDMILL_WORKFLOWS.map(({ id, folder }) => [id, folder])
) as Record<PipelineWorkflowId, string>
