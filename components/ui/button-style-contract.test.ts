import { describe, expect, test } from "vitest"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const roots = ["app", "components"]
const ignoredFiles = new Set([path.join("components", "ui", "button.tsx")])
const selectAllowedFiles = new Set([
  path.join("components", "ui", "form-controls.tsx"),
])
const fileInputAllowedFiles = new Set([
  path.join("components", "ui", "upload-dropzone.tsx"),
])
const oversizedHeadingAllowedFiles = new Set([
  path.join("components", "realfarm", "swipe-detail-page.tsx"),
])

const visualClassPatterns = [
  /^rounded(?:-|$|\[)/,
  /^bg-/,
  /^hover:bg-/,
  /^disabled:bg-/,
  /^border(?:-|$|\[)/,
  /^shadow(?:-|$|\[|$)/,
  /^h-(?:\d|\[)/,
  /^size-(?:\d|\[)/,
  /^px-/,
  /^py-/,
  /^p-(?:\d|\[)/,
  /^font-/,
  /^text-(?!left$|right$|center$|start$|end$)/,
]

const checkedComponents = ["Button", "SelectControl", "CheckedDropdownButton"]
const legacyActionStylePattern =
  /variant="(?:blueAction|indigoAction)"|#(?:2f7df1|2f80ed|3594ff|3197f4|4aa0ff|3f81c9|348fea)|bg-app-(?:blue|indigo)-action/i

describe("shared control styling contract", () => {
  test("shared control consumers do not override shared visual styling", () => {
    const violations = findControlVisualOverrides()

    expect(violations).toEqual([])
  })

  test("feature files use shared select controls instead of styled native selects", () => {
    const violations = findNativeSelectsOutsideSharedControls()

    expect(violations).toEqual([])
  })

  test("feature files use the shared upload dropzone instead of raw file inputs", () => {
    const violations = findFileInputsOutsideSharedUpload()

    expect(violations).toEqual([])
  })

  test("feature chrome uses the shared action token instead of legacy blue action styles", () => {
    const violations = findLegacyActionStyleOverrides()

    expect(violations).toEqual([])
  })

  test("page headings stay on the shared dashboard title scale", () => {
    const violations = findOversizedPageHeadings()

    expect(violations).toEqual([])
  })

  test("app modals expose outside-click dismissal", () => {
    const violations = findModalsWithoutOverlayClose()

    expect(violations).toEqual([])
  })

  test("custom dropdowns use a dismissable outside-click layer", () => {
    const violations = [
      path.join("components", "ui", "form-controls.tsx"),
      path.join("components", "realfarm", "calendar-analytics.tsx"),
      path.join("components", "realfarm", "characters", "characters-view.tsx"),
      path.join("components", "realfarm", "collections-view.tsx"),
    ].filter((relativePath) => {
      const source = readFileSync(
        path.join(process.cwd(), relativePath),
        "utf8"
      )
      return !source.includes("useDismissableLayer")
    })

    expect(violations).toEqual([])
  })
})

function findControlVisualOverrides() {
  const violations: string[] = []

  for (const filePath of collectFiles(process.cwd())) {
    const relativePath = path.relative(process.cwd(), filePath)
    if (ignoredFiles.has(relativePath)) {
      continue
    }

    const source = readFileSync(filePath, "utf8")
    for (const componentName of checkedComponents) {
      for (const tag of source.matchAll(
        new RegExp(`<${componentName}\\\\b[\\\\s\\\\S]*?(?:\\\\/>|>)`, "g")
      )) {
        const disallowedClasses = collectClassNames(tag[0]).filter(
          (classToken) =>
            visualClassPatterns.some((pattern) => pattern.test(classToken))
        )

        if (disallowedClasses.length > 0) {
          violations.push(`${relativePath}: ${disallowedClasses.join(" ")}`)
        }
      }
    }
  }

  return violations
}

function findNativeSelectsOutsideSharedControls() {
  const violations: string[] = []

  for (const filePath of collectFiles(process.cwd())) {
    const relativePath = path.relative(process.cwd(), filePath)
    if (selectAllowedFiles.has(relativePath)) {
      continue
    }

    const source = readFileSync(filePath, "utf8")
    if (/<select\b[\s\S]*?>/.test(source)) {
      violations.push(relativePath)
    }
  }

  return [...new Set(violations)]
}

function findFileInputsOutsideSharedUpload() {
  const violations: string[] = []

  for (const filePath of collectFiles(process.cwd())) {
    const relativePath = path.relative(process.cwd(), filePath)
    if (fileInputAllowedFiles.has(relativePath)) {
      continue
    }

    const source = readFileSync(filePath, "utf8")
    if (/type="file"/.test(source)) {
      violations.push(relativePath)
    }
  }

  return [...new Set(violations)]
}

function findLegacyActionStyleOverrides() {
  const violations: string[] = []

  for (const filePath of collectFiles(process.cwd())) {
    const relativePath = path.relative(process.cwd(), filePath)
    const source = readFileSync(filePath, "utf8")
    if (legacyActionStylePattern.test(source)) {
      violations.push(relativePath)
    }
  }

  return violations
}

function findOversizedPageHeadings() {
  const violations: string[] = []

  for (const filePath of collectFiles(process.cwd())) {
    const relativePath = path.relative(process.cwd(), filePath)
    if (oversizedHeadingAllowedFiles.has(relativePath)) {
      continue
    }

    const source = readFileSync(filePath, "utf8")
    for (const tag of source.matchAll(/<h1\b[\s\S]*?(?:<\/h1>|>)/g)) {
      if (/text-\[(?:2[8-9]|[3-9]\d)px\]/.test(tag[0])) {
        violations.push(relativePath)
      }
    }
  }

  return [...new Set(violations)]
}

function findModalsWithoutOverlayClose() {
  const violations: string[] = []

  for (const filePath of collectFiles(process.cwd())) {
    const relativePath = path.relative(process.cwd(), filePath)
    const source = readFileSync(filePath, "utf8")
    for (const tag of source.matchAll(/<AppModal\b[^>]*>/g)) {
      if (!/\bonClose=/.test(tag[0])) {
        violations.push(relativePath)
      }
    }
  }

  return [...new Set(violations)]
}

function collectClassNames(tag: string) {
  const classNames: string[] = []

  for (const match of tag.matchAll(/\bclassName="([^"]*)"/g)) {
    classNames.push(match[1])
  }

  for (const match of tag.matchAll(/\bclassName=\{cn\(([\s\S]*?)\)\}/g)) {
    for (const stringLiteral of match[1].matchAll(/["'`]([^"'`]*)["'`]/g)) {
      classNames.push(stringLiteral[1])
    }
  }

  return classNames.flatMap((className) =>
    className.split(/\s+/).filter(Boolean)
  )
}

function collectFiles(root: string) {
  const files: string[] = []

  for (const child of roots) {
    const childPath = path.join(root, child)
    if (!existsSync(childPath)) {
      continue
    }
    walk(childPath, files)
  }

  return files
}

function walk(currentPath: string, files: string[]) {
  const current = statSync(currentPath)
  if (current.isDirectory()) {
    for (const child of readdirSync(currentPath)) {
      walk(path.join(currentPath, child), files)
    }
    return
  }

  if (currentPath.endsWith(".tsx")) {
    files.push(currentPath)
  }
}
