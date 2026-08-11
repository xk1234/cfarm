import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sdkMocks = vi.hoisted(() => ({
  forceFlush: vi.fn(async () => undefined),
  shutdown: vi.fn(async () => undefined),
  start: vi.fn(),
  processorOptions: [] as Array<Record<string, unknown>>,
  sdkOptions: [] as Array<Record<string, unknown>>,
}))

vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: class {
    constructor(options: Record<string, unknown>) {
      sdkMocks.processorOptions.push(options)
    }

    forceFlush() {
      return sdkMocks.forceFlush()
    }
  },
}))

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    constructor(options: Record<string, unknown>) {
      sdkMocks.sdkOptions.push(options)
    }

    start() {
      return sdkMocks.start()
    }

    shutdown() {
      return sdkMocks.shutdown()
    }
  },
}))

describe("Langfuse Node initialization", () => {
  beforeEach(() => {
    vi.resetModules()
    sdkMocks.forceFlush.mockClear()
    sdkMocks.shutdown.mockClear()
    sdkMocks.start.mockClear()
    sdkMocks.processorOptions.length = 0
    sdkMocks.sdkOptions.length = 0
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "")
    vi.stubEnv("LANGFUSE_SECRET_KEY", "")
  })

  afterEach(() => vi.unstubAllEnvs())

  it("is a no-op when Langfuse credentials are absent", async () => {
    const { registerLangfuse } = await import("@/lib/langfuse-node")

    expect(registerLangfuse("lumenclip-web")).toBe(false)
    expect(sdkMocks.start).not.toHaveBeenCalled()
  })

  it("initializes once, flushes, and cleanly reinitializes after shutdown", async () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "test-public-key")
    vi.stubEnv("LANGFUSE_SECRET_KEY", "test-secret-key")
    vi.stubEnv("LANGFUSE_TRACING_ENVIRONMENT", "test")
    vi.stubEnv("LANGFUSE_RELEASE", "release-1")
    const { flushLangfuse, registerLangfuse, shutdownLangfuse } =
      await import("@/lib/langfuse-node")

    expect(registerLangfuse("lumenclip-job-worker")).toBe(true)
    expect(registerLangfuse("ignored-second-name")).toBe(true)
    expect(sdkMocks.start).toHaveBeenCalledTimes(1)
    expect(sdkMocks.sdkOptions[0]).toMatchObject({
      serviceName: "lumenclip-job-worker",
    })
    expect(sdkMocks.processorOptions[0]).toMatchObject({
      environment: "test",
      release: "release-1",
      exportMode: "batched",
      mediaUploadEnabled: false,
    })

    await flushLangfuse()
    await shutdownLangfuse()
    expect(sdkMocks.forceFlush).toHaveBeenCalledTimes(1)
    expect(sdkMocks.shutdown).toHaveBeenCalledTimes(1)

    expect(registerLangfuse("lumenclip-template-scheduler")).toBe(true)
    expect(sdkMocks.start).toHaveBeenCalledTimes(2)
  })

  it("redacts secrets and personal contact data", async () => {
    const { maskSensitiveTraceData } = await import("@/lib/langfuse-node")
    const masked = maskSensitiveTraceData(
      '{"authorization":"Bearer private","email":"person@example.com","phone":"+1 212 555 0199","value":"sk-examplekey123456789"}'
    )

    expect(masked).not.toContain("Bearer private")
    expect(masked).not.toContain("person@example.com")
    expect(masked).not.toContain("212 555 0199")
    expect(masked).not.toContain("sk-examplekey123456789")
  })
})
