export type ViewKey =
  "home" | "compose" | "schedule" | "analytics" | "collections" | "automations"

export type WorkspaceLocation = {
  view: ViewKey
  collectionId?: string
}

const viewKeys = new Set<ViewKey>([
  "home",
  "compose",
  "schedule",
  "analytics",
  "collections",
  "automations",
])

export function workspaceViewHref(view: ViewKey) {
  if (view === "home") return "/app"
  if (view === "compose") return "/app/compose"
  if (view === "schedule") return "/app?view=schedule"
  if (view === "analytics") return "/app/analytics"
  if (view === "collections") return "/app/collections"
  return "/app?view=automations"
}

export function workspaceLocationFromUrl(
  pathname: string,
  search = ""
): WorkspaceLocation {
  if (pathname === "/app/compose") return { view: "compose" }
  if (pathname.startsWith("/app/analytics")) return { view: "analytics" }
  if (pathname.startsWith("/app/collections/")) {
    const encodedId = pathname.slice("/app/collections/".length).split("/")[0]
    return {
      view: "collections",
      collectionId: safelyDecode(encodedId),
    }
  }
  if (pathname === "/app/collections") return { view: "collections" }
  const requestedView = new URLSearchParams(search).get("view")
  return {
    view:
      requestedView && viewKeys.has(requestedView as ViewKey)
        ? (requestedView as ViewKey)
        : "home",
  }
}

function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
