import { readFile } from "node:fs/promises"
import path from "node:path"
import vm from "node:vm"

import { describe, expect, it } from "vitest"

describe("extension Tumblr image capture", () => {
  it("registers popup UI and request interception permissions for Tumblr", async () => {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "extension", "manifest.json"), "utf8"))

    expect(manifest.permissions).toContain("webRequest")
    expect(manifest.permissions).toContain("storage")
    expect(manifest.action.default_popup).toBe("popup.html")
    expect(manifest.host_permissions).toContain("https://www.tumblr.com/*")
    expect(manifest.host_permissions).toContain("https://media.tumblr.com/*")
    expect(manifest.host_permissions).toContain("https://*.media.tumblr.com/*")
    expect(manifest.content_scripts[0].matches).not.toContain("https://www.tumblr.com/*")
  })

  it("filters intercepted image requests to Tumblr media URLs", async () => {
    const context = await loadBackgroundScriptContext()
    const capture = context.__cfarmTumblrRequestCapture

    expect(capture.isTumblrTabUrl("https://www.tumblr.com/bennibills/614505829124702209")).toBe(true)
    expect(capture.isTumblrImageUrl("https://64.media.tumblr.com/abc/photo.jpg")).toBe(true)
    expect(capture.isInterceptableImageUrl("https://64.media.tumblr.com/abc/photo_1280.jpg")).toBe(true)
    expect(capture.isInterceptableImageUrl("https://assets.tumblr.com/icon.svg")).toBe(false)
    expect(capture.normalizeInterceptedImageUrl("https://64.media.tumblr.com/abc/photo.jpg?width=500&name=small#x")).toBe("https://64.media.tumblr.com/abc/photo.jpg")
  })
})

describe("extension Twitter/X support", () => {
  it("registers the content script on x.com and twitter.com", async () => {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "extension", "manifest.json"), "utf8"))

    expect(manifest.host_permissions).toContain("https://x.com/*")
    expect(manifest.host_permissions).toContain("https://twitter.com/*")
    expect(manifest.content_scripts[0].matches).toContain("https://x.com/*")
    expect(manifest.content_scripts[0].matches).toContain("https://twitter.com/*")
  })

  it("detects x.com and twitter.com as the twitter platform", async () => {
    const platformFor = await loadPlatformFunction()

    expect(platformFor("x.com")).toBe("twitter")
    expect(platformFor("twitter.com")).toBe("twitter")
    expect(platformFor("mobile.twitter.com")).toBe("twitter")
  })

  it("builds a Twitter swipe payload from a status article", async () => {
    const context = await loadContentScriptContext()
    const tweet = makeTweetArticle(context)
    const payload = context.__buildPayload(tweet)

    expect(payload).toMatchObject({
      advertiser: "Jacob @jforjacob",
      platform: "twitter",
      source: "twitter",
      sourceUrl: "https://x.com/jforjacob/status/1937633268079210776",
      landingPageUrl: "https://x.com/jforjacob/status/1937633268079210776",
      title: "Building a useful AI workflow for extension testing.",
      caption: "Building a useful AI workflow for extension testing.",
      format: "image",
      mediaUrl: "https://pbs.twimg.com/media/example.jpg",
      mediaUrls: ["https://pbs.twimg.com/media/example.jpg"],
      uploaded_at: "2025-06-24T12:00:00.000Z",
      metadata: {
        Source: "Twitter/X",
        TweetURL: "https://x.com/jforjacob/status/1937633268079210776",
        PostType: "image",
      },
      stats: {
        Replies: "12",
        Reposts: "34",
        Likes: "560",
        Views: "12K",
      },
    })
  })

  it("detects logged-out X status articles by data tweet id", async () => {
    const context = await loadContentScriptContext()
    const tweet = makeTweetArticle(context)
    ;(context.document as { querySelectorAll: (selector: string) => unknown[] }).querySelectorAll = (selector: string) =>
      selector === 'article[data-testid="tweet"], article[role="article"], article[data-tweet-id]' ? [tweet] : []

    expect(context.__cardCandidates()).toHaveLength(1)
  })

  it("builds a clean payload from a logged-out X status article", async () => {
    const context = await loadContentScriptContext()
    const tweet = makeLoggedOutTweetArticle(context)
    const payload = context.__buildPayload(tweet)

    expect(payload).toMatchObject({
      advertiser: "Jacob @jforjacob",
      platform: "twitter",
      source: "twitter",
      sourceUrl: "https://x.com/jforjacob/status/1937633268079210776",
      title: "Dropshippers remain undefeated at advertising",
      caption: "Dropshippers remain undefeated at advertising",
      mediaUrl: "https://pbs.twimg.com/media/dropshippers.jpg",
      mediaUrls: ["https://pbs.twimg.com/media/dropshippers.jpg"],
      stats: {
        Views: "248.9K",
      },
    })
  })

  it("does not swipe profile images from Twitter text posts", async () => {
    const context = await loadContentScriptContext()
    const tweet = makeTwitterTextArticle(context)
    const payload = context.__buildPayload(tweet)

    expect(payload).toMatchObject({
      platform: "twitter",
      title: "Text-only post should not use the avatar as media.",
      caption: "Text-only post should not use the avatar as media.",
      format: "unknown",
      mediaUrls: [],
      metadata: {
        PostType: "text",
      },
    })
    expect(payload.mediaUrl).toBe("")
  })

  it("captures every Twitter tweetPhoto image for carousel tweets", async () => {
    const context = await loadContentScriptContext()
    const tweet = makeTwitterCarouselArticle(context)
    const payload = context.__buildPayload(tweet)

    expect(payload).toMatchObject({
      platform: "twitter",
      format: "carousel",
      mediaUrl: "https://pbs.twimg.com/media/first.jpg",
      mediaUrls: [
        "https://pbs.twimg.com/media/first.jpg",
        "https://pbs.twimg.com/media/second.jpg",
      ],
      metadata: {
        PostType: "carousel",
      },
    })
  })

  it("does not swipe Twitter article cover images as post media", async () => {
    const context = await loadContentScriptContext()
    const tweet = makeTwitterArticleCard(context)
    const payload = context.__buildPayload(tweet)

    expect(payload).toMatchObject({
      platform: "twitter",
      title: "The most profitable skill of the 21st century",
      caption: "The most profitable skill of the 21st century",
      format: "unknown",
      mediaUrls: [],
      metadata: {
        PostType: "article",
      },
    })
    expect(payload.mediaUrl).toBe("")
  })

  it("treats an already saved Twitter status as swiped even across x.com and twitter.com URLs", async () => {
    const context = await loadContentScriptContext()
    const tweet = makeTweetArticle(context)

    context.__setSwipedIndexForTests([
      {
        platform: "twitter",
        sourceUrl: "https://twitter.com/jforjacob/status/1937633268079210776?ref=home",
        metadata: {},
      },
    ])

    expect(context.__swipeCandidateKeys(tweet)).toContain("twitter:status:1937633268079210776")
    expect(context.__isAlreadySwiped(tweet)).toBe(true)
  })
})

describe("extension TikTok Creative Center trends support", () => {
  it("registers the content script on TikTok Creative Center trends pages", async () => {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "extension", "manifest.json"), "utf8"))

    expect(manifest.host_permissions).toContain("https://ads.tiktok.com/creative/creativeCenter/*")
    expect(manifest.content_scripts[0].matches).toContain("https://ads.tiktok.com/creative/creativeCenter/*")
  })

  it("builds a TikTok trends video swipe payload from a trend video card", async () => {
    const context = await loadContentScriptContext()
    context.location.hostname = "ads.tiktok.com"
    context.location.pathname = "/creative/creativeCenter/trends/video"
    context.location.href = "https://ads.tiktok.com/creative/creativeCenter/trends/video?locale=en&deviceType=pc&region=US&period=7"
    context.location.search = "?locale=en&deviceType=pc&region=US&period=7"
    const card = makeTikTokTrendVideoCard(context)
    ;(context.document as { querySelectorAll: (selector: string) => unknown[] }).querySelectorAll = (selector: string) =>
      selector === "button" ? [card.detailButton] : []

    expect(context.__cardCandidates()).toHaveLength(1)
    expect(context.__trendInsertionPoint(card)).toBe(card.videoArea)
    expect(context.__buildPayload(card)).toMatchObject({
      advertiser: "Emily",
      platform: "tiktok-creative",
      source: "tiktok-creative",
      sourceUrl: "https://ads.tiktok.com/creative/creativeCenter/trends/video?locale=en&deviceType=pc&region=US&period=7",
      title: "he’s loving it #loveisland @Kalshi",
      caption: "he’s loving it #loveisland @Kalshi",
      format: "video",
      cta: "View details",
      landingPageUrl: "https://ads.tiktok.com/creative/creativeCenter/trends/video?locale=en&deviceType=pc&region=US&period=7",
      mediaUrl: "https://p16-common-sign.tiktokcdn-us.com/top-video.avif",
      metadata: {
        Source: "TikTok Creative Center Trends",
        Region: "US",
        Period: "7",
        Followers: "1.2M followers",
      },
      stats: {
        "Video views": "51.9M",
      },
    })
  })

  it("scrapes TikTok trends View details modal stats", async () => {
    const context = await loadContentScriptContext()
    const modal = makeTikTokTrendDetailModal(context)
    const payload = context.__trendDetailPayload(modal)

    expect(payload).toMatchObject({
      sourceUrl: "https://www.tiktok.com/@shakira/video/7648370860759256350?region=us_ttp",
      landingPageUrl: "https://www.tiktok.com/@shakira/video/7648370860759256350?region=us_ttp",
      mediaUrl: "https://v16m-default.tiktokcdn-us.com/detail-video.mp4?mime_type=video_mp4",
      source_video_url: "https://v16m-default.tiktokcdn-us.com/detail-video.mp4?mime_type=video_mp4",
      caption: "Dai Dai in between takes 🎥🎬",
      time: 25,
      metadata: {
        "Detail Source": "TikTok Creative Center View details modal",
        "TikTok URL": "https://www.tiktok.com/@shakira/video/7648370860759256350?region=us_ttp",
        "Time period": "May 31, 2026 - Jun 30, 2026",
      },
      stats: {
        Followers: "50.3M",
        "Median views": "--",
        Engagement: "11.35%",
        "Video views": "92.1M",
        "Organic video views": "88.6M",
        "Engagement rate": "11.35%",
        "6-second video views": "50%-55%",
        Length: "25s",
      },
    })
  })

  it("clicks View details before saving a TikTok trends video swipe", async () => {
    const context = await loadContentScriptContext()
    context.location.hostname = "ads.tiktok.com"
    context.location.pathname = "/creative/creativeCenter/trends/video"
    context.location.href = "https://ads.tiktok.com/creative/creativeCenter/trends/video?locale=en&deviceType=pc&region=US&period=7"
    context.location.search = "?locale=en&deviceType=pc&region=US&period=7"
    const card = makeTikTokTrendVideoCard(context)
    const modal = makeTikTokTrendDetailModal(context)
    let detailOpened = false
    ;(card.detailButton as unknown as { click: () => void }).click = () => {
      detailOpened = true
    }
    ;(context.document as { body: unknown }).body = modal
    ;(context.document as { querySelector: (selector: string) => unknown }).querySelector = (selector: string) => {
      if (!detailOpened) return null
      if (selector === "a[href*='tiktok.com/@'][href*='/video/']") {
        return modal.querySelector("a[href*='tiktok.com/@'][href*='/video/']")
      }
      return null
    }

    const payload = await context.__buildSwipePayload(card)

    expect(detailOpened).toBe(true)
    expect(payload).toMatchObject({
      sourceUrl: "https://www.tiktok.com/@shakira/video/7648370860759256350?region=us_ttp",
      landingPageUrl: "https://www.tiktok.com/@shakira/video/7648370860759256350?region=us_ttp",
      mediaUrl: "https://v16m-default.tiktokcdn-us.com/detail-video.mp4?mime_type=video_mp4",
      source_video_url: "https://v16m-default.tiktokcdn-us.com/detail-video.mp4?mime_type=video_mp4",
      stats: {
        "Video views": "92.1M",
        Followers: "50.3M",
        Length: "25s",
      },
    })
  })

  it("injects only one swipe button per TikTok trends card across repeated scans", async () => {
    const context = await loadContentScriptContext()
    context.location.hostname = "ads.tiktok.com"
    context.location.pathname = "/creative/creativeCenter/trends/video"
    const firstCard = makeTikTokTrendVideoCard(context)
    const secondCard = makeTikTokTrendVideoCard(context)
    ;(context.document as { querySelectorAll: (selector: string) => unknown[] }).querySelectorAll = (selector: string) =>
      selector === "button" ? [firstCard.detailButton, secondCard.detailButton] : []

    expect(context.__injectTikTokTrendVideoButtons()).toBe(2)
    expect(context.__injectTikTokTrendVideoButtons()).toBe(0)
    expect(firstCard.getAttribute("data-cfarm-swipe-card")).toBe("true")
    expect(secondCard.getAttribute("data-cfarm-swipe-card")).toBe("true")
  })

  it("injects one swipe button per TikTok Shop seller inspiration video card", async () => {
    const context = await loadContentScriptContext()
    context.location.hostname = "seller-sg.tiktok.com"
    context.location.pathname = "/shoppable-videos/inspiration/videos"
    context.location.href = "https://seller-sg.tiktok.com/shoppable-videos/inspiration/videos?from=menu&scene_type=1"
    context.location.search = "?from=menu&scene_type=1"
    const list = makeTikTokSellerVideoList(context, [
      { id: "short_video_7658370122800844052_142-wrapper", title: "Luggage & Bags", plays: "37", likes: "0" },
      { id: "short_video_7658228645760109832_143-wrapper", title: "Womenswear & Underwear", plays: "1.2K", likes: "23" },
      { id: "short_video_7658193590434221333_144-wrapper", title: "Food & Beverages", plays: "27.6K", likes: "360" },
    ])
    ;(context.document as { querySelector: (selector: string) => unknown }).querySelector = (selector: string) =>
      selector === "[data-tid='short_video_inspiration.video-tab.video-list']" ? list : null

    expect(context.__cardCandidates()).toHaveLength(3)
    expect(context.__injectTikTokSellerInspirationVideoButtons()).toBe(3)
    expect(context.__injectTikTokSellerInspirationVideoButtons()).toBe(0)
    for (const card of list.cards) {
      expect(card.getAttribute("data-cfarm-swipe-card")).toBe("true")
    }
    expect(context.__buildPayload(list.cards[1])).toMatchObject({
      advertiser: "TikTok Shop Seller Center",
      platform: "tiktok-seller",
      source: "tiktok-seller",
      title: "Womenswear & Underwear",
      format: "video",
      mediaUrl: "https://p16-common-sign.tiktokcdn.com/short-video.jpg",
      metadata: {
        Source: "TikTok Shop Seller Center inspiration videos",
        VideoID: "7658228645760109832",
        Category: "Womenswear & Underwear",
      },
      stats: {
        Plays: "1.2K",
        Likes: "23",
      },
    })
  })

  it("does not inject TikTok Shop seller swipe buttons outside the inspiration videos page", async () => {
    const context = await loadContentScriptContext()
    context.location.hostname = "seller-sg.tiktok.com"
    context.location.pathname = "/homepage"
    context.location.href = "https://seller-sg.tiktok.com/homepage"
    const list = makeTikTokSellerVideoList(context, [
      { id: "short_video_7658370122800844052_142-wrapper", title: "Luggage & Bags", plays: "37", likes: "0" },
    ])
    ;(context.document as { querySelector: (selector: string) => unknown }).querySelector = (selector: string) =>
      selector === "[data-tid='short_video_inspiration.video-tab.video-list']" ? list : null

    expect(context.__cardCandidates()).toHaveLength(0)
    expect(context.__injectTikTokSellerInspirationVideoButtons()).toBe(0)
    expect(list.cards[0].getAttribute("data-cfarm-swipe-card")).toBe("")
  })

  it("does not inject a TikTok Shop seller swipe button for a video already in the swipe DB", async () => {
    const context = await loadContentScriptContext()
    context.location.hostname = "seller-sg.tiktok.com"
    context.location.pathname = "/shoppable-videos/inspiration/videos"
    context.location.href = "https://seller-sg.tiktok.com/shoppable-videos/inspiration/videos?from=menu&scene_type=1"
    const list = makeTikTokSellerVideoList(context, [
      { id: "short_video_7658370122800844052_142-wrapper", title: "Luggage & Bags", plays: "37", likes: "0" },
      { id: "short_video_7658228645760109832_143-wrapper", title: "Womenswear & Underwear", plays: "1.2K", likes: "23" },
      { id: "short_video_7658193590434221333_144-wrapper", title: "Food & Beverages", plays: "27.6K", likes: "360" },
    ])
    ;(context.document as { querySelector: (selector: string) => unknown }).querySelector = (selector: string) =>
      selector === "[data-tid='short_video_inspiration.video-tab.video-list']" ? list : null
    context.__setSwipedIndexForTests([
      {
        platform: "tiktok-seller",
        sourceUrl: "https://seller-sg.tiktok.com/shoppable-videos/inspiration/videos?from=menu&scene_type=1",
        metadata: { VideoID: "7658228645760109832" },
      },
    ])

    expect(context.__injectTikTokSellerInspirationVideoButtons()).toBe(2)
    expect(list.cards[0].querySelector("[data-cfarm-swipe='true']")).toBeTruthy()
    expect(list.cards[1].querySelector("[data-cfarm-swipe='true']")).toBeFalsy()
    expect(list.cards[2].querySelector("[data-cfarm-swipe='true']")).toBeTruthy()
  })
})

async function loadPlatformFunction() {
  const context = await loadContentScriptContext()
  return (hostname: string) => {
    context.location.hostname = hostname
    return context.__platform()
  }
}

async function loadContentScriptContext() {
  const source = await readFile(path.join(process.cwd(), "extension", "content.js"), "utf8")
  const context = {
    location: { hostname: "x.com", pathname: "/", href: "https://x.com/home", search: "" },
    window: {
      getComputedStyle: () => ({ backgroundImage: "none" }),
      requestAnimationFrame: (callback: () => void) => callback(),
    },
    document: {
      documentElement: {},
      body: { appendChild: () => undefined, querySelector: () => null },
      title: "X",
      createElement: () => {
        const attrs: Record<string, string> = {}
        return {
          dataset: {},
          disabled: false,
          textContent: "",
          type: "",
          className: "",
          setAttribute(name: string, value: string) {
            attrs[name] = value
          },
          getAttribute(name: string) {
            return attrs[name] ?? ""
          },
          hasAttribute(name: string) {
            return Object.hasOwn(attrs, name)
          },
          addEventListener() {},
        }
      },
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    HTMLElement: class HTMLElement {},
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    URL,
    URLSearchParams,
    MutationObserver: class MutationObserver {
      observe() {}
    },
    chrome: { runtime: { sendMessage: () => undefined } },
  }

  vm.runInNewContext(`${source}\nglobalThis.__platform = platform\nglobalThis.__buildPayload = buildPayload\nglobalThis.__buildSwipePayload = buildSwipePayload\nglobalThis.__cardCandidates = cardCandidates\nglobalThis.__injectTikTokTrendVideoButtons = injectTikTokTrendVideoButtons\nglobalThis.__injectTikTokSellerInspirationVideoButtons = injectTikTokSellerInspirationVideoButtons\nglobalThis.__trendInsertionPoint = tiktokTrendVideoInsertionPoint\nglobalThis.__trendDetailPayload = tiktokTrendVideoDetailPayload\nglobalThis.__isAlreadySwiped = isAlreadySwiped\nglobalThis.__swipeCandidateKeys = swipeCandidateKeys\nglobalThis.__setSwipedIndexForTests = (swipes) => { swipedIndex.keys = buildSwipedKeyIndex(swipes); swipedIndex.loaded = true; swipedIndex.unavailable = false; swipedIndex.loading = false }`, context)
  return context as typeof context & {
    __platform: () => string
    __buildPayload: (container: unknown) => Record<string, unknown>
    __buildSwipePayload: (container: unknown) => Promise<Record<string, unknown>>
    __cardCandidates: () => unknown[]
    __injectTikTokTrendVideoButtons: () => number
    __injectTikTokSellerInspirationVideoButtons: () => number
    __trendInsertionPoint: (container: unknown) => unknown
    __trendDetailPayload: (root: unknown) => Record<string, unknown>
    __isAlreadySwiped: (container: unknown) => boolean
    __swipeCandidateKeys: (container: unknown) => string[]
    __setSwipedIndexForTests: (swipes: Record<string, unknown>[]) => void
  }
}

async function loadBackgroundScriptContext() {
  const source = await readFile(path.join(process.cwd(), "extension", "background.js"), "utf8")
  const listeners: unknown[] = []
  const context = {
    chrome: {
      webRequest: { onCompleted: { addListener: (...args: unknown[]) => listeners.push(args) } },
      tabs: { onRemoved: { addListener: () => undefined } },
      runtime: {
        onMessage: { addListener: () => undefined },
        lastError: null,
      },
      storage: {
        session: {
          get: (_keys: string[], callback: (result: Record<string, unknown>) => void) => callback({}),
          set: (_value: Record<string, unknown>, callback: () => void) => callback(),
          remove: (_key: string, callback: () => void) => callback(),
        },
      },
    },
    URL,
    globalThis: {},
  }
  context.globalThis = context

  vm.runInNewContext(source, context)
  return context as typeof context & {
    __cfarmTumblrRequestCapture: {
      isTumblrTabUrl: (value: string) => boolean
      isTumblrImageUrl: (value: string) => boolean
      isInterceptableImageUrl: (value: string) => boolean
      normalizeInterceptedImageUrl: (value: string) => string
    }
  }
}

function makeTweetArticle(context: Awaited<ReturnType<typeof loadContentScriptContext>>) {
  class FakeElement extends context.HTMLElement {
    nodeType = 1
    childNodes: unknown[] = []
    style = {}
    currentSrc = ""
    src = ""
    naturalWidth = 0
    naturalHeight = 0
    width = 0
    height = 0

    constructor(
      private readonly selectorMap: Record<string, unknown[]> = {},
      private readonly attrs: Record<string, string> = {},
      childNodes: unknown[] = []
    ) {
      super()
      this.childNodes = childNodes
    }

    hasAttribute(name: string) {
      return Object.hasOwn(this.attrs, name)
    }

    getAttribute(name: string) {
      return this.attrs[name] ?? ""
    }

    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] ?? null
    }

    querySelectorAll(selector: string) {
      if (selector === "[data-cfarm-swipe='true']") {
        return this.childNodes.filter((child) => (child as { getAttribute?: (name: string) => string }).getAttribute?.("data-cfarm-swipe") === "true")
      }
      return this.selectorMap[selector] ?? []
    }

    closest() {
      return null
    }

    getBoundingClientRect() {
      return { width: this.width, height: this.height }
    }
  }

  const text = (value: string) => ({ nodeType: 3, nodeValue: value })
  const tweetText = new FakeElement({}, { "data-testid": "tweetText" }, [text("Building a useful AI workflow for extension testing.")])
  const userName = new FakeElement({}, { "data-testid": "User-Name" }, [text("Jacob @jforjacob")])
  const statusLink = new FakeElement({}, { href: "/jforjacob/status/1937633268079210776" })
  const timestamp = new FakeElement({}, { datetime: "2025-06-24T12:00:00.000Z" })
  const image = new FakeElement()
  image.currentSrc = "https://pbs.twimg.com/media/example.jpg"
  image.src = image.currentSrc
  image.naturalWidth = 1200
  image.naturalHeight = 900
  const mediaContainer = new FakeElement({ img: [image], "*": [image] }, { "data-testid": "tweetPhoto" })
  const stats = new FakeElement({}, { "aria-label": "12 replies 34 reposts 560 likes 12K views" })

  return new FakeElement(
    {
      '[data-testid="tweetText"]': [tweetText],
      '[data-testid="User-Name"]': [userName],
      '[data-testid="tweetPhoto"]': [mediaContainer],
      'a[href*="/status/"]': [statusLink],
      "time[datetime]": [timestamp],
      "[aria-label]": [stats],
      img: [image],
      "*": [tweetText, userName, statusLink, timestamp, image, stats],
    },
    {},
    [userName, tweetText, stats]
  )
}

function makeLoggedOutTweetArticle(context: Awaited<ReturnType<typeof loadContentScriptContext>>) {
  const article = makeTweetArticle(context) as ReturnType<typeof makeTweetArticle> & {
    currentSrc: string
    src: string
    naturalWidth: number
    naturalHeight: number
    childNodes: unknown[]
  }
  const text = (value: string) => ({ nodeType: 3, nodeValue: value })
  const statusLink = article.querySelector('a[href*="/status/"]')
  const image = article.querySelector("img") as typeof article
  const mediaContainer = article.querySelector('[data-testid="tweetPhoto"]')
  image.currentSrc = "https://pbs.twimg.com/media/dropshippers.jpg"
  image.src = image.currentSrc
  article.childNodes = [
    text("Jacob"),
    text("@jforjacob"),
    text("Dropshippers remain undefeated at advertising"),
    text("00:17"),
    text("10:05 PM · Jun 24, 2025"),
    text("248.9K"),
    text("Views"),
    text("Read 81 replies"),
  ]
  article.querySelectorAll = (selector: string) => {
    if (selector === 'a[href*="/status/"]') return statusLink ? [statusLink] : []
    if (selector === '[data-testid="tweetPhoto"]') return mediaContainer ? [mediaContainer] : []
    if (selector === "img") return [image]
    if (selector === "*") return [image]
    return []
  }
  return article
}

function makeTwitterTextArticle(context: Awaited<ReturnType<typeof loadContentScriptContext>>) {
  const article = makeTweetArticle(context)
  const text = (value: string) => ({ nodeType: 3, nodeValue: value })
  const statusLink = article.querySelector('a[href*="/status/"]')
  const tweetText = article.querySelector('[data-testid="tweetText"]')
  const userName = article.querySelector('[data-testid="User-Name"]')
  const avatar = article.querySelector("img") as ReturnType<typeof makeTweetArticle>
  avatar.currentSrc = "https://pbs.twimg.com/profile_images/avatar_normal.jpg"
  avatar.src = avatar.currentSrc
  article.childNodes = [
    text("Text User"),
    text("@textuser"),
    text("Text-only post should not use the avatar as media."),
  ]
  article.querySelectorAll = (selector: string) => {
    if (selector === '[data-testid="tweetText"]') return tweetText ? [tweetText] : []
    if (selector === '[data-testid="User-Name"]') return userName ? [userName] : []
    if (selector === 'a[href*="/status/"]') return statusLink ? [statusLink] : []
    if (selector === "img") return [avatar]
    if (selector === "*") return [avatar]
    return []
  }
  ;(tweetText as { childNodes: unknown[] }).childNodes = [text("Text-only post should not use the avatar as media.")]
  ;(userName as { childNodes: unknown[] }).childNodes = [text("Text User @textuser")]
  return article
}

function makeTwitterCarouselArticle(context: Awaited<ReturnType<typeof loadContentScriptContext>>) {
  const article = makeTweetArticle(context)
  const firstContainer = article.querySelector('[data-testid="tweetPhoto"]') as ReturnType<typeof makeTweetArticle>
  const firstImage = firstContainer.querySelector("img") as ReturnType<typeof makeTweetArticle>
  firstImage.currentSrc = "https://pbs.twimg.com/media/first.jpg"
  firstImage.src = firstImage.currentSrc
  const secondImage = Object.assign(Object.create(Object.getPrototypeOf(firstImage)), firstImage, {
    currentSrc: "https://pbs.twimg.com/media/second.jpg",
    src: "https://pbs.twimg.com/media/second.jpg",
  })
  const secondContainer = Object.assign(Object.create(Object.getPrototypeOf(firstContainer)), firstContainer)
  secondContainer.querySelectorAll = (selector: string) => selector === "img" || selector === "*" ? [secondImage] : []
  const originalQuerySelectorAll = article.querySelectorAll.bind(article)
  article.querySelectorAll = (selector: string) => {
    if (selector === '[data-testid="tweetPhoto"]') return [firstContainer, secondContainer]
    if (selector === "img") return [firstImage, secondImage]
    return originalQuerySelectorAll(selector)
  }
  return article
}

function makeTwitterArticleCard(context: Awaited<ReturnType<typeof loadContentScriptContext>>) {
  const article = makeTweetArticle(context)
  const text = (value: string) => ({ nodeType: 3, nodeValue: value })
  const statusLink = article.querySelector('a[href*="/status/"]')
  const userName = article.querySelector('[data-testid="User-Name"]')
  const articleCover = article.querySelector('[data-testid="tweetPhoto"]')
  const coverImage = article.querySelector("img") as ReturnType<typeof makeTweetArticle>
  coverImage.currentSrc = "https://pbs.twimg.com/media/article-cover.jpg"
  coverImage.src = coverImage.currentSrc
  article.childNodes = [
    text("Article User"),
    text("@articleuser"),
    text("The most profitable skill of the 21st century"),
  ]
  article.querySelectorAll = (selector: string) => {
    if (selector === '[data-testid="tweetText"]') return []
    if (selector === '[data-testid="User-Name"]') return userName ? [userName] : []
    if (selector === 'a[href*="/status/"]') return statusLink ? [statusLink] : []
    if (selector === '[data-testid="tweetPhoto"]') return []
    if (selector === '[data-testid="article-cover-image"]') return articleCover ? [articleCover] : []
    if (selector === "img") return [coverImage]
    if (selector === "*") return [coverImage]
    return []
  }
  ;(userName as { childNodes: unknown[] }).childNodes = [text("Article User @articleuser")]
  return article
}

function makeTikTokTrendVideoCard(context: Awaited<ReturnType<typeof loadContentScriptContext>>) {
  class FakeElement extends context.HTMLElement {
    nodeType = 1
    childNodes: unknown[] = []
    parentElement: FakeElement | null = null
    style = {}
    dataset: Record<string, string> = {}
    currentSrc = ""
    src = ""
    naturalWidth = 0
    naturalHeight = 0
    width = 0
    height = 0

    constructor(
      private readonly selectorMap: Record<string, unknown[]> = {},
      private readonly attrs: Record<string, string> = {},
      childNodes: unknown[] = [],
      private readonly text = "",
    ) {
      super()
      this.childNodes = childNodes
    }

    hasAttribute(name: string) {
      return Object.hasOwn(this.attrs, name)
    }

    setAttribute(name: string, value: string) {
      this.attrs[name] = value
    }

    getAttribute(name: string) {
      return this.attrs[name] ?? ""
    }

    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] ?? null
    }

    querySelectorAll(selector: string) {
      if (selector === "[data-cfarm-swipe='true']") {
        return this.childNodes.filter((child) => (child as { getAttribute?: (name: string) => string }).getAttribute?.("data-cfarm-swipe") === "true")
      }
      return this.selectorMap[selector] ?? []
    }

    appendChild(child: FakeElement) {
      child.parentElement = this
      this.childNodes.push(child)
      return child
    }

    insertAdjacentElement(_position: string, element: FakeElement) {
      element.parentElement = this.parentElement
      this.parentElement?.childNodes.push(element)
      return element
    }

    closest(selector: string) {
      if (selector === "header, nav, [id*='Header'], [class*='Header'], [class*='FixedHeader']") return null
      if (selector === "[class*='flex'][class*='h-[571px]'], [class*='min-w-[282px]']") return this.parentElement || this
      return null
    }

    getBoundingClientRect() {
      return { width: this.width, height: this.height }
    }
  }

  const text = (value: string) => ({ nodeType: 3, nodeValue: value })
  const creator = new FakeElement({}, {}, [text("Emily")])
  const followers = new FakeElement({}, {}, [text("1.2M followers")])
  const viewsLabel = new FakeElement({}, {}, [text("Video views")])
  const viewsValue = new FakeElement({}, {}, [text("51.9M")])
  const detailButton = new FakeElement({}, {}, [text("View details")])
  const image = new FakeElement({}, { alt: "he’s loving it #loveisland @Kalshi " })
  image.currentSrc = "https://p16-common-sign.tiktokcdn-us.com/top-video.avif"
  image.src = image.currentSrc
  image.naturalWidth = 720
  image.naturalHeight = 720
  const infoArea = new FakeElement({}, {}, [creator, followers, viewsLabel, viewsValue, detailButton])
  const videoArea = new FakeElement({}, {}, [image])
  const card = new FakeElement(
    {
      img: [image],
      "img,video": [image],
      "img[alt]": [image],
      video: [],
      "a[href],button": [detailButton],
      "a[href],button,[role='button']": [detailButton],
      "[class*='h-[421px]'][class*='overflow-hidden'], [class*='h-[421px]'][class*='rounded-[16px]']": [videoArea],
      "[class*='mt-24'][class*='flex'][class*='h-[126px]'], [class*='flex'][class*='h-[126px]']": [infoArea],
      "*": [creator, followers, viewsLabel, viewsValue, detailButton, image, videoArea, infoArea],
    },
    {},
    [
      text("he’s loving it #loveisland @Kalshi"),
      creator,
      followers,
      viewsLabel,
      viewsValue,
      detailButton,
    ],
  ) as FakeElement & { detailButton: FakeElement; videoArea: FakeElement }

  detailButton.parentElement = card
  infoArea.parentElement = card
  videoArea.parentElement = card
  card.detailButton = detailButton
  card.videoArea = videoArea
  return card
}

function makeTikTokSellerVideoList(
  context: Awaited<ReturnType<typeof loadContentScriptContext>>,
  items: { id: string; title: string; plays: string; likes: string }[],
) {
  class FakeElement extends context.HTMLElement {
    nodeType = 1
    childNodes: unknown[] = []
    parentElement: FakeElement | null = null
    style = {}
    currentSrc = ""
    src = ""
    naturalWidth = 0
    naturalHeight = 0
    width = 0
    height = 0
    id = ""

    constructor(
      private readonly selectorMap: Record<string, unknown[]> = {},
      private readonly attrs: Record<string, string> = {},
      childNodes: unknown[] = [],
    ) {
      super()
      this.childNodes = childNodes
    }

    hasAttribute(name: string) {
      return Object.hasOwn(this.attrs, name)
    }

    setAttribute(name: string, value: string) {
      this.attrs[name] = value
    }

    getAttribute(name: string) {
      return this.attrs[name] ?? ""
    }

    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] ?? null
    }

    querySelectorAll(selector: string) {
      if (selector === "[data-cfarm-swipe='true']") {
        return this.childNodes.filter((child) => (child as { getAttribute?: (name: string) => string }).getAttribute?.("data-cfarm-swipe") === "true")
      }
      return this.selectorMap[selector] ?? []
    }

    appendChild(child: FakeElement) {
      child.parentElement = this
      this.childNodes.push(child)
      return child
    }

    closest(selector: string) {
      if (selector === "header, nav, [id*='Header'], [class*='Header'], [class*='FixedHeader']") return null
      if (selector === "[data-tid='short_video_inspiration.video-tab.video-list']") {
        if (this.getAttribute("data-tid") === "short_video_inspiration.video-tab.video-list") return this
        let current = this.parentElement
        while (current) {
          if (current.getAttribute("data-tid") === "short_video_inspiration.video-tab.video-list") return current
          current = current.parentElement
        }
      }
      return null
    }

    getBoundingClientRect() {
      return { width: this.width, height: this.height }
    }
  }

  const text = (value: string) => ({ nodeType: 3, nodeValue: value })
  const list = new FakeElement({}, { "data-tid": "short_video_inspiration.video-tab.video-list" }) as FakeElement & {
    cards: FakeElement[]
  }
  const cards = items.map((item) => {
    const title = new FakeElement({}, {}, [text(item.title)])
    const plays = new FakeElement({}, {}, [text(item.plays)])
    const likes = new FakeElement({}, {}, [text(item.likes)])
    const image = new FakeElement({}, {})
    image.currentSrc = "https://p16-common-sign.tiktokcdn.com/short-video.jpg"
    image.src = image.currentSrc
    image.naturalWidth = 720
    image.naturalHeight = 1280
    image.width = 183
    image.height = 325
    const card = new FakeElement(
      {
        ".text-head-s, p": [title],
        p: [title, plays, likes],
        "img,video": [image],
        img: [image],
        video: [],
        "*": [title, plays, likes, image],
      },
      { "data-tid": "video-player" },
      [title, plays, likes, image],
    )
    card.id = item.id
    card.width = 183
    card.height = 325
    title.parentElement = card
    plays.parentElement = card
    likes.parentElement = card
    image.parentElement = card
    card.parentElement = list
    return card
  })
  list.cards = cards
  list.childNodes = cards
  list.querySelectorAll = (selector: string) => {
    if (selector === "[data-tid='video-player'], [id^='short_video_'][id$='-wrapper']") return cards
    return []
  }
  return list
}

function makeTikTokTrendDetailModal(context: Awaited<ReturnType<typeof loadContentScriptContext>>) {
  class FakeElement extends context.HTMLElement {
    nodeType = 1
    childNodes: unknown[] = []
    currentSrc = ""
    src = ""

    constructor(
      private readonly selectorMap: Record<string, unknown[]> = {},
      private readonly attrs: Record<string, string> = {},
      childNodes: unknown[] = [],
    ) {
      super()
      this.childNodes = childNodes
    }

    hasAttribute(name: string) {
      return Object.hasOwn(this.attrs, name)
    }

    getAttribute(name: string) {
      return this.attrs[name] ?? ""
    }

    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] ?? null
    }

    querySelectorAll(selector: string) {
      return this.selectorMap[selector] ?? []
    }

    closest() {
      return null
    }
  }

  const text = (value: string) => ({ nodeType: 3, nodeValue: value })
  const video = new FakeElement()
  video.currentSrc = "https://v16m-default.tiktokcdn-us.com/detail-video.mp4?mime_type=video_mp4"
  video.src = video.currentSrc
  const tiktokLink = new FakeElement({}, { href: "https://www.tiktok.com/@shakira/video/7648370860759256350?region=us_ttp" })
  const caption = new FakeElement({}, {}, [text("Dai Dai in between takes 🎥🎬 ")])
  const duration = new FakeElement({}, {}, [text("00:25")])
  const timePeriod = new FakeElement({}, {}, [text("Time period: May 31, 2026 - Jun 30, 2026")])

  const metricSection = (label: string, value: string) => {
    const valueNode = new FakeElement({}, {}, [text(value)])
    const labelNode = new FakeElement({}, {}, [text(label)])
    return new FakeElement({ ".titleLabel": [labelNode], div: [valueNode] }, {}, [valueNode, labelNode])
  }
  const metricRow = (label: string, value: string) => {
    const labelNode = new FakeElement({}, {}, [text(label)])
    const valueNode = new FakeElement({}, {}, [text(value)])
    return new FakeElement({ span: [labelNode, valueNode] }, {}, [labelNode, valueNode])
  }

  const sections = [
    metricSection("Followers", "50.3M"),
    metricSection("Median views", "--"),
    metricSection("Engagement", "11.35%"),
  ]
  const rows = [
    metricRow("Video views", "92.1M"),
    metricRow("Organic video views", "88.6M"),
    metricRow("Engagement rate", "11.35%"),
    metricRow("6-second video views", "50%-55%"),
  ]

  return new FakeElement(
    {
      "a[href*='tiktok.com/@'][href*='/video/']": [tiktokLink],
      video: [video],
      "[class*='multi-lines-ellipsis__container']": [caption],
      ".time-duration": [duration],
      section: sections,
      "[data-testid*='TopContentVideos-ModalContentInfo-7MJ2ft']": rows,
      "*": [video, tiktokLink, caption, duration, timePeriod, ...sections, ...rows],
    },
    {},
    [
      caption,
      duration,
      tiktokLink,
      timePeriod,
      ...sections,
      ...rows,
    ],
  )
}
