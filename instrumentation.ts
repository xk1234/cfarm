export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const { registerLangfuse } = await import("./instrumentation.node")
    registerLangfuse()
  }
}
