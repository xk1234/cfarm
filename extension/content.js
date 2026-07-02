const CFARM_BUTTON_ATTR = "data-cfarm-swipe"
const CFARM_API_URL = "http://localhost:3000/api/swipes"

function platform() {
  const host = location.hostname
  const path = location.pathname

  if (host.includes("facebook.com")) return "facebook"
  if (host.includes("ads.tiktok.com")) return "tiktok-creative"
  if (host.includes("seller-sg.tiktok.com")) return "tiktok-seller"
  if (host.includes("tiktok.com")) return "tiktok"
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
    landingPageUrl: absoluteUrl(analyticsHref),
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
  if (platform() === "tiktok-creative" && isTikTokTopAdsCard(container)) {
    return tiktokCreativePayload(container)
  }
  if (platform() === "tiktok" && tiktokPostLink(container)) {
    return tiktokPostPayload(container)
  }

  const format = inferFormat(container)
  const caption = textFrom(container, 900)
  const advertiser = inferAdvertiser(container)
  const title = inferTitle(container, caption)
  const mediaUrl = bestVideo(container) || bestImage(container)
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
    landingPageUrl: "",
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
  const payload = buildPayload(container)
  setButtonState(button, "saving", "Saving...")
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
    return tiktokTopAdsCardCandidates()
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
  for (const candidate of cardCandidates()) {
    if (candidate.querySelector(`[${CFARM_BUTTON_ATTR}]`)) continue
    candidate.style.position ||= "relative"
    candidate.appendChild(makeButton(candidate))
  }
}

function injectMetaAdButtons() {
  for (const detailsControl of metaSeeAdDetailsControls()) {
    const card = findMetaAdCard(detailsControl)
    if (!card || card.querySelector(`[${CFARM_BUTTON_ATTR}]`)) continue

    const button = makeButton(card, "meta")
    const insertionPoint = metaDetailsInsertionPoint(detailsControl)
    insertionPoint.insertAdjacentElement("afterend", button)
  }
}

function injectTikTokPostButtons() {
  let count = 0

  for (const card of tiktokPostCards()) {
    if (card.querySelector(`[${CFARM_BUTTON_ATTR}]`)) continue

    const postItem = card.querySelector("[data-e2e='user-post-item']") || card
    const button = makeButton(card, "tiktok-grid")
    postItem.insertAdjacentElement("afterend", button)
    count += 1
  }

  return count
}

function injectGoogleButton() {
  if (document.querySelector(".cfarm-swipe-fixed")) return
  document.body.appendChild(makeButton(document.body, "fixed"))
}

function injectTikTokButton() {
  if (document.querySelector(".cfarm-swipe-fixed")) return
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
    injectTikTokButton()
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
