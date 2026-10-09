export type ViewKey = "home" | "new" | "render" | "schedule" | "collections"

export type WorkspaceLocation = {
  view: ViewKey
  collectionId?: string
  renderId?: string
}

const queryViews = new Set<ViewKey>(["home", "new", "schedule", "collections"])

/** Views addressable through `?view=`; render details need an id path. */
export function isWorkspaceViewKey(value: unknown): value is ViewKey {
  return typeof value === "string" && queryViews.has(value as ViewKey)
}

export function workspaceViewHref(view: ViewKey) {
  if (view === "home" || view === "render") return "/app"
  if (view === "new") return "/app/new"
  if (view === "schedule") return "/app?view=schedule"
  return "/app/collections"
}

export function renderHref(renderId: string) {
  return `/app/renders/${encodeURIComponent(renderId)}`
}

export function workspaceLocationFromUrl(
  pathname: string,
  search = ""
): WorkspaceLocation {
  if (pathname.startsWith("/app/collections/")) {
    const encodedId = pathname.slice("/app/collections/".length).split("/")[0]
    return {
      view: "collections",
      collectionId: safelyDecode(encodedId),
    }
  }
  if (pathname === "/app/collections") return { view: "collections" }
  if (pathname === "/app/new") return { view: "new" }
  if (pathname.startsWith("/app/renders/")) {
    const encodedId = pathname.slice("/app/renders/".length).split("/")[0]
    if (encodedId) return { view: "render", renderId: safelyDecode(encodedId) }
  }

  const requestedView = new URLSearchParams(search).get("view")
  return {
    view: isWorkspaceViewKey(requestedView) ? requestedView : "home",
  }
}

function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
