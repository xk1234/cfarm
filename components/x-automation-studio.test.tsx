import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { XAutomationStudio } from "./x-automation-studio"

describe("XAutomationStudio", () => {
  it("provides a compact mobile workflow and a clear first action", () => {
    const markup = renderToStaticMarkup(
      <XAutomationStudio initialAutomations={[]} initialRuns={[]} />
    )

    expect(markup).toContain('aria-label="Template workflow"')
    expect(markup).toContain(">Setup</button>")
    expect(markup).toContain(">Draft</button>")
    expect(markup).toContain(">Preview</button>")
    expect(markup).toContain("Start here")
    expect(markup).toContain("New X")
    expect(markup).toContain("New Threads")
  })
})
