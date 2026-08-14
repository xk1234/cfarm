import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const projectRoot = process.cwd()

function collectTsxFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name)
    if (entry.isDirectory()) return collectTsxFiles(filePath)
    return entry.isFile() && entry.name.endsWith(".tsx") ? [filePath] : []
  })
}

describe("in-app heading conventions", () => {
  it("keeps the shared modal header title-only", () => {
    const source = fs.readFileSync(
      path.join(projectRoot, "components/ui/modal.tsx"),
      "utf8"
    )

    expect(source).not.toMatch(/description\??:/)
    expect(source).not.toContain("Dialog.Description")
  })

  it("does not stack an uppercase eyebrow immediately above page or section headings", () => {
    const files = [
      ...collectTsxFiles(path.join(projectRoot, "app/app")),
      ...collectTsxFiles(path.join(projectRoot, "components/realfarm")),
      path.join(projectRoot, "components/x-automation-studio.tsx"),
    ].filter((filePath) => !filePath.endsWith("public-slideshow-share.tsx"))

    const violations = files.flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8")
      const eyebrowBeforeHeading =
        /<(?:div|p|span)[^>]*className="[^"]*(?:uppercase|tracking-\[[^\]]+\])[^"]*"[^>]*>[\s\S]{0,180}<\/\w+>\s*<h[12]\b/g

      return eyebrowBeforeHeading.test(source)
        ? [path.relative(projectRoot, filePath)]
        : []
    })

    expect(violations).toEqual([])
  })
})
