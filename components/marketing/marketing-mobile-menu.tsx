"use client"

import { useState } from "react"

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { IconMenu2, IconX } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const navigation = [
  ["Docs", "/docs"],
] as const

export function MarketingMobileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="lc-focus-ring flex size-10 items-center justify-center rounded-app-control text-brand-ink active:bg-brand-surface md:hidden"
        >
          <IconMenu2 className="size-5" />
        </button>
      </SheetTrigger>

      <SheetContent
        side="full"
        className="z-50 bg-brand-canvas p-0 md:hidden"
        overlayClassName="md:hidden"
      >
        <SheetTitle className="sr-only">Mobile navigation</SheetTitle>
        <nav
          id="marketing-mobile-menu"
          aria-label="Primary navigation"
          className="flex h-svh flex-col overflow-y-auto"
        >
          <div className="flex h-18 shrink-0 items-center justify-between border-b border-brand-border/80 px-5">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              aria-label="LumenClip home"
              className="lc-focus-ring flex items-center gap-2.5 rounded-app-control font-semibold tracking-[-0.03em]"
            >
              <span className="overflow-hidden rounded-app-control">
                <Image
                  src="/brand/lumenclip-mark.png"
                  alt=""
                  width={34}
                  height={34}
                />
              </span>
              LumenClip
            </Link>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="lc-focus-ring flex size-10 items-center justify-center rounded-app-control text-brand-ink active:bg-brand-surface"
              >
                <IconX className="size-5" />
              </button>
            </SheetClose>
          </div>

          <div className="flex flex-1 flex-col px-5 py-8">
            <div className="flex flex-col">
              {navigation.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="lc-focus-ring border-b border-brand-border py-5 text-2xl font-semibold tracking-[-0.035em] text-brand-ink"
                >
                  {label}
                </Link>
              ))}
            </div>

            <div className="mt-auto grid gap-3 pt-8">
              <Show when="signed-out">
                <SignUpButton mode="modal" fallbackRedirectUrl="/app">
                  <button
                    onClick={() => setOpen(false)}
                    className="brand-button brand-button-primary justify-center"
                  >
                    Create account
                  </button>
                </SignUpButton>
                <SignInButton mode="modal" fallbackRedirectUrl="/app">
                  <button
                    onClick={() => setOpen(false)}
                    className="brand-button brand-button-secondary justify-center"
                  >
                    Log in
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <div className="flex items-center gap-3">
                  <UserButton />
                  <Link
                    href="/app"
                    onClick={() => setOpen(false)}
                    className="brand-button brand-button-primary flex-1 justify-center"
                  >
                    Open app
                  </Link>
                </div>
              </Show>
            </div>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
