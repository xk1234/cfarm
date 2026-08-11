import { registerLangfuse as registerNodeLangfuse } from "@/lib/langfuse-node"

export function registerLangfuse() {
  return registerNodeLangfuse("lumenclip-web")
}

export { flushLangfuse, shutdownLangfuse } from "@/lib/langfuse-node"
