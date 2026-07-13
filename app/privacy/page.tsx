import {
  MarketingFooter,
  MarketingNav,
  PageHero,
} from "@/components/marketing/marketing-shell"

export default function PrivacyPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f7f7fa] text-[#111117]">
      <MarketingNav />
      <PageHero
        title="Privacy"
        description="How LumenClip handles account and workspace data during private beta."
        action={false}
      />
      <article className="mx-auto max-w-[760px] space-y-10 px-5 pb-24 text-sm leading-7 text-[#565663]">
        <section>
          <h2 className="text-xl font-semibold text-[#111117]">Account data</h2>
          <p className="mt-3">
            Appwrite stores account identity and authentication sessions.
            LumenClip uses an HTTP-only session cookie to protect the workspace.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-[#111117]">
            Workspace data
          </h2>
          <p className="mt-3">
            Private records include saved sources, assets, characters,
            collections, automations, runs, results, and generation history.
            These records are scoped to the signed-in user.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-[#111117]">Beta notice</h2>
          <p className="mt-3">
            This page is a product-data summary for the private beta and is not
            a substitute for final legal terms. Formal policy details will be
            published before paid plans launch.
          </p>
        </section>
      </article>
      <MarketingFooter />
    </main>
  )
}
