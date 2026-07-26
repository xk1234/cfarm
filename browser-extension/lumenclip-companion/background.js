const STUDIO_SECTIONS = ["overview", "viewers", "engagement"]
const STEP_TIMEOUT_MINUTES = 0.5
const STUDIO_STEP_ALARM = "lumenclip-tiktok-studio-step"
const STUDIO_PENDING_SYNC_ALARM = "lumenclip-tiktok-studio-pending"
const COMMENTS_POLL_ALARM = "lumenclip-tiktok-comments-poll"
const COMMENTS_STEP_TIMEOUT_MS = 30_000
const pendingAdvances = new Set()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_CAPTURE_STATUS") {
    chrome.storage.local
      .get([
        "studioDeviceConfig",
        "studioCaptureConfig",
        "studioCaptureStatus",
        "studioBatchSync",
      ])
      .then((state) =>
        sendResponse({
          configured: Boolean(
            state.studioDeviceConfig || state.studioCaptureConfig
          ),
          config: state.studioDeviceConfig || state.studioCaptureConfig,
          status: state.studioCaptureStatus,
          sync: state.studioBatchSync,
        })
      )
    return true
  }

  if (message?.type === "SET_DEVICE_CONFIG") {
    void configureDevice(message.config, {
      autoStart: message.autoStart === true,
    })
      .then((config) => sendResponse({ ok: true, config }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Connection failed",
        })
      )
    return true
  }

  if (message?.type === "START_PENDING_CAPTURE") {
    void activatePendingCapture({ autoStart: true })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Account sync failed",
        })
      )
    return true
  }

  if (message?.type === "SET_CAPTURE_CONFIG") {
    void configureCapture(message.config)
      .then((config) => sendResponse({ ok: true, config }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Pairing failed",
        })
      )
    return true
  }

  if (message?.type === "START_BATCH_CAPTURE") {
    void startBatchCapture()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Account sync failed",
        })
      )
    return true
  }

  if (message?.type === "CLEAR_CAPTURE_CONFIG") {
    void chrome.alarms.clear(STUDIO_STEP_ALARM)
    void chrome.alarms.clear(STUDIO_PENDING_SYNC_ALARM)
    chrome.storage.local
      .remove([
        "studioDeviceConfig",
        "studioCaptureConfig",
        "studioCaptureStatus",
        "studioBatchSync",
      ])
      .then(() => sendResponse({ ok: true }))
    return true
  }

  if (message?.type === "GET_COMMENTS_STATUS") {
    chrome.storage.local
      .get(["commentsConfig", "commentsStatus", "commentsRun"])
      .then((state) =>
        sendResponse({
          configured: Boolean(state.commentsConfig),
          config: state.commentsConfig,
          status: state.commentsStatus,
          run: state.commentsRun,
        })
      )
    return true
  }

  if (message?.type === "SET_CONFIG") {
    void configureComments(message.config)
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Comments connection failed",
        })
      )
    return true
  }

  if (message?.type === "START_COMMENTS_SYNC") {
    void runPendingComments().catch(() => undefined)
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === "CLEAR_COMMENTS_CONFIG") {
    void chrome.alarms.clear(COMMENTS_POLL_ALARM)
    chrome.storage.local
      .remove(["commentsConfig", "commentsStatus", "commentsRun"])
      .then(() => sendResponse({ ok: true }))
    return true
  }

  if (message?.type !== "TIKTOK_STUDIO_ANALYTICS_CAPTURE") return false
  const tabUrl = sender.tab?.url || message.studioUrl || ""
  if (
    !/^https:\/\/www\.tiktok\.com\/tiktokstudio\/analytics\/\d+\//.test(tabUrl)
  ) {
    sendResponse({ ok: false })
    return false
  }

  void forwardCapture(message, sender.tab?.id)
  sendResponse({ ok: true })
  return false
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STUDIO_STEP_ALARM) {
    void handleStepTimeout()
    return
  }
  if (alarm.name === STUDIO_PENDING_SYNC_ALARM) {
    void autoStartPendingCapture()
    return
  }
  if (alarm.name === COMMENTS_POLL_ALARM) {
    void runPendingComments().catch(() => undefined)
  }
})

async function configureDevice(config, { autoStart }) {
  if (
    config?.version !== 3 ||
    typeof config.endpoint !== "string" ||
    typeof config.token !== "string"
  ) {
    throw new Error("Invalid LumenClip companion connection")
  }
  const endpoint = new URL(config.endpoint)
  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw new Error("Invalid LumenClip endpoint")
  }
  const studioDeviceConfig = {
    version: 3,
    endpoint: endpoint.toString(),
    token: config.token,
    expiresAt: config.expiresAt,
  }
  await chrome.storage.local.set({ studioDeviceConfig })
  await chrome.alarms.create(STUDIO_PENDING_SYNC_ALARM, {
    periodInMinutes: 1,
  })
  await activatePendingCapture({ autoStart })
  return studioDeviceConfig
}

async function configureCapture(config) {
  let hydrated = config
  if (config?.version === 2) {
    const response = await fetch(config.endpoint, {
      headers: { authorization: `Bearer ${config.token}` },
    })
    const manifest = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(manifest.error || `Pairing failed (${response.status})`)
    }
    if (!Array.isArray(manifest.posts) || manifest.posts.length === 0) {
      throw new Error("This sync has no linked TikTok posts")
    }
    hydrated = { ...config, posts: manifest.posts }
  }
  await chrome.alarms.clear(STUDIO_STEP_ALARM)
  await chrome.storage.local.set({
    studioCaptureConfig: hydrated,
    studioCaptureStatus: {
      kind: "ready",
      message:
        hydrated.version === 2
          ? `Paired ${hydrated.posts.length} posts. Start account sync.`
          : "Paired. Open or refresh TikTok Studio.",
      updatedAt: new Date().toISOString(),
    },
  })
  await chrome.storage.local.remove("studioBatchSync")
  return hydrated
}

async function activatePendingCapture({ autoStart }) {
  const { studioDeviceConfig, studioBatchSync } =
    await chrome.storage.local.get(["studioDeviceConfig", "studioBatchSync"])
  if (!studioDeviceConfig?.endpoint || !studioDeviceConfig?.token) {
    throw new Error("Connect the companion from LumenClip first")
  }
  if (studioBatchSync?.kind === "running") {
    return { pending: true, running: true }
  }
  const response = await fetch(studioDeviceConfig.endpoint, {
    headers: { authorization: `Bearer ${studioDeviceConfig.token}` },
  })
  const manifest = await response.json().catch(() => ({}))
  if (!response.ok) {
    // A rejected token can never recover on its own. Leaving studioDeviceConfig in
    // place kept the popup in a paired state with no way back, so the only
    // visible action was one that would fail again. Drop it and ask to
    // reconnect instead.
    if (isDeadPairing(response.status, manifest.error)) {
      await forgetPairing(
        "This connection expired. Reconnect from LumenClip to continue."
      )
      throw new Error(
        "This connection expired. Reconnect from LumenClip to continue."
      )
    }
    throw new Error(manifest.error || `Connection failed (${response.status})`)
  }
  if (!Array.isArray(manifest.posts) || manifest.posts.length === 0) {
    await chrome.storage.local.remove([
      "studioCaptureConfig",
      "studioBatchSync",
    ])
    await chrome.storage.local.set({
      studioCaptureStatus: {
        kind: "success",
        message: "Connected. No pending analytics syncs.",
        updatedAt: new Date().toISOString(),
      },
    })
    return { pending: false }
  }
  const studioCaptureConfig = {
    ...studioDeviceConfig,
    captureId: manifest.captureId,
    captureKind: manifest.captureKind,
    posts: manifest.posts,
  }
  await chrome.storage.local.set({
    studioCaptureConfig,
    studioCaptureStatus: {
      kind: "ready",
      message: `${manifest.posts.length} pending post${manifest.posts.length === 1 ? "" : "s"} found.`,
      updatedAt: new Date().toISOString(),
    },
  })
  await chrome.storage.local.remove("studioBatchSync")
  if (!autoStart) return { pending: true, count: manifest.posts.length }
  if (manifest.captureKind === "batch" || manifest.posts.length > 1) {
    await startBatchCapture()
  } else {
    await chrome.tabs.create({ url: manifest.posts[0].studioUrl, active: true })
  }
  return { pending: true, started: true, count: manifest.posts.length }
}

async function autoStartPendingCapture() {
  try {
    await activatePendingCapture({ autoStart: true })
  } catch (error) {
    await chrome.storage.local.set({
      studioCaptureStatus: {
        kind: "error",
        message:
          error instanceof Error ? error.message : "Automatic sync failed",
        updatedAt: new Date().toISOString(),
      },
    })
  }
}

async function startBatchCapture() {
  const { studioCaptureConfig } = await chrome.storage.local.get(
    "studioCaptureConfig"
  )
  if (
    ![2, 3].includes(studioCaptureConfig?.version) ||
    !studioCaptureConfig.posts?.length
  ) {
    throw new Error("No pending account sync was found")
  }
  const sync = {
    kind: "running",
    itemIndex: 0,
    sectionIndex: 0,
    retry: 0,
    completed: 0,
    errors: [],
    tabId: null,
    updatedAt: new Date().toISOString(),
  }
  await chrome.storage.local.set({ studioBatchSync: sync })
  await navigateCurrentStep(studioCaptureConfig, sync)
}

async function forwardCapture(message, tabId) {
  const { studioCaptureConfig, studioBatchSync } =
    await chrome.storage.local.get(["studioCaptureConfig", "studioBatchSync"])
  if (!studioCaptureConfig?.endpoint || !studioCaptureConfig?.token) return
  if (
    studioCaptureConfig.version === 2 &&
    !studioCaptureConfig.posts?.some(
      (post) => post.postId === studioPostId(message.studioUrl)
    )
  ) {
    return
  }
  try {
    const response = await fetch(studioCaptureConfig.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${studioCaptureConfig.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        captureId: studioCaptureConfig.captureId,
        studioUrl: message.studioUrl,
        payload: message.payload,
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(result.error || `Import failed (${response.status})`)
    }
    const sections = Array.isArray(result.capturedSections)
      ? result.capturedSections
      : []
    if (
      [2, 3].includes(studioCaptureConfig.version) &&
      studioBatchSync?.kind === "running"
    ) {
      await maybeAdvanceBatch({
        config: studioCaptureConfig,
        sync: studioBatchSync,
        sections,
        studioUrl: message.studioUrl,
        tabId,
      })
      return
    }
    await chrome.storage.local.set({
      studioCaptureStatus: {
        kind: "success",
        message: `Captured ${sections.join(", ") || "analytics"}.`,
        sections,
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    await chrome.storage.local.set({
      studioCaptureStatus: {
        kind: "error",
        message: error instanceof Error ? error.message : "Import failed",
        updatedAt: new Date().toISOString(),
      },
    })
  }
}

async function maybeAdvanceBatch({ config, sync, sections, studioUrl, tabId }) {
  const post = config.posts[sync.itemIndex]
  const section = STUDIO_SECTIONS[sync.sectionIndex]
  if (
    !post ||
    studioPostId(studioUrl) !== post.postId ||
    studioSection(studioUrl) !== section ||
    !sections.includes(section)
  ) {
    return
  }
  const stepKey = `${sync.itemIndex}:${sync.sectionIndex}`
  if (sync.advancedStep === stepKey || pendingAdvances.has(stepKey)) return
  pendingAdvances.add(stepKey)
  const updated = {
    ...sync,
    tabId: tabId || sync.tabId,
    advancedStep: stepKey,
    updatedAt: new Date().toISOString(),
  }
  await chrome.storage.local.set({ studioBatchSync: updated })
  await chrome.alarms.clear(STUDIO_STEP_ALARM)
  setTimeout(() => {
    void advanceBatch(false, stepKey).finally(() =>
      pendingAdvances.delete(stepKey)
    )
  }, 900)
}

async function advanceBatch(timedOut, expectedStep) {
  const { studioCaptureConfig, studioBatchSync } =
    await chrome.storage.local.get(["studioCaptureConfig", "studioBatchSync"])
  if (
    ![2, 3].includes(studioCaptureConfig?.version) ||
    studioBatchSync?.kind !== "running"
  ) {
    return
  }
  if (!timedOut && studioBatchSync.advancedStep !== expectedStep) return
  let sync = { ...studioBatchSync }
  const section = STUDIO_SECTIONS[sync.sectionIndex]
  if (timedOut && sync.retry < 1) {
    sync.retry += 1
    sync.advancedStep = ""
    sync.updatedAt = new Date().toISOString()
    await chrome.storage.local.set({ studioBatchSync: sync })
    await navigateCurrentStep(studioCaptureConfig, sync)
    return
  }
  if (timedOut) {
    const post = studioCaptureConfig.posts[sync.itemIndex]
    sync.errors = [
      ...sync.errors,
      { postId: post?.postId, section, message: `${section} did not load` },
    ]
  }
  sync.sectionIndex += 1
  sync.retry = 0
  sync.advancedStep = ""
  if (sync.sectionIndex >= STUDIO_SECTIONS.length) {
    sync.sectionIndex = 0
    sync.itemIndex += 1
    sync.completed += 1
  }
  if (sync.itemIndex >= studioCaptureConfig.posts.length) {
    sync.kind = "complete"
    sync.updatedAt = new Date().toISOString()
    await chrome.alarms.clear(STUDIO_STEP_ALARM)
    await chrome.storage.local.set({
      studioBatchSync: sync,
      studioCaptureStatus: {
        kind: sync.errors.length ? "warning" : "success",
        message: sync.errors.length
          ? `Finished ${sync.completed} posts with ${sync.errors.length} skipped sections.`
          : `Finished capturing ${sync.completed} posts.`,
        updatedAt: new Date().toISOString(),
      },
    })
    return
  }
  sync.updatedAt = new Date().toISOString()
  await chrome.storage.local.set({ studioBatchSync: sync })
  await navigateCurrentStep(studioCaptureConfig, sync)
}

async function navigateCurrentStep(config, sync) {
  const post = config.posts[sync.itemIndex]
  const section = STUDIO_SECTIONS[sync.sectionIndex]
  if (!post || !section) return
  const url = `https://www.tiktok.com/tiktokstudio/analytics/${post.postId}/${section}`
  let tabId = sync.tabId
  try {
    if (tabId) {
      await chrome.tabs.update(tabId, { url, active: true })
    } else {
      const tab = await chrome.tabs.create({ url, active: true })
      tabId = tab.id
    }
  } catch {
    const tab = await chrome.tabs.create({ url, active: true })
    tabId = tab.id
  }
  const next = {
    ...sync,
    tabId,
    updatedAt: new Date().toISOString(),
  }
  await chrome.storage.local.set({
    studioBatchSync: next,
    studioCaptureStatus: {
      kind: "capturing",
      message: `Post ${sync.itemIndex + 1}/${config.posts.length} · ${section}`,
      current: sync.itemIndex + 1,
      total: config.posts.length,
      section,
      updatedAt: new Date().toISOString(),
    },
  })
  await chrome.alarms.create(STUDIO_STEP_ALARM, {
    delayInMinutes: STEP_TIMEOUT_MINUTES,
  })
}

async function handleStepTimeout() {
  await advanceBatch(true)
}

function studioPostId(value) {
  try {
    return new URL(value).pathname.match(
      /^\/tiktokstudio\/analytics\/(\d+)\//
    )?.[1]
  } catch {
    return undefined
  }
}

function studioSection(value) {
  try {
    return new URL(value).pathname.match(
      /^\/tiktokstudio\/analytics\/\d+\/([^/?]+)/
    )?.[1]
  } catch {
    return undefined
  }
}

// A capture token is signed server-side; once the signing secret moves, every
// token minted under the old one is permanently unverifiable.
function isDeadPairing(status, error) {
  return (
    status === 401 ||
    status === 403 ||
    /capture token|expired|unauthor/i.test(String(error ?? ""))
  )
}

async function forgetPairing(message) {
  await chrome.alarms.clear(STUDIO_STEP_ALARM)
  await chrome.storage.local.remove([
    "studioDeviceConfig",
    "studioCaptureConfig",
    "studioBatchSync",
  ])
  await chrome.storage.local.set({
    studioCaptureStatus: {
      kind: "error",
      message,
      updatedAt: new Date().toISOString(),
    },
  })
}

async function configureComments(config) {
  if (
    config?.version !== 1 ||
    typeof config.endpoint !== "string" ||
    typeof config.token !== "string"
  ) {
    throw new Error("Invalid companion configuration")
  }
  const endpoint = new URL(config.endpoint)
  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw new Error("Invalid endpoint")
  }
  const commentsConfig = {
    ...config,
    endpoint: endpoint.toString(),
  }
  await chrome.storage.local.set({
    commentsConfig,
    commentsStatus: {
      kind: "success",
      message: "Connected. Checking for comment work.",
      updatedAt: new Date().toISOString(),
    },
  })
  await chrome.alarms.create(COMMENTS_POLL_ALARM, {
    periodInMinutes: 1,
  })
  void runPendingComments().catch(() => undefined)
}

async function runPendingComments() {
  const { commentsConfig, commentsRun } = await chrome.storage.local.get([
    "commentsConfig",
    "commentsRun",
  ])
  if (!commentsConfig || commentsRun?.running) return

  try {
    const response = await fetch(commentsConfig.endpoint, {
      headers: { authorization: `Bearer ${commentsConfig.token}` },
    })
    const manifest = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(manifest.error || `Manifest failed (${response.status})`)
    }
    const posts = manifest.collection?.posts || []
    const pending = posts.filter(
      (post) => post.status === "pending" || post.status === "capturing"
    )
    const sends = Array.isArray(manifest.sends) ? manifest.sends : []
    if (!pending.length && !sends.length) {
      await setCommentsStatus("success", "Connected. No pending comment work.")
      return
    }

    await chrome.storage.local.set({
      commentsRun: {
        running: true,
        startedAt: new Date().toISOString(),
      },
      commentsStatus: {
        kind: "running",
        message: `Syncing ${pending.length} post${pending.length === 1 ? "" : "s"} and ${sends.length} approved repl${sends.length === 1 ? "y" : "ies"}.`,
        updatedAt: new Date().toISOString(),
      },
    })
    try {
      for (const post of pending) {
        await runCommentsPost(
          commentsConfig,
          manifest.collection.id,
          post,
          "collect"
        )
      }
      for (const send of sends) {
        const post = posts.find((item) => item.postId === send.comment?.postId)
        if (post && send.comment) {
          await runCommentsPost(
            commentsConfig,
            manifest.collection.id,
            post,
            "send",
            send
          )
        }
      }
      await setCommentsStatus("success", "Comment sync finished.")
    } finally {
      await chrome.storage.local.remove("commentsRun")
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Comments sync failed"
    await setCommentsStatus("error", message)
    throw error
  }
}

async function runCommentsPost(config, collectionId, post, mode, send) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    const tab = await chrome.tabs.create({ url: post.url, active: true })
    try {
      await waitForCommentsTab(tab.id)
      const result = await withCommentsTimeout(
        chrome.tabs.sendMessage(tab.id, {
          type: "RUN_TIKTOK_COMMENTS",
          mode,
          send,
        }),
        COMMENTS_STEP_TIMEOUT_MS
      )
      if (result?.error) throw new Error(result.error)
      const payload =
        mode === "collect"
          ? {
              collectionId,
              postId: post.postId,
              comments: result.comments,
              complete: result.complete,
            }
          : {
              collectionId,
              postId: post.postId,
              comments: [],
              sendResults: [{ sendId: send.id, status: "sent" }],
            }
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Ingest failed")
      }
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
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        collectionId,
        postId: post.postId,
        comments: [],
        error: lastError?.message || "Capture failed",
      }),
    })
  }
}

function waitForCommentsTab(tabId) {
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

function withCommentsTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TikTok step timed out")), ms)
    ),
  ])
}

function setCommentsStatus(kind, message) {
  return chrome.storage.local.set({
    commentsStatus: {
      kind,
      message,
      updatedAt: new Date().toISOString(),
    },
  })
}
