import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { WINDMILL_WORKFLOW_DEPENDENCIES } from "./workflow-dependencies"

const flowFolders = {
  "slideshow-generation": "slideshow_generation__flow",
  "ugc-video-generation": "ugc_video_generation__flow",
  "react-reveal-generation": "react_reveal_generation__flow",
  "greenscreen-meme-generation": "greenscreen_meme_generation__flow",
  "linkedin-generation": "linkedin_generation__flow",
  "x-threads-generation": "x_threads_generation__flow",
} as const

async function sourceFor(workflowId: keyof typeof flowFolders) {
  return readFile(
    path.join(
      import.meta.dirname,
      "f",
      "lumenclip",
      flowFolders[workflowId],
      "flow.yaml"
    ),
    "utf8"
  )
}

describe("generated Lumenclip Windmill flows", () => {
  for (const workflowId of Object.keys(flowFolders) as Array<
    keyof typeof flowFolders
  >) {
    it(`${workflowId} contains only real stage calls`, async () => {
      const source = await sourceFor(workflowId)

      expect(source).toContain("type: rawscript")
      expect(source).not.toContain("path: f/lumenclip/run_pipeline_stage")
      expect(source).not.toContain("return { output: { artifact } }")
      expect(source).not.toContain("artifactNode")
      expect(source).not.toMatch(/results\.[^\n]+\?\?\s*results\./)
      expect(source).not.toContain("flow_input.input ??")
      expect(source).toContain("providerRequests?")
      expect(source).toContain("Provider requests:")
    })
  }

  it("derives slideshow joins from actual text, candidate, render, and QA consumption", async () => {
    const source = await sourceFor("slideshow-generation")

    expect(source).toContain("id: load_validation_inputs")
    expect(source).toContain("id: produce_text_and_candidates")
    expect(source).toContain("id: prepare_image_candidate_pools")
    expect(source).toContain(
      "candidatesBySlide: results.produce_text_and_candidates[1].output.candidatesBySlide"
    )
    expect(source).not.toContain("id: text_artifact")
    expect(source).not.toContain("id: prepare_slide_artifacts")

    const qaBranch = source.indexOf("id: render_and_qa_context")
    const priorRuns = source.indexOf("id: load_prior_runs")
    const outputValidation = source.indexOf("id: validate_output")
    expect(qaBranch).toBeGreaterThan(0)
    expect(priorRuns).toBeGreaterThan(qaBranch)
    expect(outputValidation).toBeGreaterThan(priorRuns)
    expect(source.slice(0, qaBranch)).not.toContain("load_prior_runs")
    expect(source).toContain(
      "priorRuns: results.render_and_qa_context[1].output.priorRuns"
    )
  })

  it("derives UGC edges from resolved components and isolated checkpoint artifacts", async () => {
    const source = await sourceFor("ugc-video-generation")

    expect(source).not.toContain("id: resolve_input_groups")
    expect(source).toContain("id: load_template_defaults")
    expect(source).toContain("id: resolve_product_component")
    expect(source).toContain("id: prepare_script_inputs")
    expect(source).toContain("id: prepare_actor_voice")
    expect(source).toContain("id: assemble_performance")
    expect(source).toContain("id: prepare_render_artifacts")
    expect(source).toContain(
      "motion: results.prepare_actor_voice[0].output.artifact"
    )
    expect(source).toContain(
      "voice: results.prepare_actor_voice[1].output.artifact"
    )
    expect(source).toContain(
      "generationId: `${baseGenerationId}-${checkpoint_name}`"
    )
  })

  for (const workflowId of [
    "react-reveal-generation",
    "greenscreen-meme-generation",
  ] as const) {
    it(`${workflowId} resolves roles and stages only real media branches`, async () => {
      const source = await sourceFor(workflowId)

      expect(source).not.toContain("id: resolve_input_groups")
      expect(source).toContain("id: load_template_defaults")
      expect(source).toContain("id: resolve_and_stage_render_inputs")
      expect(source).toContain("id: render_and_output_metadata")
      expect(source).toContain("id: resolve_caption")
      expect(source).toContain("id: resolve_output")
      expect(source).toContain(
        "components: { ...results.render_and_output_metadata[0].output.components, ...results.render_and_output_metadata[1].output.component }"
      )
    })
  }

  it("uses real normalizers for LinkedIn and real template loading for X/Threads", async () => {
    const linkedIn = await sourceFor("linkedin-generation")
    const social = await sourceFor("x-threads-generation")

    for (const handler of [
      "linkedin-generation.normalize-audience-topic",
      "linkedin-generation.normalize-voice-proof",
      "linkedin-generation.normalize-brief-controls",
      "linkedin-generation.normalize-batch-controls",
    ]) {
      expect(linkedIn).toContain(handler)
    }
    expect(linkedIn).toContain(
      "audience: results.resolve_input_groups[0].output.audience"
    )
    expect(social).toContain("x-threads-generation.load-template")
    expect(social).toContain("x-threads-generation.normalize-run-input")
    expect(social).toContain(
      "automation: results.resolve_input_groups[0].output.automation"
    )
    expect(social).toContain(
      "runInput: results.resolve_input_groups[1].output.runInput"
    )
  })

  it("keeps a checked dependency table for every emitted consumer", async () => {
    for (const [workflowId, dependencies] of Object.entries(
      WINDMILL_WORKFLOW_DEPENDENCIES
    ) as Array<
      [
        keyof typeof WINDMILL_WORKFLOW_DEPENDENCIES,
        (typeof WINDMILL_WORKFLOW_DEPENDENCIES)[keyof typeof WINDMILL_WORKFLOW_DEPENDENCIES],
      ]
    >) {
      const source = await sourceFor(workflowId)
      const consumers = new Set<string>()
      for (const edge of dependencies) {
        expect(consumers.has(edge.consumer)).toBe(false)
        consumers.add(edge.consumer)
        expect(edge.reads.length).toBeGreaterThan(0)
        expect(edge.writes.length).toBeGreaterThan(0)
        expect(source).toContain(`id: ${edge.consumer}\n`)
        expect(source).toContain(edge.handler)
        const consumerPosition = source.indexOf(`id: ${edge.consumer}\n`)
        for (const producer of edge.producers) {
          const producerPosition = source.indexOf(`id: ${producer}\n`)
          expect(
            producerPosition,
            `${workflowId}: ${producer}`
          ).toBeGreaterThan(-1)
          expect(
            producerPosition,
            `${workflowId}: ${producer} -> ${edge.consumer}`
          ).toBeLessThan(consumerPosition)
        }
      }
    }
  })
})
