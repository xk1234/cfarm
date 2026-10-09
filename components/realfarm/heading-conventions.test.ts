import { readFileSync, readdirSync } from "node:fs"
import { extname, join } from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = process.cwd()
const appRoots = [
  join(projectRoot, "app", "app"),
  join(projectRoot, "components", "realfarm"),
]
const excludedFiles = new Set([
  join(projectRoot, "components", "realfarm", "public-slideshow-share.tsx"),
])

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return extname(path) === ".tsx" && !excludedFiles.has(path) ? [path] : []
  })
}

describe("in-app heading conventions", () => {
  it("does not support explanatory subtitles in the shared modal header", () => {
    const modalSource = readFileSync(
      join(projectRoot, "components", "ui", "modal.tsx"),
      "utf8"
    )

    expect(modalSource).not.toMatch(/description\??:/)
    expect(modalSource).not.toContain("Dialog.Description")
  })

  it("does not stack small uppercase kickers above app headings", () => {
    const offenders = appRoots
      .flatMap(tsxFiles)
      .filter((file) => {
        const source = readFileSync(file, "utf8")
        return /<(?:p|span|div)[^>]*className="[^"]*(?:uppercase|tracking-\[)[^"]*"[^>]*>[\s\S]{0,220}<h[12]\b/.test(
          source
        )
      })
      .map((file) => file.replace(`${projectRoot}/`, ""))

    expect(offenders).toEqual([])
  })
})
