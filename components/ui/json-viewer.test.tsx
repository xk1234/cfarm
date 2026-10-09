import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { JsonViewer } from "./json-viewer"

describe("JsonViewer", () => {
  it("renders an accessible read-only JSON surface with copy control", () => {
    const html = renderToStaticMarkup(
      <JsonViewer
        label="Workflow input"
        value={{ hook: "Try this", durationSeconds: 30 }}
      />
    )

    expect(html).toContain('aria-label="Workflow input JSON viewer"')
    expect(html).toContain('aria-label="Copy Workflow input JSON"')
    expect(html).toContain(" JSON</span>")
    expect(html).not.toContain("<pre")
    expect(html).not.toContain("textarea")
  })
})
