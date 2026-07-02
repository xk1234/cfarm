chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CFARM_SAVE_SWIPE") {
    return false
  }

  const tab = sender.tab
  const windowId = tab?.windowId

  async function saveSwipe() {
    let screenshotDataUrl = ""
    let analyticsDetails = {}

    if (typeof windowId === "number") {
      try {
        screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: "png",
        })
      } catch {
        screenshotDataUrl = ""
      }
    }

    if (shouldCollectTikTokAnalytics(message.payload)) {
      analyticsDetails = await collectTikTokAnalytics(message.payload.sourceUrl || message.payload.landingPageUrl)
    }

    const enrichedPayload = {
      ...message.payload,
      ...analyticsDetails,
      mediaUrl: analyticsDetails.mediaUrl || message.payload?.mediaUrl,
      metadata: {
        ...(message.payload?.metadata || {}),
        ...(analyticsDetails.metadata || {}),
      },
      stats: {
        ...(message.payload?.stats || {}),
        ...(analyticsDetails.stats || {}),
      },
    }

    const response = await fetch(message.apiUrl || "http://localhost:3000/api/swipes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...enrichedPayload,
        screenshotDataUrl,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || "Failed to save swipe")
    }

    return payload
  }

  saveSwipe()
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Failed to save swipe" }))

  return true
})

function shouldCollectTikTokAnalytics(payload) {
  const url = payload?.sourceUrl || payload?.landingPageUrl || ""
  return payload?.platform === "tiktok-creative" && /\/business\/creativecenter\/topads\//.test(url)
}

async function collectTikTokAnalytics(rawUrl) {
  if (!rawUrl) return {}

  let tabId
  try {
    const tab = await createTab({ url: rawUrl, active: false })
    tabId = tab?.id
    if (typeof tabId !== "number") return {}

    await waitForTabComplete(tabId, 15000)
    await delay(1800)

    const results = await executeScript(tabId, collectAnalyticsFromPage)
    const pageData = results?.[0]?.result
    if (!pageData) return {}

    return parseAnalyticsPageData(pageData, rawUrl)
  } catch {
    return {}
  } finally {
    if (typeof tabId === "number") {
      try {
        await removeTab(tabId)
      } catch {
        // Ignore tab cleanup failures.
      }
    }
  }
}

function createTab(properties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(properties, (tab) => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve(tab)
    })
  })
}

function removeTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.remove(tabId, () => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve()
    })
  })
}

function executeScript(tabId, func) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, func }, (results) => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve(results)
    })
  })
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, timeoutMs)

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }

    chrome.tabs.onUpdated.addListener(listener)
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return
      if (tab?.status === "complete") {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function collectAnalyticsFromPage() {
  const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim()
  const title = document.title || ""
  const videoUrls = Array.from(document.querySelectorAll("video, source"))
    .map((node) => node.currentSrc || node.src || node.getAttribute("src") || "")
    .filter(Boolean)
  const imageUrls = Array.from(document.querySelectorAll("img"))
    .map((image) => image.currentSrc || image.src || "")
    .filter(Boolean)
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map((link) => ({
      text: (link.innerText || link.textContent || "").replace(/\s+/g, " ").trim(),
      href: link.href,
    }))
    .filter((link) => link.href)
  const scripts = Array.from(document.scripts)
    .map((script) => script.textContent || "")
    .join("\n")
    .slice(0, 1_000_000)
  const scriptVideoUrls = Array.from(scripts.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+?(?:\.mp4|mime_type=video_mp4|video)[^"'\s<>]*/gi))
    .map((match) => match[0].replaceAll("\\/", "/").replaceAll("\\u002F", "/"))
    .filter(Boolean)

  return {
    url: location.href,
    title,
    text: bodyText.slice(0, 25000),
    videoUrls: Array.from(new Set([...videoUrls, ...scriptVideoUrls])).slice(0, 8),
    imageUrls: Array.from(new Set(imageUrls)).slice(0, 8),
    links: links.slice(0, 60),
  }
}

function parseAnalyticsPageData(pageData, sourceUrl) {
  const text = String(pageData.text || "")
  const sourceVideoUrl = firstHttpUrl(pageData.videoUrls)
  const uploadedAt = firstMatch(text, [
    /(?:Uploaded|Posted|Published|Last shown|First shown|Started running)\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i,
  ])

  const likes = metricNumber(text, ["Likes", "Like"])
  const comments = metricNumber(text, ["Comments", "Comment"])
  const shares = metricNumber(text, ["Shares", "Share"])
  const time = durationSeconds(text)
  const ctrRank = rankNear(text, ["CTR", "Click-through rate"])
  const cvrRank = rankNear(text, ["CVR", "Conversion rate"])
  const clicksRank = rankNear(text, ["Clicks", "Click"])
  const conversionRank = rankNear(text, ["Conversion", "Conversions"])
  const remainRank = rankNear(text, ["Remain", "Retention", "Remaining"])
  const budgetLevel = budgetFromText(text)
  const industryBenchmark = industryBenchmarkFromText(text, ctrRank, cvrRank, clicksRank, conversionRank, remainRank)

  const metadata = {
    "Analytics URL": sourceUrl,
  }
  const stats = {}
  if (uploadedAt) stats.Uploaded = uploadedAt
  if (time !== undefined) stats.Length = `${time}s`
  if (likes !== undefined) stats.Likes = String(likes)
  if (comments !== undefined) stats.Comments = String(comments)
  if (shares !== undefined) stats.Shares = String(shares)
  if (ctrRank) stats["CTR rank"] = ctrRank
  if (cvrRank) stats["CVR rank"] = cvrRank
  if (clicksRank) stats["Clicks rank"] = clicksRank
  if (conversionRank) stats["Conversion rank"] = conversionRank
  if (remainRank) stats["Remain rank"] = remainRank
  if (budgetLevel) stats["Budget level"] = budgetLevel

  return {
    source_video_url: sourceVideoUrl,
    mediaUrl: sourceVideoUrl || undefined,
    uploaded_at: uploadedAt,
    time,
    likes,
    comments,
    shares,
    ctr_rank: ctrRank,
    cvr_rank: cvrRank,
    clicks_rank: clicksRank,
    conversion_rank: conversionRank,
    remain_rank: remainRank,
    budget_level: budgetLevel,
    industry_benchmark: industryBenchmark,
    analyticsText: text,
    metadata,
    stats,
  }
}

function firstHttpUrl(values) {
  if (!Array.isArray(values)) return undefined
  return values.find((value) => typeof value === "string" && /^https?:\/\//.test(value))
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

function metricNumber(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
      new RegExp(`${escaped}\\s*[:：]?\\s*([0-9][0-9,.]*\\s*[KMB]?)`, "i"),
      new RegExp(`([0-9][0-9,.]*\\s*[KMB]?)\\s+${escaped}`, "i"),
    ]
    for (const pattern of patterns) {
      const value = firstMatch(text, [pattern])
      const parsed = parseCompactNumber(value)
      if (parsed !== undefined) return parsed
    }
  }
  return undefined
}

function parseCompactNumber(value) {
  if (!value) return undefined
  const match = String(value).trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)([KMB])?/i)
  if (!match) return undefined
  const number = Number(match[1])
  if (!Number.isFinite(number)) return undefined
  const suffix = match[2]?.toUpperCase()
  const multiplier = suffix === "B" ? 1_000_000_000 : suffix === "M" ? 1_000_000 : suffix === "K" ? 1_000 : 1
  return Math.round(number * multiplier)
}

function durationSeconds(text) {
  const timecode = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/)
  if (timecode) {
    const first = Number(timecode[1])
    const second = Number(timecode[2])
    const third = timecode[3] ? Number(timecode[3]) : 0
    return timecode[3] ? first * 3600 + second * 60 + third : first * 60 + second
  }

  const seconds = text.match(/\b(\d+(?:\.\d+)?)\s*(?:sec|secs|second|seconds|s)\b/i)
  if (seconds?.[1]) return Math.round(Number(seconds[1]))
  return undefined
}

function rankNear(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
      new RegExp(`${escaped}.{0,80}?((?:Top|Bottom)\\s*\\d{1,3}%)`, "i"),
      new RegExp(`((?:Top|Bottom)\\s*\\d{1,3}%).{0,80}?${escaped}`, "i"),
    ]
    const value = firstMatch(text, patterns)
    if (value) return value.replace(/\s+/g, " ")
  }
  return undefined
}

function budgetFromText(text) {
  const match = text.match(/\b(?:Budget level|Budget)\s*[:：]?\s*(Low|Medium|High)\b/i)
  return match?.[1]?.toLowerCase() || undefined
}

function industryBenchmarkFromText(text, ctrRank, cvrRank, clicksRank, conversionRank, remainRank) {
  const metricRankPairs = [
    ["CTR", ctrRank],
    ["CVR", cvrRank],
    ["Clicks", clicksRank],
    ["Conversion", conversionRank],
    ["Remain", remainRank],
  ]
  const pair = metricRankPairs.find(([, rank]) => Boolean(rank))
  if (!pair) return undefined

  const comparison = /industry average/i.test(text) ? "of the industry average" : "benchmark from analytics page"
  return {
    metric: pair[0],
    rank: pair[1],
    comparison,
  }
}
