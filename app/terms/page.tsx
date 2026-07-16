import {
  MarketingFooter,
  MarketingNav,
  PageHero,
} from "@/components/marketing/marketing-shell"

export default function TermsPage() {
  return (
    <main className="min-h-[100dvh] bg-brand-canvas text-brand-ink">
      <MarketingNav />
      <PageHero
        title="Terms"
        description="Private beta expectations for using LumenClip."
        action={false}
      />
      <article className="mx-auto max-w-[760px] space-y-10 px-5 pb-24 text-sm leading-7 text-brand-text-soft">
        <section>
          <h2 className="text-xl font-semibold text-brand-ink">Beta access</h2>
          <p className="mt-3">
            Features, limits, integrations, and availability may change while
            LumenClip is in private beta.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-brand-ink">Your content</h2>
          <p className="mt-3">
            You are responsible for having the rights needed to upload,
            generate, publish, or otherwise use content in your workspace.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-brand-ink">
            Publishing responsibility
          </h2>
          <p className="mt-3">
            Review generated outputs before publishing. Automated generation
            does not replace editorial, legal, platform, or brand review.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-brand-ink">Beta notice</h2>
          <p className="mt-3">
            These are product-use expectations, not final commercial terms.
            Complete terms will be published before paid plans launch.
          </p>
        </section>
      </article>
      <MarketingFooter />
    </main>
  )
}
