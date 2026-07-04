import { describe, expect, test } from "vitest"

import { toSwipeDisplayModel } from "./swipe-display-model"
import type { SwipeRecord } from "@/lib/swipes"

describe("toSwipeDisplayModel", () => {
  test("normalizes Facebook text walls into readable display fields", () => {
    const swipe: SwipeRecord = {
      id: "swipe-facebook",
      advertiser: "Nike",
      platform: "facebook",
      source: "facebook",
      sourceUrl: "https://www.facebook.com/ads/library/?q=nike",
      title: "Open Drop-down",
      caption:
        "ActiveLibrary ID: 1869276447125570Started running on 17 Mar 2026Platforms This ad has multiple versions Open Drop-down See ad detailsNikeSponsoredCelebra tu cumpleaños con Nike y obtén acceso a productos exclusivos, MSI, envío y devoluciones gratis el resto del año.ITUNES.APPLE.COMNikeDownload Nike: Shoes, Apparel, Stories by Nike, Inc on the App Store.Install Now",
      full_script_transcription: {
        speakers: [],
        full_text:
          "ActiveLibrary ID: 1869276447125570Started running on 17 Mar 2026Platforms This ad has multiple versions Open Drop-down See ad detailsNikeSponsoredCelebra tu cumpleaños con Nike y obtén acceso a productos exclusivos, MSI, envío y devoluciones gratis el resto del año.ITUNES.APPLE.COMNikeDownload Nike: Shoes, Apparel, Stories by Nike, Inc on the App Store.Install Now",
        pause_notes: [],
        emotional_tone_notes: [],
      },
      format: "carousel",
      cta: "Inspect Swipe",
      landingPageUrl: "https://apps.apple.com/app/nike",
      mediaUrl: "/api/swipes/assets/facebook.jpg",
      screenshotPath: "/api/swipes/assets/source.png",
      swipedAt: "2026-07-02T05:34:06.401Z",
      metadata: {
        Source: "facebook",
        URL: "https://www.facebook.com/ads/library/?q=nike",
      },
      stats: {
        Started:
          "17 Mar 2026Platforms This ad has multiple versions Open Drop-down See ad detailsNikeSponsoredCelebra tu cumpleaños con Nike y obtén acceso a productos exclusivos, MSI, envío y devoluciones gratis el resto del año.ITUNES.APPLE.COMNikeDownload Nike: Shoes, Apparel, Stories by Nike, Inc on the App Store.Install Now",
      },
      folder: "No Folder",
    }

    const model = toSwipeDisplayModel(swipe)

    expect(model.title).toBe("Nike")
    expect(model.caption).toContain("Celebra tu cumpleaños")
    expect(model.caption).not.toContain("NikeSponsored")
    expect(model.caption).not.toContain("Nike Sponsored")
    expect(model.caption.startsWith("Celebra")).toBe(true)
    expect(model.caption).not.toContain("ActiveLibrary ID")
    expect(model.caption).not.toContain("See ad detailsNikeSponsored")
    expect(model.transcript).toBeUndefined()
    expect(model.stats).toEqual(
      expect.arrayContaining([
        { label: "Library ID", value: "1869276447125570" },
        { label: "Started running on", value: "17 Mar 2026" },
        { label: "Platforms", value: "This ad has multiple versions" },
      ]),
    )
    expect(model.stats.some((entry) => entry.value.length > 180)).toBe(false)
  })

  test("removes Facebook loading and advertiser chrome before the body text", () => {
    const swipe: SwipeRecord = {
      id: "swipe-facebook-saving",
      advertiser: "Nike",
      platform: "facebook",
      source: "facebook",
      sourceUrl: "https://www.facebook.com/ads/library/?q=nike",
      title: "Sponsored",
      caption:
        "Active Library ID: 1249043200627555 Started running on 17 Mar 2026 Platforms This ad has multiple versions Open Drop-down See ad details Saving... Nike Sponsored Celebra tu cumpleaños con Nike y obtén acceso a productos exclusivos. PLAY.GOOGLE.COM Nike Unlock the latest from Nike & Jordan. Shop Now",
      format: "image",
      swipedAt: "2026-07-02T05:34:06.401Z",
      metadata: {},
      stats: {},
      folder: "No Folder",
    }

    const model = toSwipeDisplayModel(swipe)

    expect(model.title).toBe("Nike")
    expect(model.caption).toBe("Celebra tu cumpleaños con Nike y obtén acceso a productos exclusivos.")
    expect(model.caption).not.toContain("Saving")
    expect(model.caption).not.toContain("Nike Sponsored")
  })
})
