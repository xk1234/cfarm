const LUMENCLIP_ANALYTICS_URL = "https://cfarm-eight.vercel.app/app/analytics"

const pairButton = document.querySelector("#pair")
const openStudioButton = document.querySelector("#openStudio")
const reconnectButton = document.querySelector("#reconnect")
const clearButton = document.querySelector("#clear")
const statusElement = document.querySelector("#status")
const statusText = document.querySelector("#statusText")

void refreshStatus()

pairButton.addEventListener("click", openLumenClip)
reconnectButton.addEventListener("click", async () => {
  // Reconnecting has to drop the stored pairing first, otherwise LumenClip
  // hands back a config the extension merges onto a dead token.
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURE_CONFIG" })
  await openLumenClip()
})

openStudioButton.addEventListener("click", async () => {
  setBusy(true, "Checking for pending syncs…")
  const result = await chrome.runtime.sendMessage({
    type: "START_PENDING_CAPTURE",
  })
  setBusy(false)
  if (!result?.ok) {
    await refreshStatus(result?.error || "Sync failed")
    return
  }
  if (!result.pending) {
    showStatus("No pending syncs.", "success")
    return
  }
  window.close()
})

clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURE_CONFIG" })
  await refreshStatus()
})

async function openLumenClip() {
  await chrome.tabs.create({ url: LUMENCLIP_ANALYTICS_URL, active: true })
  window.close()
}

async function refreshStatus(overrideMessage) {
  const state = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATUS" })
  const paired = Boolean(state?.config)
  const message = overrideMessage || state?.status?.message
  const kind = overrideMessage ? "error" : state?.status?.kind

  // Exactly one primary action per state. An expired pairing is dropped by the
  // background worker, so it lands here as "not paired" with an error message —
  // one Connect button, not a Connect/Reconnect pair that do the same thing.
  pairButton.hidden = paired
  openStudioButton.hidden = !paired
  reconnectButton.hidden = !paired
  clearButton.hidden = !paired

  showStatus(message || (paired ? "Connected" : "Not connected"), kind)
}

function setBusy(busy, message) {
  for (const button of [
    pairButton,
    openStudioButton,
    reconnectButton,
    clearButton,
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
