import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

const flowFolders = [
  "slideshow_generation__flow",
  "ugc_video_generation__flow",
  "react_reveal_generation__flow",
  "greenscreen_meme_generation__flow",
  "linkedin_generation__flow",
  "x_threads_generation__flow",
]

describe("generated Lumenclip Windmill flows", () => {
  for (const folder of flowFolders) {
    it(`${folder} embeds its stage boundary instead of exposing a helper script`, async () => {
      const source = await readFile(
        path.join(import.meta.dirname, "f", "lumenclip", folder, "flow.yaml"),
        "utf8"
      )

      expect(source).toContain("type: rawscript")
      expect(source).not.toContain("path: f/lumenclip/run_pipeline_stage")
    })
  }

  it("models UGC as typed components with an explicit media branch and joins", async () => {
    const source = await readFile(
      path.join(
        import.meta.dirname,
        "f",
        "lumenclip",
        "ugc_video_generation__flow",
        "flow.yaml"
      ),
      "utf8"
    )

    expect(source).toContain("id: resolve_input_groups")
    expect(source).toContain("id: resolve_components")
    expect(source).toContain("type: branchall")
    expect(source).toContain("parallel: true")
    expect(source).toContain("Product component — analyze facts")
    expect(source).toContain("Script component — hook, body, CTA and timing")
    expect(source).toContain("Performance join — actor motion plus voice")
    expect(source).toContain("Render join — performance, B-roll and styling")
    expect(source).toContain("template_id:")
    for (const component of [
      "product:",
      "script:",
      "actor:",
      "voice:",
      "broll:",
      "render:",
    ]) {
      expect(source).toContain(component)
    }
    expect(source).not.toContain("results.generate_script_plan?.output ??")
    expect(source).not.toContain("flow_input.input ??")
  })

  it("models slideshow hydration, text, visual selection, and assembly as explicit branches and joins", async () => {
    const source = await readFile(
      path.join(
        import.meta.dirname,
        "f",
        "lumenclip",
        "slideshow_generation__flow",
        "flow.yaml"
      ),
      "utf8"
    )

    expect(source).toContain("id: hydrate_inputs")
    expect(source).toContain("id: prepare_slide_artifacts")
    expect(source).toContain("parallel: true")
    expect(source).toContain("Text path — accepted slide copy")
    expect(source).toContain("Visual path — select slide images")
    expect(source).toContain("Join text and images into slide plan")
  })

  for (const [folder, primary, secondary, join] of [
    [
      "react_reveal_generation__flow",
      "anticipation",
      "reveal",
      "Join full anticipation and full reveal",
    ],
    [
      "greenscreen_meme_generation__flow",
      "meme",
      "background",
      "Join chroma-keyed meme, background and caption",
    ],
  ] as const) {
    it(`${folder} splits inputs and media before its format-specific join`, async () => {
      const source = await readFile(
        path.join(import.meta.dirname, "f", "lumenclip", folder, "flow.yaml"),
        "utf8"
      )

      expect(source).toContain("id: resolve_input_groups")
      expect(source).toContain("id: stage_media_components")
      expect(source).toContain("parallel: true")
      expect(source).toContain(`${primary} component`)
      expect(source).toContain(`${secondary} component`)
      expect(source).toContain(join)
    })
  }

  it("never emits cumulative result fallback chains", async () => {
    for (const folder of flowFolders) {
      const source = await readFile(
        path.join(import.meta.dirname, "f", "lumenclip", folder, "flow.yaml"),
        "utf8"
      )
      expect(source).not.toMatch(/results\.[^\n]+\?\?\s*results\./)
      expect(source).not.toContain("flow_input.input ??")
    }
  })

  it("splits LinkedIn and X/Threads run inputs before downstream generation", async () => {
    const linkedIn = await readFile(
      path.join(
        import.meta.dirname,
        "f",
        "lumenclip",
        "linkedin_generation__flow",
        "flow.yaml"
      ),
      "utf8"
    )
    const social = await readFile(
      path.join(
        import.meta.dirname,
        "f",
        "lumenclip",
        "x_threads_generation__flow",
        "flow.yaml"
      ),
      "utf8"
    )

    expect(linkedIn).toContain("Resolve independent LinkedIn input groups")
    expect(linkedIn).toContain("Audience and topic")
    expect(linkedIn).toContain("Voice and persona")
    expect(linkedIn).toContain("Batch controls")
    expect(social).toContain("Resolve independent X and Threads input groups")
    expect(social).toContain("Saved template reference")
    expect(social).toContain("Per-run content input")
    expect(social).toContain("source_candidate:")
  })
})
