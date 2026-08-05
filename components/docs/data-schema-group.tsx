import "server-only"

import { readFileSync } from "node:fs"
import path from "node:path"
import type { ReactNode } from "react"

const GROUPS = {
  persistence: {
    title: "Persistence and physical records",
    sections: [
      "permanent_assets",
      "outputs",
      "output_media",
      "Dedicated JSON-store row",
      "jobs",
      "workspace_members",
      "demos",
    ],
  },
  workspace: {
    title: "Workspace, collections, and assets",
    sections: [
      "RealFarmData",
      "LocalAsset",
      "MediaLibraryAsset",
      "StoredImageCollection",
      "WordCollectionRecord",
      "ProductCollection",
      "ProductCollectionItem",
      "AssetRecord",
    ],
  },
  automations: {
    title: "Automation definitions",
    sections: [
      "AutomationRecord",
      "AutomationSchema",
      "PromptFormatting",
      "ImageCollectionConfig",
      "AutomationSchedule",
      "AutomationHookItem",
      "AutomationFormatSection",
      "TextItem",
      "TikTokPostSettings",
      "AutomationVideoFormat and AutomationVideoSegment",
      "AutomationUgcConfig",
      "XAutomationRecord",
    ],
  },
  outputs: {
    title: "Generation runs and outputs",
    sections: [
      "AutomationRunRecord",
      "AutomationRunPlan",
      "ResultRecord",
      "ResultArtifacts",
      "SlideshowRecord",
      "SlideshowSettings",
      "GeneratedVideoExport",
      "XAutomationRun",
    ],
  },
  publishing: {
    title: "Publishing, calendar, and analytics",
    sections: [
      "PostFastSocialIntegration",
      "PostFastPostRecord",
      "CalendarItem",
      "PostFastMetricSnapshot",
      "TikTokStudioAnalytics",
      "AccountFollowerSnapshot",
    ],
  },
  operations: {
    title: "Operations and access",
    sections: ["Job", "UsageRecord", "WorkspaceMember", "DemoVideo"],
  },
} as const

export type DataSchemaGroupName = keyof typeof GROUPS

type SchemaRow = {
  field: string
  type: string
  required: string
  format: string
  description: string
}

type SchemaSection = {
  title: string
  rows: SchemaRow[]
}

export function DataSchemaGroup({ group }: { group: DataSchemaGroupName }) {
  const config = GROUPS[group]
  const sectionsByTitle = schemaSections()
  const sections = config.sections.map((title) => {
    const section = sectionsByTitle.get(title)
    if (!section) {
      throw new Error(`Data schema section ${title} is missing`)
    }
    return section
  })

  return (
    <div className="data-schema-group not-prose">
      <p className="mb-6 text-sm text-fd-muted-foreground">
        {config.title}. Optionality and accepted values are included in each
        field description.
      </p>
      {sections.map((section) => (
        <section key={section.title} className="mb-10 scroll-mt-24">
          <h2 className="mb-3 font-mono text-xl font-semibold text-fd-foreground">
            {section.title}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-fd-border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-fd-muted/70 text-fd-foreground">
                <tr>
                  <th className="w-[20%] border-b border-fd-border px-4 py-3 font-semibold">
                    Field
                  </th>
                  <th className="w-[22%] border-b border-fd-border px-4 py-3 font-semibold">
                    Type
                  </th>
                  <th className="w-[22%] border-b border-fd-border px-4 py-3 font-semibold">
                    Example
                  </th>
                  <th className="border-b border-fd-border px-4 py-3 font-semibold">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row.field} className="align-top even:bg-fd-muted/25">
                    <td className="border-b border-fd-border px-4 py-3 font-mono text-xs font-semibold text-fd-primary">
                      <InlineMarkdown value={row.field} />
                    </td>
                    <td className="border-b border-fd-border px-4 py-3 text-fd-foreground">
                      <InlineMarkdown value={row.type} />
                    </td>
                    <td className="border-b border-fd-border px-4 py-3">
                      <code className="text-xs break-words whitespace-normal">
                        {exampleFor(row)}
                      </code>
                    </td>
                    <td className="border-b border-fd-border px-4 py-3 leading-6 text-fd-muted-foreground">
                      {requiredDescription(row.required)}{" "}
                      <InlineMarkdown value={row.description} />
                      {shouldAppendFormat(row.format) ? (
                        <>
                          {" "}
                          Accepted format: <InlineMarkdown value={row.format} />
                          .
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

function schemaSections() {
  const source = readFileSync(
    path.join(process.cwd(), "docs/data/schema-reference.md"),
    "utf8"
  )
  const headings = Array.from(source.matchAll(/^###\s+(.+)$/gm))
  const sections = new Map<string, SchemaSection>()

  for (const [index, heading] of headings.entries()) {
    const title = stripCode(heading[1].trim())
    const start = (heading.index ?? 0) + heading[0].length
    const end = headings[index + 1]?.index ?? source.length
    const rows = parseFirstTable(source.slice(start, end))
    if (rows.length > 0) sections.set(title, { title, rows })
  }

  return sections
}

function parseFirstTable(section: string): SchemaRow[] {
  const lines = section.split("\n")
  const headerIndex = lines.findIndex((line) => /^\|\s*Field\s*\|/.test(line))
  if (headerIndex < 0) return []

  const headers = splitTableRow(lines[headerIndex]).map((value) =>
    value.toLowerCase()
  )
  const rows: SchemaRow[] = []
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith("|")) break
    const cells = splitTableRow(line)
    const value = (name: string, fallback = "") => {
      const index = headers.indexOf(name)
      return index >= 0 ? cells[index]?.trim() || fallback : fallback
    }
    rows.push({
      field: value("field"),
      type: value("type", value("storage type")),
      required: value("required", "No"),
      format: value("allowed values / format"),
      description: value("meaning"),
    })
  }
  return rows
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
}

function stripCode(value: string) {
  return value.replace(/`/g, "")
}

function requiredDescription(required: string) {
  if (required.trim().toLowerCase() === "yes") return "Required."
  if (required.trim().toLowerCase() === "no") return "Optional."
  return `Requiredness: ${stripCode(required)}.`
}

function shouldAppendFormat(format: string) {
  const value = format.trim().toLowerCase()
  return Boolean(value) && !["free string", "domain-specific"].includes(value)
}

function exampleFor(row: SchemaRow) {
  const field = stripCode(row.field).toLowerCase()
  const type = stripCode(row.type).toLowerCase()
  const format = stripCode(row.format)
  const enumValue = row.format.match(/`([^`]+)`/)?.[1]

  if (enumValue) return literalExample(enumValue, type)
  if (field.includes("timezone") || /iana timezone/i.test(format))
    return '"Asia/Singapore"'
  if (
    /created|updated|scheduled|published|imported|expires|timestamp|_at$/.test(
      field
    )
  )
    return '"2026-08-01T09:00:00.000Z"'
  if (field.includes("email")) return '"editor@example.com"'
  if (field.includes("url")) return '"https://example.com/item"'
  if (field.includes("path")) return '"assets/example.png"'
  if (field.includes("color")) return '"#6d28d9"'
  if (field === "id" || field.endsWith("id") || field.endsWith("_id"))
    return '"record-123"'
  if (type.includes("boolean")) return "true"
  if (type.includes("[]") || type.includes("array")) return "[]"
  if (
    type.includes("record") ||
    type.includes("object") ||
    /json object/i.test(format)
  )
    return '{ "key": "value" }'
  if (/integer|number|bytes/.test(type) || /integer|number/.test(format))
    return "1"
  if (/iso datetime/i.test(format)) return '"2026-08-01T09:00:00.000Z"'
  if (/url/i.test(format)) return '"https://example.com/item"'
  if (/json string array/i.test(format)) return '["example"]'
  if (/json/i.test(format)) return '{ "key": "value" }'
  return '"Example"'
}

function literalExample(value: string, type: string) {
  if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(value)) return value
  if (value.startsWith("[") || value.startsWith("{")) return value
  if (/integer|number|boolean/.test(type)) return value
  return JSON.stringify(value)
}

function InlineMarkdown({ value }: { value: string }) {
  const parts = value.split(/(`[^`]+`|<br\s*\/?\s*>)/gi)
  return parts.map((part, index): ReactNode => {
    if (/^<br/i.test(part)) return <br key={index} />
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }
    return part
  })
}
