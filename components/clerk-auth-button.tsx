"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import { SignInButton, SignUpButton } from "@clerk/nextjs"

type ClerkAuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  authMode: "sign-in" | "sign-up"
  redirectUrl?: string
  children: ReactNode
}

export function ClerkAuthButton({
  authMode,
  redirectUrl = "/app",
  children,
  type = "button",
  ...buttonProps
}: ClerkAuthButtonProps) {
  const button = (
    <button type={type} {...buttonProps}>
      {children}
    </button>
  )

  return authMode === "sign-up" ? (
    <SignUpButton
      mode="modal"
      forceRedirectUrl={redirectUrl}
      signInForceRedirectUrl={redirectUrl}
    >
      {button}
    </SignUpButton>
  ) : (
    <SignInButton
      mode="modal"
      forceRedirectUrl={redirectUrl}
      signUpForceRedirectUrl={redirectUrl}
    >
      {button}
    </SignInButton>
  )
}
