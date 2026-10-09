export type ViewKey = "home" | "schedule" | "collections"

export type WorkspaceLocation = {
  view: ViewKey
  collectionId?: string
}

const viewKeys = new Set<ViewKey>(["home", "schedule", "collections"])

export function isWorkspaceViewKey(value: unknown): value is ViewKey {
  return typeof value === "string" && viewKeys.has(value as ViewKey)
}

export function workspaceViewHref(view: ViewKey) {
  if (view === "home") return "/app"
  if (view === "schedule") return "/app?view=schedule"
  return "/app/collections"
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
