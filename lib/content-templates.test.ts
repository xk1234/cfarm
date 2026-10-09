import { describe, expect, it } from "vitest"

import { createLocalAutomationRecord } from "@/lib/automations"
import {
  contentTemplateFromMediaRecord,
  contentTemplateFromPostRecord,
} from "@/lib/content-templates"
import { defaultXAutomation } from "@/lib/x-automation"

describe("content template adapters", () => {
  it("exposes legacy slideshow and video definitions as templates", () => {
    const slideshow = contentTemplateFromMediaRecord(
      createLocalAutomationRecord({ name: "Carousel" })
    )
    const video = contentTemplateFromMediaRecord(
      createLocalAutomationRecord({ name: "Demo", automationKind: "video" })
    )

    expect(slideshow).toMatchObject({ name: "Carousel", kind: "slideshow" })
    expect(slideshow.editor.kind).toBe("slideshow")
    expect(video).toMatchObject({ name: "Demo", kind: "video" })
    expect(video.editor.kind).toBe("video")
  })

  it("exposes X and Threads definitions as text templates", () => {
    const post = contentTemplateFromPostRecord(
      defaultXAutomation({ name: "Astrology posts", platform: "threads" })
    )

    expect(post).toMatchObject({ name: "Astrology posts", kind: "text" })
    expect(post.editor.kind).toBe("text")
  })
})
