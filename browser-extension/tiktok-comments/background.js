const POLL_ALARM = "lumenclip-tiktok-comments-poll"
const STEP_TIMEOUT_MS = 30_000

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== "SET_CONFIG") return false
  void configure(message.config).then(
    () => respond({ ok: true }),
    (error) => respond({ ok: false, error: error.message })
  )
  return true
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void runPending()
})

async function configure(config) {
  if (config?.version !== 1 || !config.endpoint || !config.token) {
    throw new Error("Invalid companion configuration")
  }
  const endpoint = new URL(config.endpoint)
  if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("Invalid endpoint")
  await chrome.storage.local.set({ commentConfig: config })
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 })
  await runPending()
}

async function runPending() {
  const { commentConfig, commentRun } = await chrome.storage.local.get(["commentConfig", "commentRun"])
  if (!commentConfig || commentRun?.running) return
  const response = await fetch(commentConfig.endpoint, {
    headers: { authorization: `Bearer ${commentConfig.token}` },
  })
  const manifest = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(manifest.error || `Manifest failed (${response.status})`)
  const posts = manifest.collection?.posts || []
  const pending = posts.filter((post) => post.status === "pending" || post.status === "capturing")
  const sends = Array.isArray(manifest.sends) ? manifest.sends : []
  if (!pending.length && !sends.length) return
  await chrome.storage.local.set({ commentRun: { running: true, startedAt: new Date().toISOString() } })
  try {
    for (const post of pending) await runPost(commentConfig, manifest.collection.id, post, "collect")
    for (const send of sends) {
      const post = posts.find((item) => item.postId === send.comment?.postId)
      if (post && send.comment) await runPost(commentConfig, manifest.collection.id, post, "send", send)
    }
  } finally {
    await chrome.storage.local.remove("commentRun")
  }
}

async function runPost(config, collectionId, post, mode, send) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    const tab = await chrome.tabs.create({ url: post.url, active: true })
    try {
      await waitForTab(tab.id)
      const result = await withTimeout(
        chrome.tabs.sendMessage(tab.id, { type: "RUN_TIKTOK_COMMENTS", mode, send }),
        STEP_TIMEOUT_MS
      )
      if (result?.error) throw new Error(result.error)
      const payload = mode === "collect"
        ? { collectionId, postId: post.postId, comments: result.comments, complete: result.complete }
        : { collectionId, postId: post.postId, comments: [], sendResults: [{ sendId: send.id, status: "sent" }] }
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Ingest failed")
      return
    } catch (error) {
      lastError = error
    } finally {
      if (tab.id) await chrome.tabs.remove(tab.id).catch(() => {})
    }
  }
  if (mode === "collect") {
    await fetch(config.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify({ collectionId, postId: post.postId, comments: [], error: lastError?.message || "Capture failed" }),
    })
  }
}

function waitForTab(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("TikTok step timed out")), ms))])
}
