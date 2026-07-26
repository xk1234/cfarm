const APP_ORIGIN = "https://cfarm-eight.vercel.app"
const CONNECT_URL = `${APP_ORIGIN}/app/analytics`

// Which feature the popup is about is decided by the tab you opened it on:
// a Studio analytics page means analytics, any other TikTok page means
// comments. Showing both at once produced two Connect buttons for one account.
const FEATURES = {
  studio: {
    label: "Studio analytics",
    statusMessage: "GET_CAPTURE_STATUS",
    start: "START_PENDING_CAPTURE",
    clear: "CLEAR_CAPTURE_CONFIG",
    idle: "No pending syncs.",
  },
  comments: {
    label: "Comments",
    statusMessage: "GET_COMMENTS_STATUS",
    start: "START_COMMENTS_SYNC",
    clear: "CLEAR_COMMENTS_CONFIG",
    idle: "No pending comment work.",
  },
}

const contextLabel = document.querySelector("#context")
const statusElement = document.querySelector("#status")
const statusText = document.querySelector("#statusText")
const connectButton = document.querySelector("#connect")
const syncButton = document.querySelector("#sync")
const reconnectButton = document.querySelector("#reconnect")
const clearButton = document.querySelector("#clear")
const switchButton = document.querySelector("#switch")

let feature = "studio"

void init()

connectButton.addEventListener("click", openLumenClip)
reconnectButton.addEventListener("click", async () => {
  // Reconnecting must drop the stored pairing first, otherwise LumenClip hands
  // back a config that gets merged onto a dead token.
  await chrome.runtime.sendMessage({ type: FEATURES[feature].clear })
  await openLumenClip()
})
clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: FEATURES[feature].clear })
  await refresh()
})
switchButton.addEventListener("click", async () => {
  feature = feature === "studio" ? "comments" : "studio"
  await refresh()
})

syncButton.addEventListener("click", async () => {
  setBusy(true, "Working…")
  const result = await chrome.runtime.sendMessage({
    type: FEATURES[feature].start,
  })
  setBusy(false)
  if (!result?.ok) {
    await refresh(result?.error || "Sync failed")
    return
  }
  if (!result.pending) {
    showStatus(FEATURES[feature].idle, "success")
    return
  }
  window.close()
})

async function init() {
  feature = await detectFeature()
  await refresh()
}

async function detectFeature() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url || ""
  if (/^https:\/\/www\.tiktok\.com\/tiktokstudio\/analytics\//.test(url)) {
    return "studio"
  }
  if (/^https:\/\/www\.tiktok\.com\/@/.test(url)) return "comments"
  return "studio"
}

async function openLumenClip() {
  await chrome.tabs.create({ url: CONNECT_URL, active: true })
  window.close()
}

async function refresh(overrideMessage) {
  const config = FEATURES[feature]
  contextLabel.textContent = config.label
  const state = await chrome.runtime.sendMessage({ type: config.statusMessage })
  const paired = Boolean(state?.config)
  const message = overrideMessage || state?.status?.message
  const kind = overrideMessage ? "error" : state?.status?.kind

  connectButton.hidden = paired
  syncButton.hidden = !paired
  reconnectButton.hidden = !paired
  clearButton.hidden = !paired

  const other = feature === "studio" ? FEATURES.comments : FEATURES.studio
  switchButton.hidden = false
  switchButton.textContent = `${other.label} settings`

  showStatus(message || (paired ? "Connected" : "Not connected"), kind)
}

function setBusy(busy, message) {
  for (const button of [
    connectButton,
    syncButton,
    reconnectButton,
    clearButton,
    switchButton,
  ]) {
    button.disabled = busy
  }
  if (busy && message) showStatus(message, "running")
}

function showStatus(message, kind) {
  statusText.textContent = message
  const known = ["success", "error", "running"].includes(kind) ? kind : ""
  statusElement.className = `status ${known}`.trim()
}
