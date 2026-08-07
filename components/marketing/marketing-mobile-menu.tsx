"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { IconMenu2, IconX } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"

const navigation = [
  ["Product", "/product"],
  ["Solutions", "/solutions"],
  ["Pricing", "/pricing"],
  ["Docs", "/docs"],
  ["Careers", "/careers"],
] as const

export function MarketingMobileMenu() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="marketing-mobile-menu"
        onClick={() => setOpen(true)}
        className="lc-focus-ring flex size-10 items-center justify-center rounded-app-control text-brand-ink active:bg-brand-surface md:hidden"
      >
        <IconMenu2 className="size-5" />
      </button>

      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              className="fixed inset-0 z-50 bg-brand-canvas md:hidden"
            >
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
                  <button
                    type="button"
                    aria-label="Close menu"
                    autoFocus
                    onClick={() => setOpen(false)}
                    className="lc-focus-ring flex size-10 items-center justify-center rounded-app-control text-brand-ink active:bg-brand-surface"
                  >
                    <IconX className="size-5" />
                  </button>
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
                    <Link
                      href="/sign-up"
                      onClick={() => setOpen(false)}
                      className="brand-button brand-button-primary justify-center"
                    >
                      Create account
                    </Link>
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="brand-button brand-button-secondary justify-center"
                    >
                      Log in
                    </Link>
                  </div>
                </div>
              </nav>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
