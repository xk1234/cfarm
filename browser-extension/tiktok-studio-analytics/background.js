const STUDIO_SECTIONS = ["overview", "viewers", "engagement"]
const STEP_TIMEOUT_MINUTES = 0.5
const STEP_ALARM = "lumenclip-tiktok-studio-step"
const PENDING_SYNC_ALARM = "lumenclip-tiktok-studio-pending"
const pendingAdvances = new Set()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_CAPTURE_STATUS") {
    chrome.storage.local
      .get(["deviceConfig", "captureConfig", "captureStatus", "batchSync"])
      .then((state) =>
        sendResponse({
          configured: Boolean(state.deviceConfig || state.captureConfig),
          config: state.deviceConfig || state.captureConfig,
          status: state.captureStatus,
          sync: state.batchSync,
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
    void chrome.alarms.clear(STEP_ALARM)
    void chrome.alarms.clear(PENDING_SYNC_ALARM)
    chrome.storage.local
      .remove(["deviceConfig", "captureConfig", "captureStatus", "batchSync"])
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
  if (alarm.name === STEP_ALARM) {
    void handleStepTimeout()
    return
  }
  if (alarm.name === PENDING_SYNC_ALARM) {
    void autoStartPendingCapture()
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
  const deviceConfig = {
    version: 3,
    endpoint: endpoint.toString(),
    token: config.token,
    expiresAt: config.expiresAt,
  }
  await chrome.storage.local.set({ deviceConfig })
  await chrome.alarms.create(PENDING_SYNC_ALARM, {
    periodInMinutes: 1,
  })
  await activatePendingCapture({ autoStart })
  return deviceConfig
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
  await chrome.alarms.clear(STEP_ALARM)
  await chrome.storage.local.set({
    captureConfig: hydrated,
    captureStatus: {
      kind: "ready",
      message:
        hydrated.version === 2
          ? `Paired ${hydrated.posts.length} posts. Start account sync.`
          : "Paired. Open or refresh TikTok Studio.",
      updatedAt: new Date().toISOString(),
    },
  })
  await chrome.storage.local.remove("batchSync")
  return hydrated
}

async function activatePendingCapture({ autoStart }) {
  const { deviceConfig, batchSync } = await chrome.storage.local.get([
    "deviceConfig",
    "batchSync",
  ])
  if (!deviceConfig?.endpoint || !deviceConfig?.token) {
    throw new Error("Connect the companion from LumenClip first")
  }
  if (batchSync?.kind === "running") {
    return { pending: true, running: true }
  }
  const response = await fetch(deviceConfig.endpoint, {
    headers: { authorization: `Bearer ${deviceConfig.token}` },
  })
  const manifest = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(manifest.error || `Connection failed (${response.status})`)
  }
  if (!Array.isArray(manifest.posts) || manifest.posts.length === 0) {
    await chrome.storage.local.remove(["captureConfig", "batchSync"])
    await chrome.storage.local.set({
      captureStatus: {
        kind: "success",
        message: "Connected. No pending analytics syncs.",
        updatedAt: new Date().toISOString(),
      },
    })
    return { pending: false }
  }
  const captureConfig = {
    ...deviceConfig,
    captureId: manifest.captureId,
    captureKind: manifest.captureKind,
    posts: manifest.posts,
  }
  await chrome.storage.local.set({
    captureConfig,
    captureStatus: {
      kind: "ready",
      message: `${manifest.posts.length} pending post${manifest.posts.length === 1 ? "" : "s"} found.`,
      updatedAt: new Date().toISOString(),
    },
  })
  await chrome.storage.local.remove("batchSync")
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
      captureStatus: {
        kind: "error",
        message:
          error instanceof Error ? error.message : "Automatic sync failed",
        updatedAt: new Date().toISOString(),
      },
    })
  }
}

async function startBatchCapture() {
  const { captureConfig } = await chrome.storage.local.get("captureConfig")
  if (
    ![2, 3].includes(captureConfig?.version) ||
    !captureConfig.posts?.length
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
  await chrome.storage.local.set({ batchSync: sync })
  await navigateCurrentStep(captureConfig, sync)
}

async function forwardCapture(message, tabId) {
  const { captureConfig, batchSync } = await chrome.storage.local.get([
    "captureConfig",
    "batchSync",
  ])
  if (!captureConfig?.endpoint || !captureConfig?.token) return
  if (
    captureConfig.version === 2 &&
    !captureConfig.posts?.some(
      (post) => post.postId === studioPostId(message.studioUrl)
    )
  ) {
    return
  }
  try {
    const response = await fetch(captureConfig.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${captureConfig.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        captureId: captureConfig.captureId,
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
      [2, 3].includes(captureConfig.version) &&
      batchSync?.kind === "running"
    ) {
      await maybeAdvanceBatch({
        config: captureConfig,
        sync: batchSync,
        sections,
        studioUrl: message.studioUrl,
        tabId,
      })
      return
    }
    await chrome.storage.local.set({
      captureStatus: {
        kind: "success",
        message: `Captured ${sections.join(", ") || "analytics"}.`,
        sections,
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    await chrome.storage.local.set({
      captureStatus: {
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
  await chrome.storage.local.set({ batchSync: updated })
  await chrome.alarms.clear(STEP_ALARM)
  setTimeout(() => {
    void advanceBatch(false, stepKey).finally(() =>
      pendingAdvances.delete(stepKey)
    )
  }, 900)
}

async function advanceBatch(timedOut, expectedStep) {
  const { captureConfig, batchSync } = await chrome.storage.local.get([
    "captureConfig",
    "batchSync",
  ])
  if (
    ![2, 3].includes(captureConfig?.version) ||
    batchSync?.kind !== "running"
  ) {
    return
  }
  if (!timedOut && batchSync.advancedStep !== expectedStep) return
  let sync = { ...batchSync }
  const section = STUDIO_SECTIONS[sync.sectionIndex]
  if (timedOut && sync.retry < 1) {
    sync.retry += 1
    sync.advancedStep = ""
    sync.updatedAt = new Date().toISOString()
    await chrome.storage.local.set({ batchSync: sync })
    await navigateCurrentStep(captureConfig, sync)
    return
  }
  if (timedOut) {
    const post = captureConfig.posts[sync.itemIndex]
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
  if (sync.itemIndex >= captureConfig.posts.length) {
    sync.kind = "complete"
    sync.updatedAt = new Date().toISOString()
    await chrome.alarms.clear(STEP_ALARM)
    await chrome.storage.local.set({
      batchSync: sync,
      captureStatus: {
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
  await chrome.storage.local.set({ batchSync: sync })
  await navigateCurrentStep(captureConfig, sync)
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
    batchSync: next,
    captureStatus: {
      kind: "capturing",
      message: `Post ${sync.itemIndex + 1}/${config.posts.length} · ${section}`,
      current: sync.itemIndex + 1,
      total: config.posts.length,
      section,
      updatedAt: new Date().toISOString(),
    },
  })
  await chrome.alarms.create(STEP_ALARM, {
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
