"use client"

import { useEffect, useRef } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app"
}

export function ClerkAuthModalController() {
  const { isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const opened = useRef("")

  useEffect(() => {
    if (!isLoaded) return
    const intent = searchParams.get("auth")
    if (intent !== "sign-in" && intent !== "sign-up") return

    const next = safeNext(searchParams.get("next"))
    const key = `${intent}:${next}`
    if (opened.current === key) return
    opened.current = key

    const cleanParams = new URLSearchParams(searchParams.toString())
    cleanParams.delete("auth")
    cleanParams.delete("next")
    const cleanUrl = cleanParams.size
      ? `${pathname}?${cleanParams.toString()}`
      : pathname
    router.replace(cleanUrl, { scroll: false })

    if (isSignedIn) {
      router.push(next)
      return
    }

    if (intent === "sign-up") {
      clerk.openSignUp({
        forceRedirectUrl: next,
        signInForceRedirectUrl: next,
      })
    } else {
      clerk.openSignIn({
        forceRedirectUrl: next,
        signUpForceRedirectUrl: next,
      })
    }
  }, [clerk, isLoaded, isSignedIn, pathname, router, searchParams])

  return null
}
