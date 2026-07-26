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
const commentsReview = document.querySelector("#commentsReview")
const reviewCount = document.querySelector("#reviewCount")
const reviewSummary = document.querySelector("#reviewSummary")
const commentList = document.querySelector("#commentList")
const draftRepliesButton = document.querySelector("#draftReplies")
const approveAllButton = document.querySelector("#approveAll")
const sendApprovedButton = document.querySelector("#sendApproved")

let feature = "studio"
let currentReview = null

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
draftRepliesButton.addEventListener("click", () => {
  void runReviewAction(
    { type: "DRAFT_COMMENT_REPLIES" },
    "Drafting replies…",
    "Replies drafted."
  )
})
approveAllButton.addEventListener("click", () => {
  const approvals = reviewApprovals()
  if (!approvals.length) return
  const flagged = approvals.filter((item) => item.careful).length
  if (
    flagged > 0 &&
    !window.confirm(
      `Approve ${approvals.length} replies, including ${flagged} flagged ${flagged === 1 ? "reply" : "replies"}?`
    )
  ) {
    return
  }
  void approveReplies(approvals)
})
sendApprovedButton.addEventListener("click", () => {
  const draftIds = sendableDraftIds()
  if (
    !draftIds.length ||
    !window.confirm(
      `Send ${draftIds.length} approved ${draftIds.length === 1 ? "reply" : "replies"} through TikTok?`
    )
  ) {
    return
  }
  void runReviewAction(
    {
      type: "QUEUE_COMMENT_REPLIES",
      draftIds,
      confirmSend: true,
    },
    "Queueing approved replies…",
    "Approved replies queued. The extension will post them through TikTok."
  )
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
  document.body.classList.toggle("comments-mode", feature === "comments")
  contextLabel.textContent = config.label
  syncButton.textContent =
    feature === "comments" ? "Sync comment work" : "Sync now"
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
  commentsReview.hidden = feature !== "comments" || !paired
  if (feature === "comments" && paired) {
    await refreshReview()
  } else {
    currentReview = null
    commentList.replaceChildren()
  }
}

async function refreshReview() {
  const response = await chrome.runtime.sendMessage({
    type: "GET_COMMENTS_REVIEW",
  })
  if (!response?.ok) {
    currentReview = null
    renderReviewError(response?.error || "Comment review could not be loaded")
    return
  }
  currentReview = response.review
  renderReview(currentReview)
}

function renderReview(review) {
  const comments = Array.isArray(review?.comments) ? review.comments : []
  const drafts = Array.isArray(review?.drafts) ? review.drafts : []
  const approvals = Array.isArray(review?.approvals) ? review.approvals : []
  const sendResults = Array.isArray(review?.sendResults)
    ? review.sendResults
    : []
  const draftByComment = new Map(
    drafts.map((draft) => [draft.commentId, draft])
  )
  const approvalByDraft = new Map(
    approvals.map((approval) => [approval.draftId, approval])
  )
  const sendByDraft = new Map(
    sendResults.map((result) => [result.draftId, result])
  )

  reviewCount.textContent = `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`
  reviewSummary.textContent = review?.collection
    ? collectionSummary(review.collection, drafts.length, approvals.length)
    : "No active comment collection."
  commentList.replaceChildren()

  if (!comments.length) {
    commentList.append(
      element(
        "p",
        "empty-review",
        review?.collection?.status === "failed"
          ? "Comment capture failed. Use Sync comment work to retry from TikTok."
          : "Waiting for the extension to capture comments from TikTok."
      )
    )
  }

  for (const comment of comments) {
    const draft = draftByComment.get(comment.id)
    const approval = draft ? approvalByDraft.get(draft.id) : undefined
    const send = draft ? sendByDraft.get(draft.id) : undefined
    commentList.append(renderCommentCard({ comment, draft, approval, send }))
  }

  const missingDrafts = comments.filter(
    (comment) => !draftByComment.has(comment.id)
  ).length
  draftRepliesButton.hidden = comments.length === 0 || missingDrafts === 0
  draftRepliesButton.textContent =
    missingDrafts === comments.length
      ? `Draft ${missingDrafts} ${missingDrafts === 1 ? "reply" : "replies"}`
      : `Draft ${missingDrafts} missing ${missingDrafts === 1 ? "reply" : "replies"}`

  const approvable = reviewApprovals()
  approveAllButton.hidden = drafts.length === 0
  approveAllButton.disabled = approvable.length === 0
  approveAllButton.textContent = approvable.length
    ? `Approve all (${approvable.length})`
    : "All drafts approved"

  const sendable = sendableDraftIds()
  sendApprovedButton.hidden = approvals.length === 0
  sendApprovedButton.disabled = sendable.length === 0
  sendApprovedButton.textContent = sendable.length
    ? `Send approved (${sendable.length})`
    : "Approved replies queued"
}

function renderCommentCard({ comment, draft, approval, send }) {
  const card = element(
    "article",
    `comment-card${draft?.careful ? " careful" : ""}`
  )
  card.dataset.commentId = comment.id
  if (draft) card.dataset.draftId = draft.id
  if (draft?.careful) card.dataset.careful = "true"
  if (send?.status) card.dataset.sendStatus = send.status

  const header = element("div", "comment-header")
  header.append(
    element(
      "span",
      "comment-author",
      comment.displayName || comment.handle || "TikTok commenter"
    ),
    stateBadge(draft, approval, send)
  )
  card.append(header, element("p", "comment-text", comment.text || ""))

  if (!draft) {
    card.append(
      element(
        "p",
        "draft-placeholder",
        "Reply draft pending. Draft it here or wait for the capture sync to finish."
      )
    )
    return card
  }

  card.append(element("label", "response-label", "Drafted response"))
  const editor = element("textarea", "reply-editor")
  editor.value = approval?.approvedText || draft.text || ""
  editor.maxLength = 1000
  editor.disabled = send?.status === "sent" || send?.status === "pending"
  editor.setAttribute(
    "aria-label",
    `Drafted response to ${comment.displayName || comment.handle || "comment"}`
  )
  card.append(editor)

  const meta = element("div", "response-meta")
  const badges = element("div", "response-meta")
  badges.append(element("span", "badge", draft.style || "reply"))
  if (draft.careful) {
    badges.append(element("span", "badge flagged", "Read carefully"))
  }
  meta.append(badges)

  const heartLabel = element("label", "heart-control")
  const heart = element("input")
  heart.type = "checkbox"
  heart.className = "heart-toggle"
  heart.checked = approval?.heart === true
  heart.disabled = editor.disabled
  heartLabel.append(heart, document.createTextNode("Heart comment"))
  meta.append(heartLabel)
  card.append(meta)

  const controls = element("div", "approval-controls")
  const approve = element(
    "button",
    "compact secondary approve-reply",
    approval ? "Update approval" : "Approve reply"
  )
  approve.type = "button"
  approve.disabled = editor.disabled
  approve.addEventListener("click", () => {
    const choice = approvalFromCard(card)
    if (choice) void approveReplies([choice])
  })
  controls.append(approve)
  card.append(controls)
  return card
}

function stateBadge(draft, approval, send) {
  if (send?.status === "sent") return element("span", "badge sent", "Sent")
  if (send?.status === "pending")
    return element("span", "badge approved", "Queued")
  if (send?.status === "failed")
    return element("span", "badge failed", "Send failed")
  if (approval) return element("span", "badge approved", "Approved")
  if (draft) return element("span", "badge", "Draft")
  return element("span", "badge", "Captured")
}

function collectionSummary(collection, draftCount, approvalCount) {
  const captured = (collection.posts || []).reduce(
    (total, post) => total + Number(post.topLevelCaptured || 0),
    0
  )
  return `${titleCase(collection.status)} · ${captured} captured · ${draftCount} drafted · ${approvalCount} approved`
}

function reviewApprovals() {
  const existing = new Set(
    (currentReview?.approvals || []).map((approval) => approval.draftId)
  )
  return [...commentList.querySelectorAll(".comment-card[data-draft-id]")]
    .filter(
      (card) =>
        !existing.has(card.dataset.draftId) &&
        !["pending", "sent"].includes(card.dataset.sendStatus || "")
    )
    .map(approvalFromCard)
    .filter(Boolean)
}

function approvalFromCard(card) {
  const draftId = card.dataset.draftId
  const text = card.querySelector(".reply-editor")?.value.trim()
  if (!draftId || !text) return null
  return {
    draftId,
    text,
    heart: card.querySelector(".heart-toggle")?.checked === true,
    careful: card.dataset.careful === "true",
  }
}

function sendableDraftIds() {
  const sendByDraft = new Map(
    (currentReview?.sendResults || []).map((result) => [
      result.draftId,
      result.status,
    ])
  )
  return (currentReview?.approvals || [])
    .map((approval) => approval.draftId)
    .filter(
      (draftId) => !["pending", "sent"].includes(sendByDraft.get(draftId))
    )
}

async function approveReplies(approvals) {
  if (!approvals.length) return
  await runReviewAction(
    {
      type: "APPROVE_COMMENT_REPLIES",
      approvals: approvals.map(({ draftId, text, heart }) => ({
        draftId,
        text,
        heart,
      })),
    },
    `Approving ${approvals.length} ${approvals.length === 1 ? "reply" : "replies"}…`,
    `${approvals.length} ${approvals.length === 1 ? "reply" : "replies"} approved.`
  )
}

async function runReviewAction(message, pendingMessage, successMessage) {
  setBusy(true, pendingMessage)
  try {
    const response = await chrome.runtime.sendMessage(message)
    if (!response?.ok)
      throw new Error(response?.error || "Comment action failed")
    await refreshReview()
    showStatus(successMessage, "success")
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : "Comment action failed",
      "error"
    )
  } finally {
    setBusy(false)
  }
}

function renderReviewError(message) {
  reviewCount.textContent = ""
  reviewSummary.textContent = ""
  commentList.replaceChildren(element("p", "empty-review", message))
  draftRepliesButton.hidden = true
  approveAllButton.hidden = true
  sendApprovedButton.hidden = true
}

function element(tagName, className = "", text = "") {
  const node = document.createElement(tagName)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function titleCase(value) {
  const text = String(value || "pending").replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function setBusy(busy, message) {
  for (const button of [
    connectButton,
    syncButton,
    reconnectButton,
    clearButton,
    switchButton,
    draftRepliesButton,
    approveAllButton,
    sendApprovedButton,
    ...commentList.querySelectorAll("button"),
  ]) {
    button.disabled = busy
  }
  for (const input of commentList.querySelectorAll("textarea, input")) {
    if (busy) input.disabled = true
  }
  if (!busy && currentReview && feature === "comments") {
    renderReview(currentReview)
  }
  if (busy && message) showStatus(message, "running")
}

function showStatus(message, kind) {
  statusText.textContent = message
  const known = ["success", "error", "running"].includes(kind) ? kind : ""
  statusElement.className = `status ${known}`.trim()
}
