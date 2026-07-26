chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== "RUN_TIKTOK_COMMENTS") return false
  void run(message).then(respond, (error) => respond({ error: error.message }))
  return true
})

async function run(message) {
  hardStopIfBlocked()
  await openComments()
  if (message.mode === "send") {
    await sendApproved(message.send)
    return { sent: true }
  }
  return collectComments()
}

function hardStopIfBlocked() {
  const text = document.body?.innerText || ""
  if (
    /drag the slider to fit the puzzle|captcha|verify to continue/i.test(text)
  ) {
    throw new Error(
      "TikTok CAPTCHA detected. Open TikTok and complete it yourself; the companion has stopped."
    )
  }
  if (/log in to comment/i.test(text)) {
    throw new Error(
      "TikTok login required. Sign in yourself; the companion has stopped."
    )
  }
}

async function openComments() {
  document.querySelector('[data-e2e="comment-icon"]')?.click()
  await waitFor(
    () =>
      document.querySelector('div[class*="DivCommentObjectWrapper"]') ||
      document.querySelector('[data-e2e="comment-input"]')
  )
}

async function collectComments() {
  let stable = 0
  let previous = -1
  while (stable < 4) {
    hardStopIfBlocked()
    const wrappers = [
      ...document.querySelectorAll('div[class*="DivCommentObjectWrapper"]'),
    ]
    stable = wrappers.length === previous ? stable + 1 : 0
    previous = wrappers.length
    const scroller = findScroller(wrappers[wrappers.length - 1])
    if (scroller) scroller.scrollTop = scroller.scrollHeight
    wrappers[wrappers.length - 1]?.scrollIntoView({ block: "end" })
    await delay(900 + Math.random() * 700)
  }
  const wrappers = [
    ...document.querySelectorAll('div[class*="DivCommentObjectWrapper"]'),
  ]
  const comments = wrappers.map(extractComment).filter(Boolean)
  const nestedReplyCount = comments.reduce(
    (sum, item) => sum + item.replyCount,
    0
  )
  const headerText =
    document.querySelector('[data-e2e="comment-count"]')?.textContent || ""
  return {
    comments,
    complete: {
      topLevelCaptured: comments.length,
      nestedReplyCount,
      headerCount: parseCount(headerText),
    },
  }
}

function extractComment(wrapper) {
  const textNode = wrapper.querySelector('[data-e2e="comment-level-1"]')
  const handleLink = wrapper.querySelector('a[href^="/@"]')
  if (!textNode || !handleLink) return null
  const href = handleLink.getAttribute("href") || ""
  const replyText =
    [...wrapper.querySelectorAll("*")]
      .map((node) => node.textContent?.trim())
      .find((text) => /^View \d+ replies$/i.test(text || "")) || ""
  const likeLabel =
    [...wrapper.querySelectorAll('[aria-label^="Like video"]')]
      .map((node) => node.getAttribute("aria-label"))
      .find(Boolean) || ""
  const dateText = [...wrapper.querySelectorAll("span")]
    .map((node) => node.textContent?.trim())
    .find((text) => /^\d{1,2}-\d{1,2}$/.test(text || ""))
  const id =
    wrapper.getAttribute("data-comment-id") ||
    wrapper
      .querySelector('a[href*="/comment/"]')
      ?.getAttribute("href")
      ?.match(/comment\/(\d+)/)?.[1] ||
    hash(`${href}:${textNode.textContent}:${dateText || ""}`)
  return {
    tiktokCommentId: id,
    displayName:
      wrapper
        .querySelector('[data-e2e="comment-username-1"]')
        ?.textContent?.trim() || "",
    handle: decodeURIComponent(href.split("/@")[1]?.split(/[/?]/)[0] || ""),
    text: textNode.textContent?.trim() || "",
    likeCount: parseCount(likeLabel),
    replyCount: parseCount(replyText),
    dateText,
  }
}

async function sendApproved(send) {
  const comment = send?.comment
  if (!comment || !send?.text)
    throw new Error("Approved send payload is incomplete")
  const wrapper = [
    ...document.querySelectorAll('div[class*="DivCommentObjectWrapper"]'),
  ].find((node) => {
    const extracted = extractComment(node)
    return extracted?.tiktokCommentId === comment.tiktokCommentId
  })
  if (!wrapper) throw new Error("Approved comment is no longer visible")
  wrapper.querySelector('[aria-label="Reply"]')?.click()
  await delay(700 + Math.random() * 900)
  const input = await waitFor(() =>
    document.querySelector('[data-e2e="comment-input"]')
  )
  input.focus()
  document.execCommand("insertText", false, send.text)
  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: send.text,
    })
  )
  await delay(1000 + Math.random() * 1600)
  const post = document.querySelector('[data-e2e="comment-post"]')
  if (!post) throw new Error("TikTok reply submit control was not found")
  post.click()
  await delay(20_000 + Math.random() * 25_000)
}

function findScroller(node) {
  for (
    let current = node?.parentElement;
    current;
    current = current.parentElement
  ) {
    const style = getComputedStyle(current)
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight
    )
      return current
  }
  return null
}
function parseCount(value) {
  const match = String(value).match(/([\d,.]+)\s*([KMB])?/i)
  if (!match) return 0
  const number = Number(match[1].replace(/,/g, ""))
  return Math.round(
    number * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1)
  )
}
function waitFor(read, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      const value = read()
      if (value) resolve(value)
      else if (Date.now() - start > timeout)
        reject(new Error("TikTok comment panel did not become ready"))
      else setTimeout(tick, 150)
    }
    tick()
  })
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
function hash(value) {
  let result = 2166136261
  for (let index = 0; index < value.length; index++)
    result = Math.imul(result ^ value.charCodeAt(index), 16777619)
  return `dom-${(result >>> 0).toString(16)}`
}
