import Image from "next/image"
import Link from "next/link"
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconDatabase,
  IconFileSearch,
  IconFolders,
  IconLock,
  IconPlayerPlay,
  IconRoute,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react"

import {
  CTASection,
  MarketingFooter,
  MarketingNav,
} from "@/components/marketing/marketing-shell"

const steps = [
  {
    icon: IconFileSearch,
    title: "Capture the source",
    body: "Save ads, pages, hooks, transcripts, and visual references while the context is still fresh.",
  },
  {
    icon: IconDatabase,
    title: "Structure what worked",
    body: "Keep the promise, angle, assets, and notes together instead of losing them in a folder.",
  },
  {
    icon: IconRoute,
    title: "Run a repeatable workflow",
    body: "Turn proven inputs into scripts, slideshows, creator assets, and queued content runs.",
  },
  {
    icon: IconCheck,
    title: "Review before publishing",
    body: "Inspect every generated artifact and keep approval between the model and your audience.",
  },
]

const faqs = [
  [
    "Is LumenClip a video editor?",
    "No. It is the operating layer around creative research, reusable assets, generation workflows, review, and publishing.",
  ],
  [
    "Can I keep using my current tools?",
    "Yes. LumenClip is designed to organize the inputs and outputs around your existing creative process.",
  ],
  [
    "Does content publish automatically?",
    "Only when you choose that workflow. Review gates keep generated outputs private until they are approved.",
  ],
  [
    "Is each workspace private?",
    "Yes. Automations, swipes, assets, runs, and generations are scoped to the signed-in Appwrite user.",
  ],
  [
    "What should I add first?",
    "Start with one saved source, one reusable collection, and one workflow you already repeat manually.",
  ],
]

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f7f7fa] text-[#111117]">
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <MarketingNav />

      <div id="main">
        <section className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1280px] items-center gap-12 px-5 py-14 lg:grid-cols-[1fr_0.95fr] lg:px-8 lg:py-18">
          <div>
            <div className="lc-spectrum mb-6 h-1 w-16 rounded-full" />
            <h1 className="max-w-[10.5ch] text-5xl leading-[0.96] font-semibold tracking-[-0.06em] sm:text-6xl lg:text-7xl">
              Stop rebuilding every piece of content from scratch.
            </h1>
            <p className="mt-6 max-w-[54ch] text-lg leading-7 text-[#686875]">
              Turn saved creative research into repeatable workflows, reusable
              assets, and approved content runs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login?mode=register"
                className="inline-flex items-center gap-2 rounded-[10px] bg-[#6d28d9] px-5 py-3 text-sm font-semibold text-white hover:bg-[#5b21b6]"
              >
                Create account <IconArrowRight className="size-4" />
              </Link>
              <Link
                href="/product"
                className="inline-flex items-center gap-2 rounded-[10px] border border-[#dedee7] bg-white px-5 py-3 text-sm font-semibold hover:bg-[#f0eef8]"
              >
                <IconPlayerPlay className="size-4" /> See the product
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[22px] bg-[#111117] p-3 shadow-[0_30px_90px_rgba(35,24,67,0.22)] sm:p-4">
            <div className="grid min-h-[520px] gap-3 sm:grid-cols-[1.08fr_0.92fr]">
              <div className="lc-placeholder-studio rounded-[16px] bg-cover bg-center" />
              <div className="grid gap-3">
                <div className="rounded-[16px] bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#686875]">
                      Source record
                    </span>
                    <span className="size-2 rounded-full bg-[#168a55]" />
                  </div>
                  <p className="mt-12 text-xl font-semibold tracking-[-0.03em]">
                    The hook, transcript, visual, and angle stay connected.
                  </p>
                  <div className="mt-6 grid grid-cols-3 gap-2">
                    {["Hook", "Assets", "Proof"].map((label) => (
                      <div
                        key={label}
                        className="rounded-[8px] bg-[#f0eef8] px-2 py-3 text-center text-xs font-medium"
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lc-placeholder-creator rounded-[16px] bg-cover bg-center" />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#e7e7ee] bg-white">
          <div className="mx-auto grid max-w-[1280px] divide-y divide-[#e7e7ee] px-5 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 lg:px-8">
            {[
              [
                "Source records",
                "Research stays attached to the reason it mattered.",
              ],
              ["Review gates", "Nothing leaves the workspace before approval."],
              [
                "Persisted runs",
                "Useful attempts remain inspectable and reusable.",
              ],
              [
                "Private by default",
                "Every record belongs to its signed-in user.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="px-5 py-7 first:pl-0 last:pr-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-6 text-[#686875]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-[1280px] items-center gap-14 px-5 py-24 lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-32">
          <div>
            <h2 className="max-w-[12ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
              Your swipe folder is not a content system.
            </h2>
            <p className="mt-6 max-w-[55ch] text-base leading-7 text-[#686875]">
              Screenshots lose context. Prompts drift. Good outputs disappear
              into export folders. The next campaign still starts with a blank
              document.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] bg-[#ececf2] p-6 sm:translate-y-8">
              <IconFolders className="size-7 text-[#686875]" />
              <p className="mt-16 text-2xl font-semibold tracking-[-0.035em]">
                Before
              </p>
              <p className="mt-3 text-sm leading-6 text-[#686875]">
                Loose links, unlabeled screenshots, copied prompts, and no clear
                path from research to output.
              </p>
            </div>
            <div className="rounded-[18px] bg-[#111117] p-6 text-white">
              <IconSparkles className="size-7 text-[#d9c7ff]" />
              <p className="mt-16 text-2xl font-semibold tracking-[-0.035em]">
                With LumenClip
              </p>
              <p className="mt-3 text-sm leading-6 text-[#c7c7d2]">
                One record connects the source, angle, assets, workflow,
                generated result, and next decision.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white py-24 lg:py-32">
          <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
            <h2 className="max-w-[13ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
              A straight path from evidence to output.
            </h2>
            <div className="mt-14 grid gap-px overflow-hidden rounded-[18px] bg-[#e7e7ee] md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <article
                  key={step.title}
                  className="bg-white p-6 lg:min-h-[300px]"
                >
                  <step.icon className="size-6 text-[#6d28d9]" />
                  <h3 className="mt-20 text-xl font-semibold tracking-[-0.03em]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#686875]">
                    {step.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-5 py-24 lg:px-8 lg:py-32">
          <h2 className="max-w-[14ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
            One workspace for the parts that usually scatter.
          </h2>
          <div className="mt-14 grid gap-4 lg:grid-cols-12">
            <article className="relative min-h-[440px] overflow-hidden rounded-[20px] bg-[#111117] p-7 text-white lg:col-span-7">
              <Image
                src="/brand/lumenclip-brandkit.png"
                alt="LumenClip visual system and product surface"
                fill
                className="object-cover opacity-55"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111117] via-transparent to-transparent" />
              <div className="relative flex h-full flex-col justify-end">
                <IconFileSearch className="size-7" />
                <h3 className="mt-4 max-w-[16ch] text-3xl font-semibold tracking-[-0.04em]">
                  Creative research that stays usable.
                </h3>
                <p className="mt-3 max-w-[48ch] text-sm leading-6 text-[#d4d4dd]">
                  Capture the source and keep the extracted promise, objection,
                  CTA, media, and notes beside it.
                </p>
              </div>
            </article>
            <article className="rounded-[20px] bg-[#ececf2] p-7 lg:col-span-5">
              <IconBolt className="size-7 text-[#6d28d9]" />
              <h3 className="mt-20 text-3xl font-semibold tracking-[-0.04em]">
                Automations with visible inputs.
              </h3>
              <p className="mt-4 text-sm leading-6 text-[#686875]">
                Choose collections, characters, templates, and schedules. Every
                run saves its artifacts and status.
              </p>
            </article>
            <article className="rounded-[20px] bg-white p-7 shadow-[0_12px_40px_rgba(35,24,67,0.08)] lg:col-span-5">
              <IconUsers className="size-7 text-[#6d28d9]" />
              <h3 className="mt-18 text-2xl font-semibold tracking-[-0.035em]">
                Reusable creator assets
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#686875]">
                Keep characters, references, captions, prompt attachments, and
                generated media tied to a source of truth.
              </p>
            </article>
            <article className="lc-placeholder-product min-h-[320px] rounded-[20px] bg-cover bg-center lg:col-span-7" />
          </div>
        </section>

        <section className="border-y border-[#e7e7ee] bg-white py-24 lg:py-32">
          <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
            <h2 className="max-w-[13ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
              Built for teams that need fewer blank starts.
            </h2>
            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {[
                [
                  "Content teams",
                  "Keep research, production inputs, approvals, and output history in one operating view.",
                ],
                [
                  "Performance marketers",
                  "Turn proven angles into controlled variants without losing the source evidence.",
                ],
                [
                  "Creator-led brands",
                  "Reuse characters, collections, captions, and formats across recurring content runs.",
                ],
              ].map(([title, body]) => (
                <article
                  key={title}
                  className="border-l-2 border-[#6d28d9] pl-5"
                >
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#686875]">
                    {body}
                  </p>
                  <Link
                    href="/solutions"
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#6d28d9]"
                  >
                    See the workflow <IconArrowRight className="size-4" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1280px] gap-12 px-5 py-24 lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-32">
          <div>
            <IconLock className="size-8 text-[#6d28d9]" />
            <h2 className="mt-8 max-w-[12ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
              Your creative library belongs to your account.
            </h2>
            <p className="mt-6 max-w-[54ch] text-base leading-7 text-[#686875]">
              Appwrite authentication protects the workspace. Automations,
              swipes, assets, generations, jobs, and results are scoped to the
              signed-in user.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [
                "User-scoped records",
                "Every private row carries an owner ID and user-specific row key.",
              ],
              [
                "Protected workspace",
                "The app and private APIs verify an active server-side session.",
              ],
              [
                "Review before release",
                "Generated content stays private until the workflow says otherwise.",
              ],
              [
                "Durable history",
                "Saved runs and artifacts make useful attempts inspectable later.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[16px] bg-[#ececf2] p-5">
                <IconCheck className="size-5 text-[#168a55]" />
                <p className="mt-8 font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-6 text-[#686875]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white py-24 lg:py-32">
          <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
            <h2 className="max-w-[14ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
              Start with the workflow you already repeat.
            </h2>
            <p className="mt-5 max-w-[60ch] text-base leading-7 text-[#686875]">
              LumenClip is in private beta. Individual workspaces are free while
              plan limits and team features are finalized.
            </p>
            <div className="mt-12 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[18px] bg-[#ececf2] p-7">
                <p className="text-sm font-semibold text-[#686875]">
                  Private workspace
                </p>
                <p className="mt-6 text-5xl font-semibold tracking-[-0.05em]">
                  $0
                </p>
                <p className="mt-2 text-sm text-[#686875]">
                  During private beta
                </p>
                <ul className="mt-8 space-y-3 text-sm">
                  {[
                    "Private source library",
                    "Automations and saved runs",
                    "Creator assets and collections",
                    "Manual review gates",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
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
              </div>
              <div className="rounded-[18px] bg-[#111117] p-7 text-white">
                <p className="text-sm font-semibold text-[#c7c7d2]">
                  Team workspace
                </p>
                <p className="mt-6 text-4xl font-semibold tracking-[-0.045em]">
                  Designed around your approval flow.
                </p>
                <p className="mt-5 max-w-[50ch] text-sm leading-6 text-[#c7c7d2]">
                  Shared libraries, roles, team review, higher run volume, and
                  assisted migration are being shaped with early teams.
                </p>
                <Link
                  href="/pricing"
                  className="mt-9 inline-flex rounded-[10px] bg-white px-5 py-3 text-sm font-semibold text-[#111117]"
                >
                  Compare plans
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-5 py-24 lg:px-8 lg:py-32">
          <h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Questions before you start?
          </h2>
          <div className="mt-12 grid gap-x-14 gap-y-10 md:grid-cols-2">
            {faqs.map(([question, answer]) => (
              <article key={question}>
                <h3 className="text-lg font-semibold tracking-[-0.02em]">
                  {question}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#686875]">
                  {answer}
                </p>
              </article>
            ))}
          </div>
        </section>

        <CTASection
          title="Build the first content system your team can actually reuse."
          body="Start with one saved source. Keep its context, assets, workflow, and outputs connected from the first run."
        />
      </div>
      <MarketingFooter />
    </main>
  )
}
