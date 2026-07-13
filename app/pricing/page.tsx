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
    <main className="min-h-[100dvh] bg-[#f7f7fa] text-[#111117]">
      <MarketingNav />
      <PageHero
        title="Pay for workflow capacity, not scattered tools."
        description="Start with a private workspace during beta. Move to a team plan when shared libraries, roles, and review become the job."
        action={false}
      />
      <section className="mx-auto max-w-[1100px] px-5 pb-24 lg:px-8">
        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[20px] bg-[#ececf2] p-7 lg:p-9">
            <p className="text-sm font-semibold text-[#686875]">
              Private workspace
            </p>
            <p className="mt-7 text-6xl font-semibold tracking-[-0.055em]">
              $0
            </p>
            <p className="mt-2 text-sm text-[#686875]">During private beta</p>
            <p className="mt-8 max-w-[38ch] text-sm leading-6 text-[#686875]">
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
                  <IconCheck className="size-4 text-[#168a55]" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login?mode=register"
              className="mt-9 inline-flex rounded-[10px] bg-[#6d28d9] px-5 py-3 text-sm font-semibold text-white"
            >
              Create account
            </Link>
          </article>
          <article className="rounded-[20px] bg-[#111117] p-7 text-white lg:p-9">
            <p className="text-sm font-semibold text-[#c7c7d2]">
              Team workspace
            </p>
            <p className="mt-7 text-5xl font-semibold tracking-[-0.05em]">
              Custom
            </p>
            <p className="mt-3 text-sm text-[#c7c7d2]">
              Built around workflow volume and collaboration
            </p>
            <p className="mt-8 max-w-[42ch] text-sm leading-6 text-[#c7c7d2]">
              For teams replacing scattered creative operations with shared
              sources, roles, approvals, and repeatable runs.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                "Shared research and asset libraries",
                "Roles and collaborative review",
                "Higher automation and generation volume",
                "Assisted workflow migration",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <IconCheck className="size-4 text-[#d9c7ff]" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login?mode=register"
              className="mt-9 inline-flex rounded-[10px] bg-white px-5 py-3 text-sm font-semibold text-[#111117]"
            >
              Join the beta
            </Link>
          </article>
        </div>
      </section>
      <section className="border-y border-[#e7e7ee] bg-white py-24">
        <div className="mx-auto max-w-[1100px] px-5 lg:px-8">
          <h2 className="text-4xl font-semibold tracking-[-0.05em]">
            Questions before you choose?
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            {questions.map(([q, a]) => (
              <article key={q}>
                <h3 className="text-lg font-semibold">{q}</h3>
                <p className="mt-3 text-sm leading-6 text-[#686875]">{a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  )
}
