export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.ENABLE_LOCAL_AUTOMATION_WORKER !== "true"
  ) {
    return
  }
  const { startLocalAutomationJobWorker } =
    await import("@/lib/local-automation-job-worker")
  startLocalAutomationJobWorker()
}
