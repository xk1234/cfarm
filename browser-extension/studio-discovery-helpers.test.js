import { readFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"

import { describe, expect, it } from "vitest"

const helpers = loadHelpers()

describe("TikTok Studio post discovery helpers", () => {
  it("normalizes video and photo post links", () => {
    expect(
      helpers.parsePostUrl(
        "https://www.tiktok.com/@horoiq/video/7669076017918561554?lang=en"
      )
    ).toEqual({
      externalPostId: "7669076017918561554",
      releaseUrl: "https://www.tiktok.com/@horoiq/video/7669076017918561554",
      accountHandle: "horoiq",
    })
    expect(
      helpers.parsePostUrl(
        "https://www.tiktok.com/@horoiq/photo/7669076017918561555"
      )
    ).toMatchObject({
      externalPostId: "7669076017918561555",
      releaseUrl: "https://www.tiktok.com/@horoiq/photo/7669076017918561555",
    })
    expect(
      helpers.parsePostUrl(
        "https://example.com/@horoiq/video/7669076017918561554"
      )
    ).toBeNull()
  })

  it("adds the current year and rolls future Studio dates into last year", () => {
    const now = new Date("2026-01-02T12:00:00.000Z")
    expect(
      new Date(helpers.parseStudioDate("Jan 1, 5:19 PM", now)).getFullYear()
    ).toBe(2026)
    expect(
      new Date(helpers.parseStudioDate("Dec 31, 5:19 PM", now)).getFullYear()
    ).toBe(2025)
  })

  it("deduplicates virtualized rows while preserving caption and date", () => {
    const row = {
      textContent: "A useful caption Aug 2, 5:19 PM",
      parentElement: null,
    }
    const anchor = {
      href: "https://www.tiktok.com/@horoiq/video/7669076017918561554",
      textContent: "A useful caption",
      parentElement: row,
    }
    const documentRoot = {
      querySelectorAll: () => [anchor, anchor],
    }

    const posts = helpers.collectPosts(documentRoot)

    expect([...posts.values()]).toEqual([
      expect.objectContaining({
        externalPostId: "7669076017918561554",
        content: "A useful caption",
        publishedAt: expect.any(String),
      }),
    ])
  })
})

function loadHelpers() {
  const source = readFileSync(
    path.join(process.cwd(), "browser-extension/studio-discovery-helpers.js"),
    "utf8"
  )
  const context = vm.createContext({ URL })
  context.globalThis = context
  vm.runInContext(source, context)
  return context.LumenClipStudioDiscovery
}
