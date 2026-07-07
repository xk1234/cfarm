const CFARM_BUTTON_ATTR = "data-cfarm-swipe"
const CFARM_CARD_ATTR = "data-cfarm-swipe-card"
const CFARM_API_URL = "http://localhost:3000/api/swipes"
const swipedIndex = {
  loaded: false,
  loading: false,
  unavailable: false,
  keys: new Set(),
}

function platform() {
  const host = location.hostname
  const path = location.pathname

  if (host.includes("facebook.com")) return "facebook"
  if (host.includes("ads.tiktok.com")) return "tiktok-creative"
  if (host.includes("seller-sg.tiktok.com")) return "tiktok-seller"
  if (host.includes("tiktok.com")) return "tiktok"
  if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "twitter"
  if (host.includes("adstransparency.google.com") || path.includes("transparency")) return "google"
  return "unknown"
}

function platformLabel(value = platform()) {
  switch (value) {
    case "facebook":
      return "facebook"
    case "tiktok":
      return "tiktok"
    case "tiktok-creative":
      return "tiktok-creative"
    case "tiktok-seller":
      return "tiktok-seller"
    case "google":
      return "google"
    case "twitter":
      return "twitter"
    default:
      return "unknown"
  }
}

function textFrom(element, maxLength = 900) {
  if (!element) return ""
  return extractedText(element).slice(0, maxLength)
}

function fullTextFrom(element) {
  if (!element) return ""
  return extractedText(element)
}

function extractedText(element) {
  const parts = []

  function visit(node) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute?.(CFARM_BUTTON_ATTR)) {
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue || "")
      return
    }
    for (const child of node.childNodes || []) {
      visit(child)
    }
  }

  visit(element)
  return normalizeText(parts.join(" "))
}

function normalizeText(value) {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueElements(elements) {
  return Array.from(new Set(elements.filter((element) => element instanceof HTMLElement)))
}

function lastItem(items) {
  return items.length > 0 ? items[items.length - 1] : undefined
}

function cssBackgroundUrl(element) {
  if (!element) return ""
  const inlineValue = element.style?.backgroundImage || ""
  const computedValue = window.getComputedStyle(element).backgroundImage || ""
  const value = inlineValue !== "none" ? inlineValue : computedValue
  const match = value.match(/url\(["']?([^"')]+)["']?\)/)
  return match?.[1] || ""
}

function absoluteUrl(value) {
  if (!value) return ""
  try {
    return new URL(value, location.href).toString()
  } catch {
    return value
  }
}

function destinationUrlFrom(rawUrl) {
  const absolute = absoluteUrl(rawUrl)
  if (!absolute) return ""
  try {
    const url = new URL(absolute)
    const nested = url.searchParams.get("u") || url.searchParams.get("url") || url.searchParams.get("adurl")
    if (nested) return destinationUrlFrom(nested)
    if (url.protocol !== "http:" && url.protocol !== "https:") return ""
    return url.toString()
  } catch {
    return ""
  }
}

function isInternalPlatformUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname
    return /(^|\.)facebook\.com$|(^|\.)tiktok\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)google\.com$|(^|\.)googleadservices\.com$|(^|\.)doubleclick\.net$|(^|\.)ads\.tiktok\.com$|(^|\.)adstransparency\.google\.com$/.test(host)
  } catch {
    return true
  }
}

function bestLandingPageUrl(container) {
  const links = Array.from(container.querySelectorAll("a[href]"))
    .map((link) => destinationUrlFrom(link.getAttribute("href") || ""))
    .filter(Boolean)
    .filter((url) => !isInternalPlatformUrl(url))

  return links.find((url) => /apps\.apple\.com|play\.google\.com|shop|store|buy|product|checkout/i.test(url)) || links[0] || ""
}

function bestImage(container) {
  const imageCandidates = Array.from(container.querySelectorAll("img"))
    .map((image) => ({
      src: image.currentSrc || image.src,
      area: (image.naturalWidth || image.width || 0) * (image.naturalHeight || image.height || 0),
    }))
  const backgroundCandidates = Array.from(container.querySelectorAll("*"))
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        src: cssBackgroundUrl(element),
        area: Math.max(0, rect.width) * Math.max(0, rect.height),
      }
    })

  return [...imageCandidates, ...backgroundCandidates]
    .filter((image) => image.src && !image.src.startsWith("data:"))
    .sort((a, b) => b.area - a.area)[0]?.src || ""
}

function bestVideo(container) {
  const video = container.querySelector("video")
  if (!video) return ""
  return video.currentSrc || video.src || video.poster || ""
}

function inferFormat(container) {
  if (container.querySelector("video")) return "video"
  if (platform() === "tiktok-creative" && container.querySelector("[class*='TopadsVideoCard_cardVideo'], [class*='TopadsVideoCard_playButton']")) return "video"
  if (container.querySelectorAll("img").length > 1) return "carousel"
  if (container.querySelector("img")) return "image"
  if (bestImage(container)) return "image"
  return "unknown"
}

function isTikTokTopAdsCard(element) {
  if (!(element instanceof HTMLElement)) return false
  if (element.closest("header, nav, [id*='Header'], [class*='Header'], [class*='FixedHeader']")) return false
  return Boolean(
    element.querySelector("[class*='TopadsVideoCard_cardVideo'], [class*='TopadsVideoCard_cardInfo'], a[href*='/business/creativecenter/topads/']")
  )
}

function tiktokTopAdsCardCandidates() {
  const cards = Array.from(document.querySelectorAll("[class*='TopadsVideoCard_card'], [class*='TopadsList_cardWrapper'], [class*='CommonGridLayoutDataList_cardWrapper']"))
    .map((element) => element.closest("[class*='TopadsList_cardWrapper'], [class*='CommonGridLayoutDataList_cardWrapper']") || element)
    .filter(isTikTokTopAdsCard)

  return uniqueElements(cards).slice(0, 80)
}

function isTikTokTrendVideoPage() {
  return location.hostname.includes("ads.tiktok.com") && location.pathname.toLowerCase().includes("/creative/creativecenter/trends/video")
}

function isTikTokSellerInspirationVideoPage() {
  return location.hostname.includes("seller-sg.tiktok.com") && location.pathname.toLowerCase().includes("/shoppable-videos/inspiration/videos")
}

function isTikTokTrendVideoCard(element) {
  if (!(element instanceof HTMLElement)) return false
  if (element.closest("header, nav, [id*='Header'], [class*='Header'], [class*='FixedHeader']")) return false
  const detailControls = Array.from(element.querySelectorAll("a[href],button,[role='button']"))
    .filter((control) => textFrom(control, 80) === "View details")
  if (detailControls.length !== 1) return false
  const text = fullTextFrom(element)
  return /Video views/i.test(text) && /followers/i.test(text) && /View details/i.test(text) && Boolean(element.querySelector("img,video"))
}

function tiktokTrendVideoCardCandidates() {
  const cards = Array.from(document.querySelectorAll("button"))
    .filter((element) => textFrom(element, 80) === "View details")
    .map(findTikTokTrendVideoCard)
    .filter(Boolean)

  return uniqueElements(cards).slice(0, 120)
}

function isTikTokSellerInspirationVideoCard(element) {
  if (!(element instanceof HTMLElement)) return false
  if (element.closest("header, nav, [id*='Header'], [class*='Header'], [class*='FixedHeader']")) return false
  const isVideoPlayer = element.getAttribute?.("data-tid") === "video-player" || /^short_video_.+-wrapper$/.test(element.id || "")
  if (!isVideoPlayer) return false
  if (!element.closest?.("[data-tid='short_video_inspiration.video-tab.video-list']")) return false
  return Boolean(element.querySelector("img,video"))
}

function tiktokSellerInspirationVideoCardCandidates() {
  if (!isTikTokSellerInspirationVideoPage()) return []
  const list = document.querySelector("[data-tid='short_video_inspiration.video-tab.video-list']")
  if (!list) return []
  const cards = Array.from(list.querySelectorAll("[data-tid='video-player'], [id^='short_video_'][id$='-wrapper']"))
    .filter(isTikTokSellerInspirationVideoCard)

  return uniqueElements(cards).slice(0, 120)
}

function findTikTokTrendVideoCard(detailsControl) {
  let current = detailsControl

  while (current && current !== document.body && current instanceof HTMLElement) {
    if (isTikTokTrendVideoCard(current)) {
      return current
    }
    current = current.parentElement
  }

  return null
}

function isTikTokPostUrl(value) {
  return /^https:\/\/www\.tiktok\.com\/@[^/]+\/(?:video|photo)\/\d+/.test(value)
}

function tiktokPostLink(container) {
  return Array.from(container.querySelectorAll("a[href]"))
    .map((link) => absoluteUrl(link.getAttribute("href") || ""))
    .find(isTikTokPostUrl) || ""
}

function tiktokPostCards() {
  const cards = Array.from(document.querySelectorAll("[data-e2e='user-post-item']"))
    .map((element) => element.closest("[id^='grid-item-container-']") || element)
    .filter((element) => element instanceof HTMLElement)
    .filter((element) => tiktokPostLink(element))

  return uniqueElements(cards).slice(0, 120)
}

function tiktokPostCaption(container) {
  const imageAlt = Array.from(container.querySelectorAll("img[alt]"))
    .map((image) => cleanAltText(image.getAttribute("alt") || ""))
    .find(Boolean)

  return imageAlt || textFrom(container, 900)
}

function tiktokUsernameFromUrl(value) {
  try {
    const match = new URL(value).pathname.match(/^\/(@[^/]+)/)
    return match?.[1] || ""
  } catch {
    return ""
  }
}

function cleanAltText(value) {
  return value.replace(/\s+created by\s+.+$/i, "").replace(/\s+/g, " ").trim()
}

function tiktokPostPayload(container) {
  const sourceUrl = tiktokPostLink(container) || location.href
  const caption = tiktokPostCaption(container)
  const format = sourceUrl.includes("/photo/") ? "carousel" : sourceUrl.includes("/video/") ? "video" : inferFormat(container)
  const title = caption.slice(0, 90) || document.title
  const mediaUrl = bestVideo(container) || bestImage(container)
  const views = textFrom(container.querySelector("[data-e2e='video-views']"), 40)

  return {
    advertiser: tiktokUsernameFromUrl(sourceUrl) || document.title.split("|")[0].trim() || "tiktok",
    platform: "tiktok",
    source: "tiktok",
    sourceUrl,
    title,
    caption,
    format,
    cta: "Inspect Swipe",
    landingPageUrl: sourceUrl,
    mediaUrl,
    metadata: {
      Source: "tiktok",
      URL: location.href,
      PostURL: sourceUrl,
    },
    stats: views ? { Views: views } : {},
    folder: "No Folder",
  }
}

function twitterCardCandidates() {
  return uniqueElements(
    Array.from(document.querySelectorAll('article[data-testid="tweet"], article[role="article"], article[data-tweet-id]'))
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => !element.closest("header, nav, aside"))
      .filter((element) => textFrom(element, 240).length > 20 || element.querySelector("img,video"))
  ).slice(0, 80)
}

function twitterStatusUrl(container) {
  return Array.from(container.querySelectorAll('a[href*="/status/"]'))
    .map((link) => absoluteUrl(link.getAttribute("href") || ""))
    .find(Boolean) || ""
}

function twitterPayload(container) {
  const lines = twitterVisibleLines(container)
  const tweetText = textFrom(container.querySelector('[data-testid="tweetText"]'), 900) || twitterArticleText(container, lines) || twitterTextFromLines(lines)
  const userBlock = textFrom(container.querySelector('[data-testid="User-Name"]'), 180) || twitterUserFromLines(lines)
  const tweetUrl = twitterStatusUrl(container) || location.href
  const mediaUrls = twitterTweetMediaUrls(container)
  const videoUrl = bestVideo(container)
  const mediaUrl = videoUrl || mediaUrls[0] || ""
  const timestamp = container.querySelector("time[datetime]")?.getAttribute("datetime") || ""
  const promoted = /promoted/i.test(textFrom(container, 1200))
  const postType = twitterPostType(container, mediaUrl, mediaUrls)
  const format = postType === "video" || postType === "carousel" || postType === "image"
    ? postType
    : "unknown"

  return {
    advertiser: userBlock || "Twitter/X",
    platform: "twitter",
    source: "twitter",
    sourceUrl: tweetUrl,
    title: tweetText.slice(0, 90) || userBlock || "Twitter/X post",
    caption: tweetText || textFrom(container, 900),
    format,
    cta: "Inspect Swipe",
    landingPageUrl: tweetUrl,
    mediaUrl,
    mediaUrls,
    uploaded_at: timestamp,
    metadata: {
      Source: "Twitter/X",
      URL: location.href,
      TweetURL: tweetUrl,
      Promoted: promoted ? "true" : "false",
      PostType: postType,
    },
    stats: inferTwitterStats(container, lines),
    folder: "No Folder",
  }
}

function twitterTweetMediaUrls(container) {
  return uniqueValues(
    Array.from(container.querySelectorAll('[data-testid="tweetPhoto"]'))
      .flatMap((photo) => [
        ...Array.from(photo.querySelectorAll?.("img") || []).map((image) => image.currentSrc || image.src),
        cssBackgroundUrl(photo),
        ...Array.from(photo.querySelectorAll?.("*") || []).map(cssBackgroundUrl),
      ])
      .map(normalizeText)
      .filter((url) => /^https?:\/\/pbs\.twimg\.com\/media\//i.test(url))
  )
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function ensureSwipedIndexReady() {
  if (swipedIndex.loaded || swipedIndex.unavailable) return true
  if (swipedIndex.loading) return false
  if (typeof fetch !== "function") {
    swipedIndex.unavailable = true
    return true
  }

  swipedIndex.loading = true
  fetch(CFARM_API_URL, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Failed to load swipes")))
    .then((payload) => {
      swipedIndex.keys = buildSwipedKeyIndex(Array.isArray(payload?.swipes) ? payload.swipes : [])
      swipedIndex.loaded = true
    })
    .catch(() => {
      swipedIndex.unavailable = true
    })
    .finally(() => {
      swipedIndex.loading = false
      window.requestAnimationFrame(injectButtons)
    })

  return false
}

function buildSwipedKeyIndex(swipes) {
  const keys = new Set()
  for (const swipe of swipes) {
    for (const key of swipeKeys(swipe)) {
      keys.add(key)
    }
  }
  return keys
}

function markPayloadSwiped(payload) {
  for (const key of swipeKeys(payload)) {
    swipedIndex.keys.add(key)
  }
  swipedIndex.loaded = true
}

function isAlreadySwiped(container) {
  if (!swipedIndex.loaded) return false
  return swipeCandidateKeys(container).some((key) => swipedIndex.keys.has(key))
}

function swipeCandidateKeys(container) {
  const currentPlatform = platform()
  if (currentPlatform === "twitter") {
    return swipeKeys({ platform: "twitter", sourceUrl: twitterStatusUrl(container), metadata: { TweetURL: twitterStatusUrl(container) } })
  }
  if (currentPlatform === "tiktok" && tiktokPostLink(container)) {
    return swipeKeys({ platform: "tiktok", sourceUrl: tiktokPostLink(container), metadata: { PostURL: tiktokPostLink(container) } })
  }
  if (currentPlatform === "tiktok-seller" && isTikTokSellerInspirationVideoCard(container)) {
    return swipeKeys({ platform: "tiktok-seller", metadata: { VideoID: tiktokSellerVideoId(container) } })
  }
  if (currentPlatform === "tiktok-creative" && isTikTokTopAdsCard(container)) {
    const href = container.querySelector("a[href*='/business/creativecenter/topads/']")?.getAttribute("href") || ""
    return swipeKeys({ platform: "tiktok-creative", sourceUrl: absoluteUrl(href) })
  }
  if (currentPlatform === "facebook") {
    return swipeKeys({ platform: "facebook", metadata: { LibraryID: facebookLibraryId(container) } })
  }
  return swipeKeys(buildPayload(container))
}

function swipeKeys(value) {
  const keys = new Set()
  const platformValue = normalizeText(value?.platform || value?.source || platform()).toLowerCase()
  const metadata = value?.metadata || {}

  addCanonicalUrlKey(keys, value?.sourceUrl, platformValue)
  addCanonicalUrlKey(keys, value?.landingPageUrl, platformValue)
  addCanonicalUrlKey(keys, metadata.TweetURL, platformValue)
  addCanonicalUrlKey(keys, metadata.PostURL, platformValue)
  addCanonicalUrlKey(keys, metadata.URL, platformValue)

  const sellerVideoId = normalizeText(metadata.VideoID || metadata.videoId || metadata["Video ID"] || "")
  if (sellerVideoId) keys.add(`tiktok-seller:video:${sellerVideoId}`)

  const libraryId = normalizeText(metadata.LibraryID || metadata["Library ID"] || facebookLibraryIdFromText(`${value?.caption || ""} ${value?.title || ""}`) || "")
  if (libraryId) keys.add(`facebook:library:${libraryId}`)

  return Array.from(keys)
}

function addCanonicalUrlKey(keys, rawUrl, platformValue) {
  const canonical = canonicalSwipeUrlKey(rawUrl, platformValue)
  if (canonical) keys.add(canonical)
}

function canonicalSwipeUrlKey(rawUrl, platformValue = platform()) {
  const urlText = typeof rawUrl === "string" ? normalizeText(rawUrl) : ""
  if (!urlText) return ""

  try {
    const url = new URL(urlText, location.href)
    const host = url.hostname.replace(/^www\./, "")
    const twitterStatus = url.pathname.match(/^\/[^/]+\/status\/(\d+)/)
    if ((host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com")) && twitterStatus?.[1]) {
      return `twitter:status:${twitterStatus[1]}`
    }

    const tiktokPost = url.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d+)/)
    if (host.endsWith("tiktok.com") && tiktokPost?.[1]) {
      return `tiktok:post:${tiktokPost[1]}`
    }

    const topAds = url.pathname.match(/\/business\/creativecenter\/topads\/(?:pc\/)?[^/?#]+/)
    if (host === "ads.tiktok.com" && topAds?.[0]) {
      return `tiktok-creative:url:${host}${topAds[0]}`
    }

    url.hash = ""
    if (platformValue === "twitter") {
      url.search = ""
    }
    return `${platformValue || "unknown"}:url:${url.origin}${url.pathname}${url.search}`
  } catch {
    return `${platformValue || "unknown"}:url:${urlText}`
  }
}

function facebookLibraryId(element) {
  return facebookLibraryIdFromText(fullTextFrom(element))
}

function facebookLibraryIdFromText(value) {
  return normalizeText(value).match(/Library ID:?\s*(\d+)/i)?.[1] || ""
}

function twitterPostType(container, mediaUrl, mediaUrls) {
  if (container.querySelector("video")) return "video"
  if (mediaUrls.length > 1) return "carousel"
  if (mediaUrl) return "image"
  if (container.querySelector('[data-testid="article-cover-image"]')) return "article"
  return "text"
}

function twitterArticleText(container, lines = twitterVisibleLines(container)) {
  if (!container.querySelector('[data-testid="article-cover-image"]')) {
    return ""
  }

  const userBlock = textFrom(container.querySelector('[data-testid="User-Name"]'), 180)
  const userTokens = new Set(
    userBlock
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  )
  const contentLines = lines
    .map(normalizeText)
    .filter(Boolean)
    .filter((line) => line !== "Article")
    .filter((line) => !/^@[\w-]+$/.test(line))
    .filter((line) => !twitterMetadataLine(line))
    .filter((line) => !/^(grok actions|more|share post|bookmark)$/i.test(line))
    .filter((line) => line !== userBlock && !userBlock.includes(line))
    .filter((line) => !userTokens.has(line))
    .filter((line) => !/^translated from /i.test(line))
    .filter((line) => !/^show original$/i.test(line))

  return uniqueValues(contentLines).join("\n").slice(0, 1200)
}

function twitterVisibleLines(container) {
  const raw = typeof container.innerText === "string" ? container.innerText : ""
  const lines = raw
    ? raw.split(/\n+/)
    : Array.from(container.childNodes || []).map((node) => node.nodeType === Node.TEXT_NODE ? node.nodeValue || "" : textFrom(node, 300))

  return lines.map(normalizeText).filter(Boolean).filter((line) => line !== "Post")
}

function twitterUserFromLines(lines) {
  const handleIndex = lines.findIndex((line) => /^@[\w-]+$/.test(line))
  if (handleIndex > 0) {
    return `${lines[handleIndex - 1]} ${lines[handleIndex]}`.trim()
  }
  return ""
}

function twitterTextFromLines(lines) {
  const handleIndex = lines.findIndex((line) => /^@[\w-]+$/.test(line))
  if (handleIndex >= 0) {
    return lines.slice(handleIndex + 1).find((line) => !twitterMetadataLine(line)) || ""
  }
  return lines.find((line) => !twitterMetadataLine(line) && !/^@[\w-]+$/.test(line)) || ""
}

function twitterMetadataLine(line) {
  return /^\d{1,2}:\d{2}$/.test(line) ||
    /\b\d{1,2}:\d{2}\s+[AP]M\b/.test(line) ||
    /^\d[\d,.]*[KMB]?$/.test(line) ||
    /^(views?|read\s+\d+|repl(?:y|ies)|reposts?|likes?)\b/i.test(line)
}

function inferTwitterStats(container, lines = twitterVisibleLines(container)) {
  const stats = {}
  const labelText = Array.from(container.querySelectorAll("[aria-label]"))
    .map((node) => node.getAttribute("aria-label") || "")
    .join(" ")

  const patterns = [
    ["Replies", /(\d[\d,.]*[KMB]?)\s+repl/i],
    ["Reposts", /(\d[\d,.]*[KMB]?)\s+repost/i],
    ["Likes", /(\d[\d,.]*[KMB]?)\s+like/i],
    ["Views", /(\d[\d,.]*[KMB]?)\s+view/i],
  ]

  for (const [label, pattern] of patterns) {
    const match = labelText.match(pattern)
    if (match?.[1]) stats[label] = match[1]
  }

  const viewIndex = lines.findIndex((line) => /^views?$/i.test(line))
  if (!stats.Views && viewIndex > 0 && /^\d[\d,.]*[KMB]?$/.test(lines[viewIndex - 1])) {
    stats.Views = lines[viewIndex - 1]
  }

  return stats
}

function metaLibraryIdCount(element) {
  return fullTextFrom(element).match(/Library ID:\s*\d+/g)?.length || 0
}

function hasMetaCreativeContent(element) {
  return Boolean(
    /Sponsored/i.test(fullTextFrom(element)) ||
      element.querySelector("[data-testid*='ad-content-body'], video, img, a[href*='l.facebook.com/l.php']")
  )
}

function isMetaSeeAdDetailsControl(element) {
  return textFrom(element, 80) === "See ad details"
}

function metaSeeAdDetailsControls() {
  return Array.from(document.querySelectorAll("[role='button'], button, a"))
    .filter((element) => element instanceof HTMLElement)
    .filter(isMetaSeeAdDetailsControl)
}

function findMetaAdCard(detailsControl) {
  const candidates = []
  let current = detailsControl

  while (current && current !== document.body && current instanceof HTMLElement) {
    const libraryIds = metaLibraryIdCount(current)
    if (libraryIds > 1) break

    const text = fullTextFrom(current)
    if (libraryIds === 1 && text.includes("See ad details") && /Started running on|Active/i.test(text)) {
      candidates.push(current)
    }

    current = current.parentElement
  }

  return lastItem(candidates.filter(hasMetaCreativeContent)) || lastItem(candidates)
}

function metaDetailsInsertionPoint(detailsControl) {
  return detailsControl.closest("[role='none']") || detailsControl
}

function tiktokCreativePayload(container) {
  const titles = Array.from(container.querySelectorAll("[class*='TopadsVideoCard_title']"))
    .map((node) => textFrom(node, 80))
    .filter(Boolean)
  const infoItems = Array.from(container.querySelectorAll("[class*='TopadsVideoCard_cardInfoItem']"))
  const stats = {}

  for (const item of infoItems) {
    const value = textFrom(item.querySelector("[class*='itemValue']"), 80)
    const label = textFrom(item.querySelector("[class*='itemLabel']"), 80)
    if (label && value) stats[label] = value
  }

  const analyticsHref = container.querySelector("a[href*='/business/creativecenter/topads/']")?.getAttribute("href") || ""
  const landingPageUrl = bestLandingPageUrl(container)
  const mediaUrl = bestVideo(container) || bestImage(container)
  const title = titles.filter((value) => !/^not mention/i.test(value)).join(" · ") || "TikTok Top Ad"

  return {
    advertiser: "TikTok Top Ads",
    platform: "tiktok-creative",
    source: "tiktok-creative",
    sourceUrl: absoluteUrl(analyticsHref) || location.href,
    title,
    caption: textFrom(container, 900),
    format: "video",
    cta: "See analytics",
    landingPageUrl: landingPageUrl || absoluteUrl(analyticsHref),
    mediaUrl,
    metadata: {
      Source: "TikTok Creative Center",
      URL: location.href,
      Region: new URLSearchParams(location.search).get("region") || "",
      Period: new URLSearchParams(location.search).get("period") || "",
      Objective: titles[0] || "",
      Industry: titles[1] || "",
    },
    stats,
    folder: "No Folder",
  }
}

function tiktokTrendVideoPayload(container) {
  const caption = tiktokTrendVideoCaption(container)
  const advertiser = tiktokTrendVideoAdvertiser(container, caption)
  const detailUrl = tiktokTrendVideoDetailUrl(container)
  const text = textFrom(container, 1200)
  const followers = text.match(/(\d[\d,.]*[KMB]?\s+followers)/i)?.[1] || ""
  const views = text.match(/Video views\s+(\d[\d,.]*[KMB]?)/i)?.[1] || ""
  const mediaUrl = bestVideo(container) || bestImage(container)

  return {
    advertiser: advertiser || "TikTok Trends",
    platform: "tiktok-creative",
    source: "tiktok-creative",
    sourceUrl: detailUrl || location.href,
    title: caption.slice(0, 90) || advertiser || "TikTok trending video",
    caption: caption || text,
    format: "video",
    cta: "View details",
    landingPageUrl: detailUrl || location.href,
    mediaUrl,
    metadata: {
      Source: "TikTok Creative Center Trends",
      URL: location.href,
      Region: new URLSearchParams(location.search).get("region") || "",
      Period: new URLSearchParams(location.search).get("period") || "",
      Followers: followers,
    },
    stats: views ? { "Video views": views } : {},
    folder: "No Folder",
  }
}

function tiktokSellerInspirationVideoPayload(container) {
  const title = textFrom(container.querySelector(".text-head-s, p"), 100) || "TikTok Shop inspiration video"
  const statsText = textFrom(container, 700)
  const values = Array.from(container.querySelectorAll("p"))
    .map((node) => textFrom(node, 80))
    .filter(Boolean)
  const videoId = tiktokSellerVideoId(container)
  const mediaUrl = bestVideo(container) || bestImage(container)

  return {
    advertiser: "TikTok Shop Seller Center",
    platform: "tiktok-seller",
    source: "tiktok-seller",
    sourceUrl: location.href,
    title,
    caption: statsText || title,
    format: "video",
    cta: "Inspect Swipe",
    landingPageUrl: location.href,
    mediaUrl,
    metadata: {
      Source: "TikTok Shop Seller Center inspiration videos",
      URL: location.href,
      VideoID: videoId,
      Category: title,
    },
    stats: {
      Plays: values[1] || "",
      Likes: values[2] || "",
    },
    folder: "No Folder",
  }
}

function tiktokSellerVideoId(container) {
  return (container.id || "").match(/short_video_(\d+)/)?.[1] || ""
}

function tiktokTrendVideoCaption(container) {
  return Array.from(container.querySelectorAll("img[alt]"))
    .map((image) => cleanAltText(image.getAttribute("alt") || ""))
    .find((value) => value && value.length > 8) || ""
}

function tiktokTrendVideoAdvertiser(container, caption = tiktokTrendVideoCaption(container)) {
  const imageAlt = Array.from(container.querySelectorAll("img[alt]"))
    .map((image) => cleanAltText(image.getAttribute("alt") || ""))
    .find((value) => value && value !== caption && !/[#@]/.test(value))
  if (imageAlt) return imageAlt

  const match = textFrom(container, 600).match(/(?:^|\s)([A-Z][^#@]{1,80}?)\s+\d[\d,.]*[KMB]?\s+followers/i)
  return match?.[1]?.trim() || ""
}

function tiktokTrendVideoDetailUrl(container) {
  return Array.from(container.querySelectorAll("a[href],button"))
    .filter((element) => textFrom(element, 80) === "View details")
    .map((element) => element.getAttribute("href") || element.dataset?.href || "")
    .map(absoluteUrl)
    .find(Boolean) || ""
}

function tiktokTrendVideoDetailsControl(container) {
  return [
    ...Array.from(container.querySelectorAll("a[href],button")),
    ...Array.from(container.querySelectorAll("[role='button']")),
  ].find((element) => textFrom(element, 80) === "View details") || null
}

function tiktokTrendVideoDetailPayload(root = document) {
  const tiktokUrl = Array.from(root.querySelectorAll("a[href*='tiktok.com/@'][href*='/video/']"))
    .map((link) => absoluteUrl(link.getAttribute("href") || ""))
    .find(Boolean) || ""
  const video = root.querySelector("video")
  const mediaUrl = video?.currentSrc || video?.src || ""
  const caption = Array.from(root.querySelectorAll("[class*='multi-lines-ellipsis__container']"))
    .map((node) => textFrom(node, 900))
    .find(Boolean) || ""
  const durationText = textFrom(root.querySelector(".time-duration"), 40)
  const duration = durationSecondsFromText(durationText)
  const text = fullTextFrom(root)
  const timePeriod = text.match(/Time period:\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+-\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/i)?.[1]?.trim() || ""
  const stats = tiktokTrendVideoDetailStats(root)

  if (duration) {
    stats.Length = `${duration}s`
  }

  const metadata = {
    "Detail Source": "TikTok Creative Center View details modal",
  }
  if (tiktokUrl) metadata["TikTok URL"] = tiktokUrl
  if (timePeriod) metadata["Time period"] = timePeriod

  return removeEmptyValues({
    sourceUrl: tiktokUrl,
    landingPageUrl: tiktokUrl,
    mediaUrl,
    source_video_url: mediaUrl,
    caption,
    time: duration || undefined,
    metadata,
    stats,
  })
}

function tiktokTrendVideoDetailStats(root) {
  const stats = {}

  for (const section of Array.from(root.querySelectorAll("section"))) {
    const label = textFrom(section.querySelector(".titleLabel") || section.querySelector("[class*='titleLabel']"), 80)
    const value = textFrom(section.querySelector("div"), 80)
    if (label && value) stats[label] = value
  }

  for (const row of Array.from(root.querySelectorAll("[data-testid*='TopContentVideos-ModalContentInfo-7MJ2ft']"))) {
    const cells = Array.from(row.querySelectorAll("span"))
      .map((node) => textFrom(node, 80))
      .filter(Boolean)
    if (cells.length >= 2) {
      stats[cells[0]] = cells[1]
    }
  }

  const text = fullTextFrom(root)
  for (const label of ["Followers", "Median views", "Engagement", "Video views", "Organic video views", "Engagement rate", "6-second video views"]) {
    if (!stats[label]) {
      const value = metricValueFromText(text, label)
      if (value) stats[label] = value
    }
  }

  return stats
}

function metricValueFromText(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const metricPattern = "(--|\\d[\\d,.]*(?:\\s*[KMB])?(?:%|-\\d+%)?)"
  const afterLabel = text.match(new RegExp(`${escapedLabel}\\s+${metricPattern}`, "i"))
  if (afterLabel?.[1]) return afterLabel[1].replace(/\s+/g, "")
  const beforeLabel = text.match(new RegExp(`${metricPattern}\\s+${escapedLabel}`, "i"))
  return beforeLabel?.[1]?.replace(/\s+/g, "") || ""
}

function durationSecondsFromText(value) {
  const parts = normalizeText(value).split(":").map((part) => Number.parseInt(part, 10))
  if (!parts.length || parts.some((part) => Number.isNaN(part))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

function removeEmptyValues(value) {
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, removeEmptyValues(item)])
      .filter(([, item]) => item !== "" && item !== undefined && item !== null && !(typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 0))
  )
}

async function buildSwipePayload(container) {
  const payload = buildPayload(container)
  if (platform() === "tiktok-creative" && isTikTokTrendVideoCard(container)) {
    return enrichTikTokTrendVideoPayload(container, payload)
  }
  return payload
}

async function enrichTikTokTrendVideoPayload(container, payload) {
  try {
    const detailsControl = tiktokTrendVideoDetailsControl(container)
    if (!detailsControl?.click) return payload

    detailsControl.click()
    const modal = await waitForTikTokTrendVideoDetailModal()
    if (!modal) return payload

    const detailPayload = tiktokTrendVideoDetailPayload(modal)
    closeTikTokTrendVideoDetailModal()
    return mergeSwipePayload(payload, detailPayload)
  } catch {
    closeTikTokTrendVideoDetailModal()
    return payload
  }
}

function waitForTikTokTrendVideoDetailModal(timeoutMs = 5000) {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    const check = () => {
      const modal = tiktokTrendVideoDetailModalRoot()
      if (modal) {
        resolve(modal)
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(null)
        return
      }
      setTimeout(check, 100)
    }

    check()
  })
}

function tiktokTrendVideoDetailModalRoot() {
  const modalChild =
    document.querySelector("a[href*='tiktok.com/@'][href*='/video/']") ||
    document.querySelector("[data-testid*='CreatorVideoPlayerModal']") ||
    document.querySelector("[data-testid*='TopContentVideos-ModalContentInfo']")

  if (!modalChild) return null
  return modalChild.closest?.("[class*='rounded-lg'][class*='bg-white'], [role='dialog'], [data-testid*='Modal']") || document.body
}

function closeTikTokTrendVideoDetailModal() {
  const closeButton =
    document.querySelector("[data-testid*='ModalCloseButton']") ||
    document.querySelector("button[aria-label*='Close' i]") ||
    document.querySelector("[aria-label='Close']")
  closeButton?.click?.()
}

function mergeSwipePayload(payload, detailPayload) {
  const merged = {
    ...payload,
    metadata: {
      ...(payload.metadata || {}),
      ...(detailPayload.metadata || {}),
    },
    stats: {
      ...(payload.stats || {}),
      ...(detailPayload.stats || {}),
    },
  }

  for (const key of ["sourceUrl", "landingPageUrl", "mediaUrl", "source_video_url", "caption", "time"]) {
    if (detailPayload[key]) merged[key] = detailPayload[key]
  }

  if (detailPayload.caption) {
    merged.title = detailPayload.caption.slice(0, 90)
  }

  return merged
}

function tiktokTrendVideoInsertionPoint(card) {
  const explicitMediaBlock = card.querySelector("[class*='h-[421px]'][class*='overflow-hidden'], [class*='h-[421px]'][class*='rounded-[16px]']")
  if (explicitMediaBlock) return explicitMediaBlock

  const media = largestTikTokTrendMedia(card)
  if (!media) return card

  return media.closest?.("[class*='overflow-hidden'], [class*='rounded'], [class*='video'], [class*='Video'], a") || media.parentElement || media
}

function largestTikTokTrendMedia(card) {
  return Array.from(card.querySelectorAll("video,img"))
    .map((element) => {
      const rect = element.getBoundingClientRect?.() || { width: 0, height: 0 }
      const naturalArea = (element.naturalWidth || element.videoWidth || element.width || 0) * (element.naturalHeight || element.videoHeight || element.height || 0)
      const renderedArea = Math.max(0, rect.width || 0) * Math.max(0, rect.height || 0)
      return {
        element,
        area: Math.max(naturalArea, renderedArea),
      }
    })
    .filter((candidate) => candidate.area > 0)
    .sort((a, b) => b.area - a.area)[0]?.element || null
}

function inferAdvertiser(container) {
  if (platform() === "facebook") {
    const pageName = Array.from(container.querySelectorAll("a[href*='facebook.com/']"))
      .map((link) => textFrom(link, 80))
      .find((value) => value && !/meta ad library|ad library|sponsored/i.test(value))
    if (pageName) return pageName
  }

  const candidates = [
    "[aria-level='1']",
    "[aria-level='2']",
    "h1",
    "h2",
    "h3",
    "strong",
    "a[role='link']",
  ]

  for (const selector of candidates) {
    const value = textFrom(container.querySelector(selector), 80)
    if (value && !/sponsored|active|library id|learn more|shop now/i.test(value)) {
      return value
    }
  }

  if (platform() === "google") {
    const bodyText = textFrom(container, 300)
    const advertiserMatch = bodyText.match(/advertiser\s+([^]+?)(report this ad|last shown|format|$)/i)
    if (advertiserMatch?.[1]) return advertiserMatch[1].trim().slice(0, 80)
  }

  return document.title.split("|")[0].trim() || platformLabel()
}

function inferTitle(container, caption) {
  if (platform() === "facebook") {
    const bodyText = Array.from(container.querySelectorAll("[role='button'], button, [dir='auto']"))
      .map((node) => textFrom(node, 180))
      .find((value) => value && !/^(active|see ad details|open drop-down|sponsored|shop now|install now|learn more)$/i.test(value) && !/^library id:/i.test(value))
    if (bodyText) return bodyText
  }

  const headings = Array.from(container.querySelectorAll("h1,h2,h3,strong,[role='heading']"))
    .map((node) => textFrom(node, 140))
    .filter(Boolean)

  return headings.find((heading) => heading !== inferAdvertiser(container)) || caption.slice(0, 90) || document.title
}

function inferMetadata(container) {
  const text = textFrom(container, 1400)
  const metadata = {}
  const stats = {}

  const formatMatch = text.match(/Format[:\s]+([A-Za-z]+)/i)
  if (formatMatch?.[1]) metadata.Format = formatMatch[1]

  const lastShownMatch = text.match(/Last shown[:\s]+([A-Za-z0-9,\s]+)/i)
  if (lastShownMatch?.[1]) stats["Last shown"] = lastShownMatch[1].trim()

  const startedMatch = text.match(/Started running on\s+(.+?)(?:\s+Platforms|$)/i)
  if (startedMatch?.[1]) stats["Started"] = startedMatch[1].trim()

  const viewsMatch = text.match(/Views\s+([0-9,.]+)/i)
  if (viewsMatch?.[1]) stats.Views = viewsMatch[1]

  metadata.Source = platformLabel()
  metadata.URL = location.href
  return { metadata, stats }
}

function buildPayload(container) {
  if (platform() === "tiktok-creative" && isTikTokTrendVideoCard(container)) {
    return tiktokTrendVideoPayload(container)
  }
  if (platform() === "tiktok-creative" && isTikTokTopAdsCard(container)) {
    return tiktokCreativePayload(container)
  }
  if (platform() === "tiktok" && tiktokPostLink(container)) {
    return tiktokPostPayload(container)
  }
  if (platform() === "tiktok-seller" && isTikTokSellerInspirationVideoCard(container)) {
    return tiktokSellerInspirationVideoPayload(container)
  }
  if (platform() === "twitter") {
    return twitterPayload(container)
  }

  const format = inferFormat(container)
  const caption = textFrom(container, 900)
  const advertiser = inferAdvertiser(container)
  const title = inferTitle(container, caption)
  const mediaUrl = bestVideo(container) || bestImage(container)
  const landingPageUrl = bestLandingPageUrl(container)
  const { metadata, stats } = inferMetadata(container)

  return {
    advertiser,
    platform: platform(),
    source: platformLabel(),
    sourceUrl: location.href,
    title,
    caption,
    format,
    cta: /shop now/i.test(caption) ? "Shop now" : /learn more/i.test(caption) ? "Learn more" : "Inspect Swipe",
    landingPageUrl,
    mediaUrl,
    metadata,
    stats,
    folder: "No Folder",
  }
}

function setButtonState(button, state, label) {
  button.dataset.state = state
  button.textContent = label
  button.disabled = state === "saving"
}

function saveSwipe(button, container) {
  setButtonState(button, "saving", "Saving...")

  Promise.resolve()
    .then(() => buildSwipePayload(container))
    .then((payload) => sendSwipePayload(button, payload))
    .catch(() => {
      setButtonState(button, "error", "Save failed")
      setTimeout(() => setButtonState(button, "", "✣ Swipe"), 2200)
    })
}

function sendSwipePayload(button, payload) {
  chrome.runtime.sendMessage(
    {
      type: "CFARM_SAVE_SWIPE",
      apiUrl: CFARM_API_URL,
      payload,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        setButtonState(button, "error", "Extension error")
        setTimeout(() => setButtonState(button, "", "✣ Swipe"), 2200)
        return
      }
      if (response?.ok) {
        markPayloadSwiped(payload)
        setButtonState(button, "saved", "✓ Swiped")
        return
      }
      setButtonState(button, "error", response?.error ? "Server offline" : "Save failed")
      setTimeout(() => setButtonState(button, "", "✣ Swipe"), 2200)
    }
  )
}

function makeButton(container, placement = "card") {
  const button = document.createElement("button")
  button.type = "button"
  button.className =
    placement === "fixed"
      ? "cfarm-swipe-button cfarm-swipe-fixed"
      : placement === "meta"
        ? "cfarm-swipe-button cfarm-swipe-meta-button"
        : placement === "tiktok-grid"
          ? "cfarm-swipe-button cfarm-swipe-tiktok-grid-button"
          : "cfarm-swipe-button cfarm-swipe-card-button"
  button.textContent = "✣ Swipe"
  button.setAttribute(CFARM_BUTTON_ATTR, "true")
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    saveSwipe(button, container)
  })
  return button
}

function cardCandidates() {
  if (platform() === "tiktok-creative") {
    if (isTikTokTrendVideoPage()) {
      return tiktokTrendVideoCardCandidates()
    }
    return tiktokTopAdsCardCandidates()
  }
  if (platform() === "tiktok-seller") {
    return tiktokSellerInspirationVideoCardCandidates()
  }
  if (platform() === "twitter") {
    return twitterCardCandidates()
  }

  const selectors = [
    "[role='article']",
    "[data-testid*='ad']",
    "[class*='ad-card']",
    "[class*='AdCard']",
    "[class*='card']",
    "article",
  ]

  return Array.from(document.querySelectorAll(selectors.join(",")))
    .filter((element) => element instanceof HTMLElement)
    .filter((element) => !element.closest("header, nav, [id*='Header'], [class*='Header'], [class*='FixedHeader']"))
    .filter((element) => textFrom(element, 240).length > 60 || element.querySelector("img,video"))
    .slice(0, 80)
}

function injectCardButtons() {
  if (!ensureSwipedIndexReady()) return
  for (const candidate of cardCandidates()) {
    if (candidate.querySelector(`[${CFARM_BUTTON_ATTR}]`)) continue
    if (isAlreadySwiped(candidate)) continue
    candidate.style.position ||= "relative"
    candidate.appendChild(makeButton(candidate))
  }
}

function injectMetaAdButtons() {
  if (!ensureSwipedIndexReady()) return
  for (const detailsControl of metaSeeAdDetailsControls()) {
    const card = findMetaAdCard(detailsControl)
    if (!card || card.querySelector(`[${CFARM_BUTTON_ATTR}]`)) continue
    if (isAlreadySwiped(card)) continue

    const button = makeButton(card, "meta")
    const insertionPoint = metaDetailsInsertionPoint(detailsControl)
    insertionPoint.insertAdjacentElement("afterend", button)
  }
}

function injectTikTokPostButtons() {
  if (!ensureSwipedIndexReady()) return 0
  let count = 0

  for (const card of tiktokPostCards()) {
    if (card.querySelector(`[${CFARM_BUTTON_ATTR}]`)) continue
    if (isAlreadySwiped(card)) continue

    const postItem = card.querySelector("[data-e2e='user-post-item']") || card
    const button = makeButton(card, "tiktok-grid")
    postItem.insertAdjacentElement("afterend", button)
    count += 1
  }

  return count
}

function injectTikTokTrendVideoButtons() {
  if (!ensureSwipedIndexReady()) return 0
  let count = 0

  for (const card of tiktokTrendVideoCardCandidates()) {
    if (card.hasAttribute?.(CFARM_CARD_ATTR) || card.querySelector(`[${CFARM_BUTTON_ATTR}]`)) continue
    if (isAlreadySwiped(card)) continue
    card.setAttribute?.(CFARM_CARD_ATTR, "true")

    const button = makeButton(card, "tiktok-grid")
    const insertionPoint = tiktokTrendVideoInsertionPoint(card)
    if (insertionPoint === card) {
      card.appendChild(button)
    } else {
      insertionPoint.insertAdjacentElement("afterend", button)
    }
    count += 1
  }

  return count
}

function injectTikTokSellerInspirationVideoButtons() {
  if (!ensureSwipedIndexReady()) return 0
  let count = 0

  for (const card of tiktokSellerInspirationVideoCardCandidates()) {
    if (card.hasAttribute?.(CFARM_CARD_ATTR) || card.querySelector(`[${CFARM_BUTTON_ATTR}]`)) continue
    if (isAlreadySwiped(card)) continue
    card.setAttribute?.(CFARM_CARD_ATTR, "true")
    card.style.position ||= "relative"
    card.appendChild(makeButton(card))
    count += 1
  }

  return count
}

function injectGoogleButton() {
  if (!ensureSwipedIndexReady()) return
  if (document.querySelector(".cfarm-swipe-fixed")) return
  if (isAlreadySwiped(document.body)) return
  document.body.appendChild(makeButton(document.body, "fixed"))
}

function injectTikTokButton() {
  if (!ensureSwipedIndexReady()) return
  if (document.querySelector(".cfarm-swipe-fixed")) return
  if (isAlreadySwiped(document.querySelector("main") || document.body)) return
  const main = document.querySelector("main") || document.body
  document.body.appendChild(makeButton(main, "fixed"))
}

function injectButtons() {
  const currentPlatform = platform()

  if (currentPlatform === "facebook") {
    injectMetaAdButtons()
    return
  }

  if (currentPlatform === "google") {
    injectGoogleButton()
    return
  }

  if (currentPlatform === "tiktok") {
    if (injectTikTokPostButtons() > 0 || document.querySelector(".cfarm-swipe-tiktok-grid-button")) {
      return
    }
    injectTikTokButton()
  }

  if (currentPlatform === "tiktok-seller") {
    if (isTikTokSellerInspirationVideoPage()) {
      injectTikTokSellerInspirationVideoButtons()
    }
    return
  }

  if (currentPlatform === "tiktok-creative" && isTikTokTrendVideoPage()) {
    injectTikTokTrendVideoButtons()
    return
  }

  injectCardButtons()
}

injectButtons()

const observer = new MutationObserver(() => {
  window.requestAnimationFrame(injectButtons)
})

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
})
