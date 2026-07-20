import "server-only"

export function internalToolsEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_INTERNAL_TOOLS === "true"
  )
}
