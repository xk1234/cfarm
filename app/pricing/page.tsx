import { IconCheck } from "@tabler/icons-react"
import Link from "next/link"

import {
  MarketingFooter,
  MarketingNav,
  PageHero,
} from "@/components/marketing/marketing-shell"

const questions = [
  [
    "Why is the private workspace free?",
    "LumenClip is in private beta while usage limits and team collaboration are being finalized.",
  ],
  [
    "Will existing beta users keep their data?",
    "Yes. Your records remain attached to your Appwrite account as plans evolve.",
  ],
  [
    "What will team pricing include?",
    "The planned team path includes shared libraries, roles, collaborative review, higher run volume, and migration support.",
  ],
  [
    "Can I cancel later?",
    "There is no paid subscription during private beta. Paid terms will be shown before any billing starts.",
  ],
]

export default function PricingPage() {
  return (
    <main className="min-h-[100dvh] bg-brand-canvas text-brand-ink">
      <MarketingNav />
      <PageHero
        title="Pay for workflow capacity, not scattered tools."
        description="Start with a private workspace during beta. Move to a team plan when shared libraries, roles, and review become the job."
        action={false}
      />
      <section className="mx-auto max-w-[1100px] px-5 pb-24 lg:px-8">
        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-2xl bg-brand-surface-muted p-7 lg:p-9">
            <p className="text-sm font-semibold text-brand-muted">
              Private workspace
            </p>
            <p className="mt-7 text-6xl font-semibold tracking-[-0.055em]">
              $0
            </p>
            <p className="mt-2 text-sm text-brand-muted">During private beta</p>
            <p className="mt-8 max-w-[38ch] text-sm leading-6 text-brand-muted">
              For individual operators building a private, reusable creative
              system.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                "Private source and asset library",
                "Automations and saved runs",
                "Creator records and collections",
                "Review gates and output history",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <IconCheck className="size-4 text-brand-success" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login?mode=register"
              className="mt-9 inline-flex rounded-app-control bg-brand-accent px-5 py-3 text-sm font-semibold text-white"
            >
              Create account
            </Link>
          </article>
          <article className="rounded-2xl bg-brand-ink p-7 text-white lg:p-9">
            <p className="text-sm font-semibold text-brand-muted-on-dark">
              Team workspace
            </p>
            <p className="mt-7 text-5xl font-semibold tracking-[-0.05em]">
              Custom
            </p>
            <p className="mt-3 text-sm text-brand-muted-on-dark">
              Built around workflow volume and collaboration
            </p>
            <p className="mt-8 max-w-[42ch] text-sm leading-6 text-brand-muted-on-dark">
              For teams replacing scattered creative operations with shared
              sources, roles, approvals, and repeatable runs.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                "Shared asset and template libraries",
                "Roles and collaborative review",
                "Higher automation and generation volume",
                "Assisted workflow migration",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <IconCheck className="size-4 text-brand-accent-highlight" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login?mode=register"
              className="mt-9 inline-flex rounded-app-control bg-white px-5 py-3 text-sm font-semibold text-brand-ink"
            >
              Join the beta
            </Link>
          </article>
        </div>
      </section>
      <section className="border-y border-brand-border bg-white py-24">
        <div className="mx-auto max-w-[1100px] px-5 lg:px-8">
          <h2 className="text-4xl font-semibold tracking-[-0.05em]">
            Questions before you choose?
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            {questions.map(([q, a]) => (
              <article key={q}>
                <h3 className="text-lg font-semibold">{q}</h3>
                <p className="mt-3 text-sm leading-6 text-brand-muted">{a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  )
}
