import Link from "next/link"

import {
  MarketingFooter,
  MarketingNav,
} from "@/components/marketing/marketing-shell"

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] bg-brand-canvas text-brand-ink">
      <MarketingNav />
      <section className="mx-auto grid min-h-[70dvh] max-w-[900px] place-items-center px-5 text-center">
        <div>
          <p className="font-mono text-sm text-brand-accent">404</p>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-0.055em]">
            This page is not in the workflow.
          </h1>
          <p className="mx-auto mt-5 max-w-[48ch] text-base leading-7 text-brand-muted">
            Return to the LumenClip homepage or open your private workspace.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/"
              className="rounded-app-control bg-brand-accent px-5 py-3 text-sm font-semibold text-white"
            >
              Go home
            </Link>
            <Link
              href="/app"
              className="rounded-app-control border border-brand-border-strong bg-white px-5 py-3 text-sm font-semibold"
            >
              Open workspace
            </Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  )
}
