export type ViewKey =
  "home" | "compose" | "schedule" | "analytics" | "collections" | "templates"

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
  "templates",
])

export function workspaceViewHref(view: ViewKey) {
  if (view === "home") return "/app"
  if (view === "compose") return "/app/compose"
  if (view === "schedule") return "/app/schedule"
  if (view === "analytics") return "/app/analytics"
  if (view === "collections") return "/app/collections"
  return "/app/templates"
}

export function legacyWorkspaceViewHref(input: {
  view: string
  templateId?: string
  runId?: string
}) {
  if (!viewKeys.has(input.view as ViewKey) || input.view === "home") return null
  const view = input.view as ViewKey
  const href = workspaceViewHref(view)
  if (view !== "templates") return href

  const search = new URLSearchParams()
  if (input.templateId) search.set("template", input.templateId)
  if (input.runId) search.set("run", input.runId)
  return `${href}${search.size ? `?${search}` : ""}`
}

export function workspaceLocationFromUrl(
  pathname: string,
  search = ""
): WorkspaceLocation {
  if (pathname === "/app/compose") return { view: "compose" }
  if (pathname === "/app/schedule") return { view: "schedule" }
  if (pathname.startsWith("/app/analytics")) return { view: "analytics" }
  if (pathname.startsWith("/app/collections/")) {
    const encodedId = pathname.slice("/app/collections/".length).split("/")[0]
    return {
      view: "collections",
      collectionId: safelyDecode(encodedId),
    }
  }
  if (pathname === "/app/collections") return { view: "collections" }
  if (pathname.startsWith("/app/templates")) return { view: "templates" }
  if (pathname === "/app/social-templates") return { view: "templates" }

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
