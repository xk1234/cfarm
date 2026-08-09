import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

const flowFolders = [
  "slideshow_generation__flow",
  "ugc_video_generation__flow",
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

    expect(source).toContain("id: resolve_components")
    expect(source).toContain("type: branchall")
    expect(source).toContain("parallel: false")
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
})
