import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { VideoCopyFields } from "./video-copy-fields"

describe("VideoCopyFields", () => {
  it("shows title, description, and hashtags with one copy button each", () => {
    const markup = renderToStaticMarkup(
      <VideoCopyFields
        title="Three ways to improve your room"
        description="Small layout changes can make the room feel larger."
        hashtags="#interiordesign #hometips #smallspaces"
      />
    )

    expect(markup).toContain("Three ways to improve your room")
    expect(markup).toContain("Small layout changes")
    expect(markup).toContain("#interiordesign #hometips #smallspaces")
    expect(markup.match(/aria-label="Copy /g)).toHaveLength(3)
    expect(markup).toContain('aria-label="Copy title"')
    expect(markup).toContain('aria-label="Copy description"')
    expect(markup).toContain('aria-label="Copy hashtags"')
  })
})
