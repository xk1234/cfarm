import { readFile } from "node:fs/promises"
import path from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

import { WINDMILL_WORKFLOW_DEPENDENCIES } from "./workflow-dependencies"
import {
  WINDMILL_FLOW_FOLDERS as flowFolders,
  WINDMILL_WORKFLOW_MANIFEST,
} from "./workflow-manifest"

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
  it("keeps metadata and dependencies in one complete manifest", () => {
    expect(Object.keys(WINDMILL_WORKFLOW_MANIFEST).sort()).toEqual(
      Object.keys(flowFolders).sort()
    )
    for (const workflow of Object.values(WINDMILL_WORKFLOW_MANIFEST)) {
      expect(workflow.summary).toMatch(/^lumenclip - /)
      expect(workflow.dependencies).toBe(
        WINDMILL_WORKFLOW_DEPENDENCIES[workflow.id]
      )
    }
  })

  for (const workflowId of Object.keys(flowFolders) as Array<
    keyof typeof flowFolders
  >) {
    it(`${workflowId} contains only real stage calls`, async () => {
      const source = await sourceFor(workflowId)

      expect(source).toContain("type: script")
      expect(source).toContain("path: f/lumenclip/workflow_stage_runtime")
      expect(source).toContain("$var:f/lumenclip/runtime_env_json")
      expect(source).not.toContain("type: rawscript")
      expect(source).not.toContain("path: f/lumenclip/run_pipeline_stage")
      expect(source).not.toContain("/api/internal/windmill/")
      expect(source).not.toContain("internal_base_url")
      expect(source).not.toContain("shared_secret")
      expect(source).not.toContain("return { output: { artifact } }")
      expect(source).not.toContain("artifactNode")
      expect(source).not.toMatch(/results\.[^\n]+\?\?\s*results\./)
      expect(source).not.toContain("flow_input.input ??")
      expect(source).not.toContain("x-lumenclip-hide-input-node")
    })
  }

  it("uses the official Windmill image without frontend source patches", async () => {
    const dockerfile = await readFile(
      path.join(
        import.meta.dirname,
        "..",
        "infra",
        "windmill-custom-ui",
        "Dockerfile"
      ),
      "utf8"
    )

    expect(dockerfile).toMatch(/^FROM ghcr\.io\/windmill-labs\/windmill:/)
    expect(dockerfile).not.toContain("git clone")
    expect(dockerfile).not.toContain("git apply")
    expect(dockerfile).not.toContain("COPY --from=frontend")
  })

  it("surfaces provider request traces from the native Windmill runtime", async () => {
    const runtime = await readFile(
      path.join(
        import.meta.dirname,
        "f",
        "lumenclip",
        "workflow_stage_runtime.ts"
      ),
      "utf8"
    )

    expect(runtime).toContain("captureProviderRequests")
    expect(runtime).toContain("providerRequests")
    expect(runtime).toContain("requestError.providerRequests")
  })

  it("keeps slideshow generation independent from legacy history and post-processing", async () => {
    const source = await sourceFor("slideshow-generation")

    expect(source).toContain("id: resolve_generation_inputs")
    expect(source).toContain("id: normalize_run_brief")
    expect(source).toContain("id: normalize_collection_overrides")
    expect(source).toContain("id: normalize_slide_overrides")
    expect(source).toContain("id: produce_text_and_candidates")
    expect(source).toContain("id: prepare_image_candidate_pools")
    expect(source).toContain(
      "candidatesBySlide: results.produce_text_and_candidates[1].output.candidatesBySlide"
    )
    expect(source).not.toContain("id: text_artifact")
    expect(source).not.toContain("id: prepare_slide_artifacts")

    const render = source.indexOf("id: render_store_pngs")
    const outputValidation = source.indexOf("id: validate_output")
    expect(render).toBeGreaterThan(0)
    expect(outputValidation).toBeGreaterThan(render)
    for (const legacy of [
      "load_usage",
      "load_prior_runs",
      "research_hook",
      "retry_text_similarity",
      "derive_visual_concepts",
      "translate_plan",
      "render_store_mp4",
      "reuseMemory",
      "priorRuns",
    ]) {
      expect(source).not.toContain(legacy)
    }
  })

  it("exposes non-destructive slideshow content and collection overrides", async () => {
    const source = await sourceFor("slideshow-generation")

    expect(source).toContain("contentControls: flow_input.content_inputs")
    expect(source).toContain(
      "slideshow-generation.normalize-collection-overrides"
    )
    expect(source).toContain("slideOverrides: flow_input.slide_overrides")
    expect(source).toContain("title: Template and hook")
    expect(source).toContain("title: Content controls")
    expect(source).toContain("title: Collection controls")
    expect(source).toContain("title: Individual slide controls")
    expect(source).toContain("format: dynselect-hook_collection_id")
    expect(source).toContain("format: dynselect-body_collection_id")
    expect(source).toContain("format: dynselect-cta_collection_id")
    expect(source).toContain("hook_collection_id(filterText")
    expect(source).toContain("format: dynselect-slide_collection_id")
  })

  it("uses the object schema type required by the deployed Windmill dynamic input renderer", async () => {
    for (const workflowId of Object.keys(flowFolders) as Array<
      keyof typeof flowFolders
    >) {
      const source = await sourceFor(workflowId)
      expect(source).not.toMatch(/type: string\n\s+format: dynselect-/)
    }
  })

  it("bundles typed media artifacts for intermediate image and video values", async () => {
    const runtime = await readFile(
      path.join(
        import.meta.dirname,
        "f",
        "lumenclip",
        "workflow_stage_runtime.ts"
      ),
      "utf8"
    )
    expect(runtime).toContain("workflowMediaArtifacts")
    expect(runtime).toContain("mediaArtifacts")
    expect(runtime).toContain('kind: "image"')
    expect(runtime).toContain('kind: "video"')
    expect(runtime).toContain("download")
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
    expect(source).toContain('value: "analysis"')
    expect(source).toContain('value: "store"')
    expect(source).toContain("format: dynselect-actor_collection_id")
    expect(source).toContain("actor_collection_id:\n      type: object")
    expect(source).toContain("actor_collection_id(filterText")
    expect(source).toContain("collectionId: flow_input.actor_collection_id")
    expect(source).not.toContain("Portrait asset URL")
    expect(source).not.toContain("assetUrl:")
    expect(source).not.toContain("actor_asset_collection_id")
  })

  it("bundles the production handlers into Windmill without Clerk or app callbacks", async () => {
    const source = await readFile(
      path.join(import.meta.dirname, "f/lumenclip/workflow_stage_runtime.ts"),
      "utf8"
    )
    expect(source).toContain('runtime: "windmill"')
    expect(source).not.toContain("/api/internal/windmill/")
    expect(source).not.toContain("@clerk/nextjs")
    expect(source).not.toContain('from "react"')
    expect(source).not.toContain('type: "run-ugc-component"')
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
      expect(source).toContain("x-windmill-dyn-select-code")
      expect(source).not.toContain("Full clip URL")
      expect(source).not.toContain("Image URL")
      expect(source).not.toMatch(/properties:\n\s+url:/)
    })
  }

  it("uses video and photo collection dropdowns for fixed-format media", async () => {
    const reactReveal = await sourceFor("react-reveal-generation")
    const greenscreen = await sourceFor("greenscreen-meme-generation")

    expect(reactReveal).toContain(
      "format: dynselect-anticipation_collection_id"
    )
    expect(reactReveal).toContain(
      "anticipation_collection_id:\n      type: object"
    )
    expect(reactReveal).toContain("format: dynselect-reveal_collection_id")
    expect(reactReveal).toContain(
      "collectionId: flow_input.anticipation_collection_id"
    )
    expect(greenscreen).toContain("format: dynselect-meme_collection_id")
    expect(greenscreen).toContain(
      "background_collection_id:\n      type: object"
    )
    expect(greenscreen).toContain("format: dynselect-background_collection_id")
    expect(greenscreen).toContain(
      "collectionId: flow_input.background_collection_id"
    )
  })

  it("uses saved-template selectors in every template-backed generation form", async () => {
    for (const workflowId of [
      "ugc-video-generation",
      "react-reveal-generation",
      "greenscreen-meme-generation",
      "template-video-generation",
    ] as const) {
      const source = await sourceFor(workflowId)
      expect(source).toContain("format: dynselect-template_id")
      expect(source).toContain("export async function template_id(filterText")
    }

    const slideshow = await sourceFor("slideshow-generation")
    expect(slideshow).toContain("format: dynselect-automation_id")
    expect(slideshow).toContain(
      "export async function automation_id(filterText"
    )
    expect(slideshow).toContain("format: dynselect-hook")

    const social = await sourceFor("x-threads-generation")
    expect(social).toContain("format: dynselect-automation_id")
    const dynamicCodeLine = social
      .split("\n")
      .find((line) =>
        line.trimStart().startsWith("x-windmill-dyn-select-code:")
      )
    expect(dynamicCodeLine).toBeDefined()
    expect(
      JSON.parse(dynamicCodeLine!.slice(dynamicCodeLine!.indexOf(":") + 1))
    ).toContain('"table":"social_templates"')
  })

  it("keeps orchestration and debug artifacts out of visible generation inputs", async () => {
    const slideshow = await sourceFor("slideshow-generation")
    const slideshowSchema = slideshow.slice(
      slideshow.lastIndexOf("\nschema:\n")
    )
    expect(slideshowSchema).not.toContain("scheduled_for:")
    expect(slideshowSchema).not.toContain("generation_source:")
    expect(slideshowSchema).toContain("title: Hook override (optional)")

    const linkedIn = await sourceFor("linkedin-generation")
    const linkedInSchema = linkedIn.slice(linkedIn.lastIndexOf("\nschema:\n"))
    expect(linkedInSchema).not.toContain("brief_model:")
    expect(linkedInSchema).not.toContain("title: Post model override")
    expect(linkedInSchema).not.toContain("title: Supplied niche brief")

    const ugc = await sourceFor("ugc-video-generation")
    const ugcSchema = ugc.slice(ugc.lastIndexOf("\nschema:\n"))
    expect(ugcSchema).not.toContain("title: Supplied analysis")
    expect(ugcSchema).not.toContain("title: Supplied script plan")
    expect(ugcSchema).toContain("title: Show captions")
    expect(ugcSchema).toContain("title: Show hook overlay")

    const social = await sourceFor("x-threads-generation")
    const socialSchema = social.slice(social.lastIndexOf("\nschema:\n"))
    expect(socialSchema).toContain("title: Reaction source (optional)")
    expect(socialSchema).toContain("title: Source text or transcript")
  })

  it("emits syntactically valid dynamic collection helper scripts", async () => {
    for (const workflowId of [
      "slideshow-generation",
      "ugc-video-generation",
      "react-reveal-generation",
      "greenscreen-meme-generation",
      "template-video-generation",
      "x-threads-generation",
    ] as const) {
      const source = await sourceFor(workflowId)
      const line = source
        .split("\n")
        .find((candidate) =>
          candidate.trimStart().startsWith("x-windmill-dyn-select-code:")
        )
      expect(line).toBeDefined()
      const code = JSON.parse(line!.slice(line!.indexOf(":") + 1).trim())
      expect(code).toContain("new TablesDB(client)")
      expect(code).toContain("templateOptions")
      expect(code).toContain('["templates", "automations"]')
      expect(code).toContain('["social_templates", "x_automations"]')
      if (
        workflowId === "ugc-video-generation" ||
        workflowId === "react-reveal-generation" ||
        workflowId === "greenscreen-meme-generation"
      ) {
        expect(code).toContain(
          'Query.equal("source_key", ["image_collection"])'
        )
        expect(code).toContain('["permanent_assets", "image_collections"]')
      }
      expect(code).not.toContain("wmill.runScript")
      const diagnostics =
        ts.transpileModule(code, {
          compilerOptions: { module: ts.ModuleKind.ESNext },
          reportDiagnostics: true,
        }).diagnostics ?? []
      expect(
        diagnostics.filter(
          (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
        )
      ).toEqual([])
    }
  })

  it("joins generic video copy and media only at renderer assembly", async () => {
    const source = await sourceFor("template-video-generation")

    expect(source).toContain("id: prepare_copy_and_media")
    expect(source).toContain("parallel: true")
    expect(source).toContain("id: generate_copy")
    expect(source).toContain("id: resolve_media")
    expect(source).toContain("id: assemble_components")
    expect(source).toContain(
      "copy: results.prepare_copy_and_media[0].output.copy"
    )
    expect(source).toContain(
      "resolvedMedia: results.prepare_copy_and_media[1].output.resolvedMedia"
    )
  })

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
