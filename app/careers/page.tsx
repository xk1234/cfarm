import { IconBulb, IconHeartHandshake, IconTool } from "@tabler/icons-react"

import {
  MarketingFooter,
  MarketingNav,
  PageHero,
} from "@/components/marketing/marketing-shell"

export default function CareersPage() {
  return (
    <main className="min-h-[100dvh] bg-brand-canvas text-brand-ink">
      <MarketingNav />
      <PageHero
        title="Build tools that respect creative judgment."
        description="LumenClip is creating the operating layer between creative research and published output."
        action={false}
      />
      <section className="border-y border-brand-border bg-white py-24 lg:py-32">
        <div className="mx-auto grid max-w-[1280px] gap-14 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <h2 className="text-4xl font-semibold tracking-[-0.05em]">
              How we want to work
            </h2>
            <p className="mt-5 text-base leading-7 text-brand-muted">
              Small teams do their best work when decisions are clear, context
              is accessible, and craft is treated as part of the product.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                IconTool,
                "Own the mechanism",
                "Work close enough to the product to understand why a flow succeeds or fails.",
              ],
              [
                IconBulb,
                "Show the reasoning",
                "Make decisions inspectable so good judgment can spread through the team.",
              ],
              [
                IconHeartHandshake,
                "Protect the user",
                "Treat private creative data, authorship, and approval boundaries as product requirements.",
              ],
            ].map(([Icon, title, body]) => {
              const C = Icon as typeof IconTool
              return (
                <article
                  key={String(title)}
                  className="rounded-app-panel bg-brand-canvas p-5"
                >
                  <C className="size-6 text-brand-accent" />
                  <h3 className="mt-12 font-semibold">{String(title)}</h3>
                  <p className="mt-3 text-sm leading-6 text-brand-muted">
                    {String(body)}
                  </p>
                </article>
              )
            })}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[900px] px-5 py-24 text-center lg:py-32">
        <h2 className="text-4xl font-semibold tracking-[-0.05em]">
          No open roles right now.
        </h2>
        <p className="mx-auto mt-5 max-w-[55ch] text-base leading-7 text-brand-muted">
          We will publish real roles, responsibilities, compensation context,
          and application steps here when positions open.
        </p>
      </section>
      <MarketingFooter />
    </main>
  )
}
