import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { getSocialProvider } from "@/lib/social/registry"

import { PlatformPreview, truncatePreviewText } from "./platform-preview"

describe("PlatformPreview", () => {
  it.each([
    ["x", "x"],
    ["twitter", "x"],
    ["instagram", "instagram"],
    ["tiktok", "tiktok"],
    ["linkedin", "linkedin"],
    ["threads", "threads"],
    ["facebook", "facebook"],
    ["youtube", "youtube"],
  ])("selects the dedicated %s preview", (platformKey, expectedLabel) => {
    const markup = renderToStaticMarkup(
      <PlatformPreview platformKey={platformKey} text="A launch update" />
    )
    expect(markup).toContain(`data-preview-platform="${expectedLabel}"`)
  })

  it("uses the registry limit to truncate preview copy", () => {
    const provider = getSocialProvider("x")!
    const text = "a".repeat(provider.limits.maxTextLength + 20)
    const markup = renderToStaticMarkup(
      <PlatformPreview platformKey="x" text={text} />
    )
    const truncated = truncatePreviewText(text, provider.limits.maxTextLength)

    expect(truncated).toHaveLength(provider.limits.maxTextLength)
    expect(markup).toContain(
      `${"a".repeat(provider.limits.maxTextLength - 1)}…`
    )
    expect(markup).not.toContain(text)
  })

  it("falls back for providers without a dedicated renderer", () => {
    const markup = renderToStaticMarkup(
      <PlatformPreview platformKey="bluesky" text="Fallback copy" />
    )
    expect(markup).toContain('data-preview-platform="bluesky"')
  })
})
