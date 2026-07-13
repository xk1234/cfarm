import {
  IconArrowRight,
  IconBrandSpeedtest,
  IconPhoto,
  IconUsers,
} from "@tabler/icons-react"
import Link from "next/link"

import {
  CTASection,
  MarketingFooter,
  MarketingNav,
  PageHero,
} from "@/components/marketing/marketing-shell"

const solutions = [
  {
    icon: IconUsers,
    title: "Content teams",
    problem: "Research, production, and approval live in different tools.",
    outcome:
      "Give every campaign a visible source record, owner, workflow, and saved output history.",
    moves: [
      "Centralize swipe research",
      "Reuse approved assets",
      "Review before publishing",
    ],
  },
  {
    icon: IconBrandSpeedtest,
    title: "Performance marketers",
    problem:
      "Winning angles are hard to reproduce without flattening what made them work.",
    outcome:
      "Keep the proof, promise, format, and source media together while controlled variants are produced.",
    moves: [
      "Extract hooks and objections",
      "Build angle-based templates",
      "Compare generated runs",
    ],
  },
  {
    icon: IconPhoto,
    title: "Creator-led brands",
    problem:
      "Characters, captions, references, and recurring formats drift between campaigns.",
    outcome:
      "Build a reusable creator library that feeds repeatable slideshows, UGC assets, and content runs.",
    moves: [
      "Persist character records",
      "Organize image collections",
      "Trace outputs to inputs",
    ],
  },
]

export default function SolutionsPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f7f7fa] text-[#111117]">
      <MarketingNav />
      <PageHero
        title="Different teams. One recurring problem."
        description="Good creative work becomes difficult to repeat when the source, assets, decisions, and outputs live in separate places."
      />
      <section className="border-y border-[#e7e7ee] bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-[1280px] space-y-5 px-5 lg:px-8">
          {solutions.map((solution) => (
            <article
              key={solution.title}
              className="grid gap-8 rounded-[20px] bg-[#f7f7fa] p-7 lg:grid-cols-[0.7fr_1.3fr] lg:p-10"
            >
              <div>
                <solution.icon className="size-7 text-[#6d28d9]" />
                <h2 className="mt-8 text-3xl font-semibold tracking-[-0.04em]">
                  {solution.title}
                </h2>
                <p className="mt-4 text-sm leading-6 text-[#686875]">
                  {solution.problem}
                </p>
              </div>
              <div className="rounded-[16px] bg-white p-6">
                <p className="max-w-[54ch] text-xl leading-7 font-semibold tracking-[-0.025em]">
                  {solution.outcome}
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {solution.moves.map((move) => (
                    <div
                      key={move}
                      className="rounded-[10px] bg-[#ececf2] p-4 text-sm font-medium"
                    >
                      {move}
                    </div>
                  ))}
                </div>
                <Link
                  href="/login?mode=register"
                  className="mt-7 inline-flex items-center gap-1 text-sm font-semibold text-[#6d28d9]"
                >
                  Build this workflow <IconArrowRight className="size-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <CTASection
        title="Make the next campaign start from evidence."
        body="Keep the source, decision, workflow, and result close enough that the useful parts can compound."
      />
      <MarketingFooter />
    </main>
  )
}
