import { readFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"

import { describe, expect, it, vi } from "vitest"

describe("TikTok Studio batch lifecycle", () => {
  it("cancels instead of recreating a Studio tab that the user closed", async () => {
    const harness = loadBackground({
      studioCaptureConfig: captureConfig(),
      studioBatchSync: runningSync({ tabId: 42 }),
    })
    harness.chrome.tabs.update.mockRejectedValue(new Error("No tab with id 42"))

    await harness.context.navigateCurrentStep(
      captureConfig(),
      runningSync({ tabId: 42 })
    )

    expect(harness.chrome.tabs.create).not.toHaveBeenCalled()
    expect(harness.state.studioBatchSync).toMatchObject({
      kind: "cancelled",
      tabId: null,
    })
    expect(harness.state.studioCancelledCaptureId).toBe("batch-1")
    expect(harness.state.studioCaptureStatus.message).toContain(
      "Studio tab was closed"
    )
  })

  it("cancels the tracked batch when its tab or Chrome window closes", async () => {
    const tabHarness = loadBackground({
      studioCaptureConfig: captureConfig(),
      studioBatchSync: runningSync({ tabId: 42 }),
    })
    tabHarness.listeners.removed(42, {
      isWindowClosing: false,
    })
    await vi.waitFor(() =>
      expect(tabHarness.state.studioBatchSync.kind).toBe("cancelled")
    )
    expect(tabHarness.state.studioBatchSync.kind).toBe("cancelled")
    expect(tabHarness.state.studioCaptureStatus.message).toContain(
      "Studio tab was closed"
    )

    const windowHarness = loadBackground({
      studioCaptureConfig: captureConfig(),
      studioBatchSync: runningSync({ tabId: 42 }),
    })
    windowHarness.listeners.startup()
    await vi.waitFor(() =>
      expect(windowHarness.state.studioBatchSync.kind).toBe("cancelled")
    )
    expect(windowHarness.state.studioCaptureStatus.message).toContain(
      "Chrome was closed"
    )
  })

  it("does not auto-start the same capture after Chrome restarts", async () => {
    const harness = loadBackground({
      studioDeviceConfig: deviceConfig(),
      studioCancelledCaptureId: "batch-1",
      studioBatchSync: { ...runningSync({ tabId: null }), kind: "cancelled" },
    })
    harness.context.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => captureManifest(),
    })

    const result = await harness.context.activatePendingCapture({
      autoStart: true,
    })

    expect(result).toMatchObject({ pending: true, cancelled: true, count: 1 })
    expect(harness.chrome.tabs.create).not.toHaveBeenCalled()
    expect(harness.state.studioCancelledCaptureId).toBe("batch-1")
  })

  it("allows an explicit Sync now action to restart a cancelled capture", async () => {
    const harness = loadBackground({
      studioDeviceConfig: deviceConfig(),
      studioCancelledCaptureId: "batch-1",
      studioBatchSync: { ...runningSync({ tabId: null }), kind: "cancelled" },
    })
    harness.context.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => captureManifest(),
    })
    harness.chrome.tabs.create.mockResolvedValue({ id: 88 })

    const result = await harness.context.activatePendingCapture({
      autoStart: true,
      restartCancelled: true,
    })

    expect(result).toMatchObject({ pending: true, started: true, count: 1 })
    expect(harness.chrome.tabs.create).toHaveBeenCalledOnce()
    expect(harness.state.studioCancelledCaptureId).toBeUndefined()
    expect(harness.state.studioBatchSync).toMatchObject({
      kind: "running",
      tabId: 88,
    })
  })
})

function loadBackground(initialState) {
  const state = structuredClone(initialState)
  const listeners = {}
  const storage = {
    get: vi.fn(async (keys) => {
      const requested = Array.isArray(keys) ? keys : [keys]
      return Object.fromEntries(
        requested
          .filter((key) => Object.hasOwn(state, key))
          .map((key) => [key, state[key]])
      )
    }),
    set: vi.fn(async (patch) => Object.assign(state, patch)),
    remove: vi.fn(async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key]
    }),
  }
  const chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener) => (listeners.message = listener)),
      },
      onStartup: {
        addListener: vi.fn((listener) => (listeners.startup = listener)),
      },
    },
    alarms: {
      clear: vi.fn(async () => true),
      create: vi.fn(async () => undefined),
      onAlarm: {
        addListener: vi.fn((listener) => (listeners.alarm = listener)),
      },
    },
    storage: { local: storage },
    tabs: {
      create: vi.fn(async () => ({ id: 1 })),
      get: vi.fn(async () => ({ id: 1, status: "complete" })),
      query: vi.fn(async () => []),
      reload: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      sendMessage: vi.fn(async () => ({ ok: true })),
      update: vi.fn(async () => ({ id: 1 })),
      onRemoved: {
        addListener: vi.fn((listener) => (listeners.removed = listener)),
      },
      onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  }
  const context = vm.createContext({
    chrome,
    clearTimeout,
    console,
    Date,
    fetch: vi.fn(),
    setTimeout,
    URL,
  })
  vm.runInContext(
    readFileSync(
      path.join(process.cwd(), "browser-extension/background.js"),
      "utf8"
    ),
    context
  )
  return { chrome, context, listeners, state }
}

function deviceConfig() {
  return {
    version: 3,
    endpoint: "https://lumenclip.test/capture",
    token: "token",
  }
}

function captureConfig() {
  return {
    ...deviceConfig(),
    captureId: "batch-1",
    captureKind: "batch",
    posts: [
      {
        importId: "import-1",
        postId: "7662360324313517330",
        studioUrl:
          "https://www.tiktok.com/tiktokstudio/analytics/7662360324313517330/overview",
      },
    ],
  }
}

function captureManifest() {
  const config = captureConfig()
  return {
    captureId: config.captureId,
    captureKind: config.captureKind,
    posts: config.posts,
  }
}

function runningSync(overrides = {}) {
  return {
    kind: "running",
    itemIndex: 0,
    sectionIndex: 0,
    retry: 0,
    completed: 0,
    errors: [],
    tabId: null,
    updatedAt: "2026-08-02T14:00:00.000Z",
    ...overrides,
  }
}
