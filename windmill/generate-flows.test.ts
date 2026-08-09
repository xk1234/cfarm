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
})
