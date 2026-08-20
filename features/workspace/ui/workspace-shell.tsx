"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"

import {
  MobileNavigation,
  Sidebar,
  type ViewKey,
} from "@/components/realfarm/navigation"
import { workspaceViewHref } from "@/components/realfarm/workspace-navigation"

const UserSettingsModal = dynamic(
  () =>
    import("@/components/realfarm/user-settings-modal").then(
      (module) => module.UserSettingsModal
    ),
  { loading: () => <SettingsLoadingModal /> }
)

function SettingsLoadingModal() {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/35 p-4"
      role="status"
      aria-label="Loading settings"
    >
      <div className="h-72 w-full max-w-2xl animate-pulse rounded-xl bg-app-surface shadow-xl" />
    </div>
  )
}

type WorkspaceShellContextValue = {
  openSettings: () => void
}

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(
  null
)

export function useWorkspaceShell() {
  const context = useContext(WorkspaceShellContext)
  if (!context) {
    throw new Error("useWorkspaceShell must be used within WorkspaceShell")
  }
  return context
}

export function WorkspaceShell({
  children,
  onSocialAccountDisconnected,
  ownerName,
  view,
}: {
  children: React.ReactNode
  onSocialAccountDisconnected?: (integrationId: string) => void
  ownerName: string
  view: ViewKey
}) {
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const context = useMemo(() => ({ openSettings }), [openSettings])

  const navigate = useCallback(
    (nextView: ViewKey) => router.push(workspaceViewHref(nextView)),
    [router]
  )

  return (
    <WorkspaceShellContext value={context}>
      <main className="relative h-svh overflow-hidden bg-[#f7f7fa] text-app-text">
        <div className="flex h-svh">
          <Sidebar
            data={{ brand: { name: "LumenClip", owner: ownerName } }}
            view={view}
            onViewChange={navigate}
            onSettings={openSettings}
          />
          <MobileNavigation
            view={view}
            onViewChange={navigate}
            onSettings={openSettings}
          />
          <section className="min-w-0 flex-1 overflow-y-auto px-4 pt-[4.5rem] pb-4 sm:px-5 sm:pt-[4.75rem] sm:pb-5 md:py-5 lg:px-7">
            {children}
          </section>
        </div>
        {settingsOpen ? (
          <UserSettingsModal
            onSocialAccountDisconnected={onSocialAccountDisconnected}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
      </main>
    </WorkspaceShellContext>
  )
}
