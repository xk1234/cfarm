export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const { registerLangfuse } = await import("./instrumentation.node")
    registerLangfuse()
  }

  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.ENABLE_LOCAL_AUTOMATION_WORKER !== "true"
  )
    return

  const { startLocalAutomationJobWorker } =
    await import("@/lib/local-automation-job-worker")
  startLocalAutomationJobWorker()
}
