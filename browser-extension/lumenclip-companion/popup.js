const LUMENCLIP_ANALYTICS_URL = "https://cfarm-eight.vercel.app/app/analytics"
const LUMENCLIP_COMMENTS_URL =
  "https://cfarm-eight.vercel.app/app/tiktok-comments"

const studioPairButton = document.querySelector("#studioPair")
const studioSyncButton = document.querySelector("#studioSync")
const studioReconnectButton = document.querySelector("#studioReconnect")
const studioClearButton = document.querySelector("#studioClear")
const studioStatusElement = document.querySelector("#studioStatus")
const studioStatusText = document.querySelector("#studioStatusText")

const commentsPairButton = document.querySelector("#commentsPair")
const commentsSyncButton = document.querySelector("#commentsSync")
const commentsReconnectButton = document.querySelector("#commentsReconnect")
const commentsClearButton = document.querySelector("#commentsClear")
const commentsStatusElement = document.querySelector("#commentsStatus")
const commentsStatusText = document.querySelector("#commentsStatusText")

void refreshStatus()

studioPairButton.addEventListener("click", () => openLumenClip("studio"))
studioReconnectButton.addEventListener("click", async () => {
  // Reconnecting has to drop the stored pairing first, otherwise LumenClip
  // hands back a config the extension merges onto a dead token.
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURE_CONFIG" })
  await openLumenClip("studio")
})

studioSyncButton.addEventListener("click", async () => {
  setBusy("studio", true, "Checking for pending syncs…")
  const result = await chrome.runtime.sendMessage({
    type: "START_PENDING_CAPTURE",
  })
  setBusy("studio", false)
  if (!result?.ok) {
    await refreshStudioStatus(result?.error || "Sync failed")
    return
  }
  if (!result.pending) {
    showStatus(
      studioStatusElement,
      studioStatusText,
      "No pending syncs.",
      "success"
    )
    return
  }
  window.close()
})

studioClearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURE_CONFIG" })
  await refreshStudioStatus()
})

commentsPairButton.addEventListener("click", () => openLumenClip("comments"))
commentsReconnectButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_COMMENTS_CONFIG" })
  await openLumenClip("comments")
})

commentsSyncButton.addEventListener("click", async () => {
  setBusy("comments", true, "Checking for pending comment work…")
  const result = await chrome.runtime.sendMessage({
    type: "START_COMMENTS_SYNC",
  })
  if (!result?.ok) {
    setBusy("comments", false)
    await refreshCommentsStatus(result?.error || "Comment sync failed")
    return
  }
  window.close()
})

commentsClearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_COMMENTS_CONFIG" })
  await refreshCommentsStatus()
})

async function openLumenClip(feature) {
  const url =
    feature === "comments" ? LUMENCLIP_COMMENTS_URL : LUMENCLIP_ANALYTICS_URL
  await chrome.tabs.create({ url, active: true })
  window.close()
}

async function refreshStatus() {
  await Promise.all([refreshStudioStatus(), refreshCommentsStatus()])
}

async function refreshStudioStatus(overrideMessage) {
  const state = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATUS" })
  const paired = Boolean(state?.config)
  const message = overrideMessage || state?.status?.message
  const kind = overrideMessage ? "error" : state?.status?.kind
  const running =
    state?.sync?.kind === "running" || state?.status?.kind === "capturing"

  // Exactly one primary action per state. An expired pairing is dropped by the
  // background worker, so it lands here as "not paired" with an error message —
  // one Connect button, not a Connect/Reconnect pair that do the same thing.
  studioPairButton.hidden = paired
  studioSyncButton.hidden = !paired
  studioReconnectButton.hidden = !paired
  studioClearButton.hidden = !paired
  for (const button of [
    studioSyncButton,
    studioReconnectButton,
    studioClearButton,
  ]) {
    button.disabled = running
  }

  showStatus(
    studioStatusElement,
    studioStatusText,
    message || (paired ? "Connected" : "Not connected"),
    kind
  )
}

async function refreshCommentsStatus(overrideMessage) {
  const state = await chrome.runtime.sendMessage({
    type: "GET_COMMENTS_STATUS",
  })
  const paired = Boolean(state?.config)
  const message = overrideMessage || state?.status?.message
  const kind = overrideMessage
    ? "error"
    : state?.run?.running
      ? "running"
      : state?.status?.kind
  const running = state?.run?.running === true

  commentsPairButton.hidden = paired
  commentsSyncButton.hidden = !paired
  commentsReconnectButton.hidden = !paired
  commentsClearButton.hidden = !paired
  for (const button of [
    commentsSyncButton,
    commentsReconnectButton,
    commentsClearButton,
  ]) {
    button.disabled = running
  }

  showStatus(
    commentsStatusElement,
    commentsStatusText,
    message || (paired ? "Connected" : "Not connected"),
    kind
  )
}

function setBusy(feature, busy, message) {
  const buttons =
    feature === "comments"
      ? [
          commentsPairButton,
          commentsSyncButton,
          commentsReconnectButton,
          commentsClearButton,
        ]
      : [
          studioPairButton,
          studioSyncButton,
          studioReconnectButton,
          studioClearButton,
        ]
  for (const button of buttons) {
    button.disabled = busy
  }
  if (busy && message) {
    const status =
      feature === "comments" ? commentsStatusElement : studioStatusElement
    const text = feature === "comments" ? commentsStatusText : studioStatusText
    showStatus(status, text, message, "running")
  }
}

function showStatus(element, text, message, kind) {
  text.textContent = message
  const statusKind =
    kind === "capturing"
      ? "running"
      : kind === "ready"
        ? "success"
        : kind === "warning"
          ? "error"
          : kind
  const known = ["success", "error", "running"].includes(statusKind)
    ? statusKind
    : ""
  element.className = `status ${known}`.trim()
}
