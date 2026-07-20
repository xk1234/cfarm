import {
  IconCheck,
  IconDatabase,
  IconFileSearch,
  IconPlayerPlay,
  IconRoute,
  IconSparkles,
} from "@tabler/icons-react"

import {
  CTASection,
  MarketingFooter,
  MarketingNav,
  PageHero,
} from "@/components/marketing/marketing-shell"

const groups = [
  {
    icon: IconFileSearch,
    title: "Reusable inputs with context",
    body: "Keep approved media, prompts, brand direction, and templates organized for the next content run.",
    bullets: [
      "Keep approved assets beside their instructions",
      "Organize media into reusable collections",
      "Reuse a proven direction without rebuilding it",
    ],
  },
  {
    icon: IconRoute,
    title: "Workflows with visible inputs",
    body: "Build an automation from named collections, templates, schedules, and destination settings.",
    bullets: [
      "Inspect every input before a run",
      "Persist run history and generated artifacts",
      "Pause or revise without rebuilding the workflow",
    ],
  },
  {
    icon: IconSparkles,
    title: "Reusable creator assets",
    body: "Keep assets, captions, prompt attachments, references, and generated videos attached to a stable record.",
    bullets: [
      "Reduce prompt drift between campaigns",
      "Reuse approved references and collections",
      "Trace outputs back to their creative source",
    ],
  },
]

export default function ProductPage() {
  return (
    <main className="min-h-[100dvh] bg-brand-canvas text-brand-ink">
      <MarketingNav />
      <PageHero
        title="The operating layer around your creative tools."
        description="LumenClip connects reusable media, generation workflows, review, scheduling, and output history without replacing the tools you already trust."
      />
      <section className="border-y border-brand-border bg-white py-24">
        <div className="mx-auto max-w-[1280px] space-y-24 px-5 lg:px-8">
          {groups.map((group, index) => (
            <article
              key={group.title}
              className="grid items-center gap-12 lg:grid-cols-2"
            >
              <div className={index % 2 ? "lg:order-2" : ""}>
                <group.icon className="size-8 text-brand-accent" />
                <h2 className="mt-8 max-w-[13ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em]">
                  {group.title}
                </h2>
                <p className="mt-5 max-w-[55ch] text-base leading-7 text-brand-muted">
                  {group.body}
                </p>
              </div>
              <div className="rounded-2xl bg-brand-surface-muted p-7">
                <div className="rounded-app-card bg-brand-surface p-5 shadow-app-card">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <IconDatabase className="size-5 text-brand-accent" /> Saved
                    record
                  </div>
                  <div className="mt-8 space-y-3">
                    {group.bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="flex gap-3 rounded-app-control bg-brand-canvas p-4 text-sm leading-6"
                      >
                        <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-success" />
                        {bullet}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] px-5 py-24 lg:px-8 lg:py-32">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <IconPlayerPlay className="size-8 text-brand-accent" />
            <h2 className="mt-8 text-4xl font-semibold tracking-[-0.05em]">
              How a run moves
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-app-dialog bg-brand-border sm:grid-cols-2">
            {[
              "Select a saved source or collection",
              "Generate against a named template",
              "Review artifacts and captions",
              "Approve, export, or schedule",
            ].map((item, index) => (
              <div key={item} className="bg-white p-6">
                <span className="font-mono text-xs text-brand-accent">
                  0{index + 1}
                </span>
                <p className="mt-10 font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <CTASection
        title="Start with one workflow worth repeating."
        body="The fastest way to understand LumenClip is to connect one source, one collection, and one output path."
      />
      <MarketingFooter />
    </main>
  )
}
