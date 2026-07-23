const pairButton = document.querySelector("#pair")
const openStudioButton = document.querySelector("#openStudio")
const clearButton = document.querySelector("#clear")
const statusElement = document.querySelector("#status")

void refreshStatus()

pairButton.addEventListener("click", async () => {
  await chrome.tabs.create({
    url: "https://cfarm-eight.vercel.app/app/analytics",
    active: true,
  })
  window.close()
})

openStudioButton.addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({
    type: "START_PENDING_CAPTURE",
  })
  if (!result?.ok) {
    showStatus(result?.error || "Account sync failed", "error")
    return
  }
  if (!result.pending) {
    showStatus("Connected. No pending analytics syncs.", "success")
    return
  }
  window.close()
})

clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURE_CONFIG" })
  await refreshStatus()
})

async function refreshStatus() {
  const state = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATUS" })
  openStudioButton.hidden = !state.config
  openStudioButton.textContent = "Check for pending sync"
  clearButton.hidden = !state.config
  pairButton.hidden = Boolean(state.config)
  showStatus(
    state.status?.message || (state.config ? "Connected" : "Not connected"),
    state.status?.kind
  )
}

function showStatus(message, kind) {
  statusElement.textContent = message
  statusElement.className = `status ${kind === "success" ? "success" : kind === "error" ? "error" : ""}`
}
