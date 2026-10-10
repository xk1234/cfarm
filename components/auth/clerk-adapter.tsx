"use client"

/**
 * Clerk UI behind a small adapter so the local e2e seam (lib/e2e-auth.ts) can
 * render the app without Clerk keys. In production no `E2eAuthProvider` is
 * mounted, the context is null, and every export renders the Clerk component
 * unchanged.
 */
import { createContext, useContext, type ComponentProps, type ReactNode } from "react"

import {
  Show as ClerkShow,
  SignInButton as ClerkSignInButton,
  SignUpButton as ClerkSignUpButton,
  UserButton as ClerkUserButton,
} from "@clerk/nextjs"

import type { E2eUser } from "@/lib/e2e-auth"

const E2eUserContext = createContext<E2eUser | null>(null)

export function E2eAuthProvider({ user, children }: { user: E2eUser; children: ReactNode }) {
  return <E2eUserContext.Provider value={user}>{children}</E2eUserContext.Provider>
}

/** The seam's user, or null under Clerk. */
export function useE2eUser(): E2eUser | null {
  return useContext(E2eUserContext)
}

export function Show(props: ComponentProps<typeof ClerkShow>) {
  const e2e = useE2eUser()
  if (!e2e) return <ClerkShow {...props} />
  return props.when === "signed-in" ? <>{props.children}</> : null
}

export function SignInButton(props: ComponentProps<typeof ClerkSignInButton>) {
  const e2e = useE2eUser()
  if (!e2e) return <ClerkSignInButton {...props} />
  return null
}

export function SignUpButton(props: ComponentProps<typeof ClerkSignUpButton>) {
  const e2e = useE2eUser()
  if (!e2e) return <ClerkSignUpButton {...props} />
  return null
}

export function UserButton(props: ComponentProps<typeof ClerkUserButton>) {
  const e2e = useE2eUser()
  if (!e2e) return <ClerkUserButton {...props} />
  return (
    <span
      role="img"
      aria-label={`Signed in as ${e2e.name}`}
      title={e2e.email}
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-app-control-hover text-[11px] font-semibold text-app-text"
    >
      {e2e.name.slice(0, 1).toUpperCase()}
    </span>
  )
}
