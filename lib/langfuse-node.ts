import { LangfuseSpanProcessor } from "@langfuse/otel"
import { NodeSDK } from "@opentelemetry/sdk-node"

import { LANGFUSE_APP_NAME } from "@/lib/langfuse-config"

let sdk: NodeSDK | undefined
let spanProcessor: LangfuseSpanProcessor | undefined
let shutdownPromise: Promise<void> | undefined

export function registerLangfuse(serviceName = LANGFUSE_APP_NAME) {
  if (sdk) return true
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return false
  }

  const processor = new LangfuseSpanProcessor({
    environment:
      process.env.LANGFUSE_TRACING_ENVIRONMENT ||
      (process.env.NODE_ENV === "production" ? "production" : "development"),
    release:
      process.env.LANGFUSE_RELEASE ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA,
    exportMode: process.env.VERCEL ? "immediate" : "batched",
    mediaUploadEnabled: false,
    mask: ({ data }) => maskSensitiveTraceData(data),
  })
  const nextSdk = new NodeSDK({
    serviceName,
    spanProcessors: [processor],
  })
  nextSdk.start()
  spanProcessor = processor
  sdk = nextSdk
  return true
}

export async function flushLangfuse() {
  await spanProcessor?.forceFlush()
}

export function shutdownLangfuse() {
  if (!sdk) return Promise.resolve()
  const currentSdk = sdk
  shutdownPromise ??= currentSdk.shutdown().finally(() => {
    if (sdk === currentSdk) {
      sdk = undefined
      spanProcessor = undefined
    }
    shutdownPromise = undefined
  })
  return shutdownPromise
}

export function maskSensitiveTraceData(data: unknown): unknown {
  if (typeof data !== "string") return data
  return data
    .replace(
      /("(?:authorization|apiKey|api_key|secret|token|password)"\s*:\s*")[^"]+/gi,
      "$1[REDACTED]"
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED SECRET]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED EMAIL]")
    .replace(/\b(?:\+?\d[\d .()-]{7,}\d)\b/g, "[REDACTED PHONE]")
}
