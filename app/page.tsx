import Link from "next/link";
import {
  IconArrowRight,
  IconBraces,
  IconCalendar,
  IconCheck,
  IconFileZip,
  IconKey,
  IconLayoutGrid,
  IconLock,
  IconPhoto,
  IconPlayerPlay,
  IconPlugConnected,
  IconTypography,
} from "@tabler/icons-react";

import {
  CTASection,
  MarketingFooter,
  MarketingNav,
} from "@/components/marketing/marketing-shell";

const exampleSpec = `{
  "version": 1,
  "canvas": { "preset": "9:16", "background": "#111111" },
  "slots": {
    "hook": { "type": "text", "required": true },
    "photo": { "type": "image", "required": true }
  },
  "slides": [{
    "id": "hook",
    "layers": [
      { "id": "bg", "type": "image",
        "src": { "slot": "photo" },
        "frame": { "inset": 0 }, "fit": "cover" },
      { "id": "title", "type": "text",
        "text": "{{hook}}", "style": "hook",
        "frame": { "x": "50%", "y": "14%",
                   "width": "84%", "anchor": "top" } }
    ]
  }]
}`;

const steps = [
  {
    icon: IconBraces,
    title: "Describe the slides in JSON",
    body: "Canvas, fonts, theme, and every image, text, and shape layer are explicit fields. Nothing is guessed.",
  },
  {
    icon: IconLayoutGrid,
    title: "Turn it into a template",
    body: "Declare named slots for images, copy, colours, and lists. A list slot repeats slides for variable-length carousels.",
  },
  {
    icon: IconPhoto,
    title: "Fill the slots",
    body: "Pick uploads, a collection image, a seeded random pick from a collection, or a Pexels or Pinterest result.",
  },
  {
    icon: IconFileZip,
    title: "Render and ship",
    body: "Get one PNG per slide plus a ZIP, then publish or schedule the carousel to TikTok or Instagram.",
  },
];

const features = [
  {
    icon: IconTypography,
    title: "Bundled typefaces",
    body: "21 display, serif, script, and handwritten faces plus Inter, rendered with the real font files on the server.",
  },
  {
    icon: IconLayoutGrid,
    title: "Stacks and grids",
    body: "Absolute, stack, and grid groups with gaps, padding, corner radius, and clipping for collages and lists.",
  },
  {
    icon: IconCheck,
    title: "Validation with paths",
    body: "Every error carries a code and a JSON Pointer, so a bad field is easy to find in a pasted spec.",
  },
  {
    icon: IconKey,
    title: "API keys and MCP",
    body: "Render from scripts with a workspace API key, or let an agent call the same tools over MCP.",
  },
  {
    icon: IconCalendar,
    title: "Calendar",
    body: "Scheduled and published posts sit on one calendar, with in-app reminders before they go out.",
  },
  {
    icon: IconPlugConnected,
    title: "Deterministic output",
    body: "The resolved spec is stored with every render, so a historical render always reproduces the same pixels.",
  },
];

const faqs = [
  [
    "Is there a design editor?",
    "No. A spec is the single source of truth for layout. The app gives you a visual way to fill template slots and preview the result, not a canvas to drag things around on.",
  ],
  [
    "Does it write my copy?",
    "No. LumenClip renders exactly the text you provide. Bring copy from your own process, a spreadsheet, or an agent.",
  ],
  [
    "Which outputs are supported?",
    "PNG per slide by default, with optional JPEG or WebP, plus a ZIP of the whole carousel.",
  ],
  [
    "Can I render from my own code?",
    "Yes. The REST API under /api/v1 validates specs, creates renders, and returns signed slide URLs. Small renders return immediately; larger ones are queued.",
  ],
  [
    "Is my media private?",
    "Uploads and renders live in private storage and are served only through routes that check you own them. Share links use signed tokens.",
  ],
];

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-brand-canvas text-brand-ink">
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <MarketingNav />

      <div id="main">
        <section className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1280px] items-center gap-12 px-5 py-14 lg:grid-cols-[1fr_0.95fr] lg:px-8 lg:py-18">
          <div className="min-w-0">
            <div className="lc-spectrum mb-6 h-1 w-16 rounded-full" />
            <h1 className="max-w-[12ch] text-5xl leading-[0.96] font-semibold tracking-[-0.06em] sm:text-6xl lg:text-7xl">
              Carousels rendered from JSON.
            </h1>
            <p className="mt-6 max-w-[54ch] text-lg leading-7 text-brand-muted">
              LumenClip is a JSON-driven carousel rendering engine. Describe
              every slide once as a spec, fill its image and text slots, and
              get pixel-exact PNGs ready for TikTok and Instagram.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-app-control bg-brand-accent px-5 py-3 text-sm font-semibold text-white hover:bg-brand-accent-hover"
              >
                Create account <IconArrowRight className="size-4" />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 rounded-app-control border border-brand-border-strong bg-white px-5 py-3 text-sm font-semibold hover:bg-brand-accent-soft"
              >
                <IconPlayerPlay className="size-4" /> Read the docs
              </Link>
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-2xl bg-brand-ink p-3 shadow-app-dialog sm:p-4">
            <div className="grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
              <pre className="max-h-[520px] overflow-auto rounded-app-panel bg-black/40 p-4 font-mono text-[11px] leading-5 text-brand-muted-on-dark sm:text-xs">
                <code>{exampleSpec}</code>
              </pre>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">
                {["hook", "item-1", "item-2"].map((id, index) => (
                  <div
                    key={id}
                    className="relative aspect-[9/16] overflow-hidden rounded-app-panel bg-cover bg-center sm:aspect-auto sm:min-h-[160px]"
                  >
                    <div
                      className={
                        index === 0
                          ? "lc-placeholder-studio absolute inset-0 bg-cover bg-center"
                          : index === 1
                            ? "lc-placeholder-creator absolute inset-0 bg-cover bg-center"
                            : "lc-placeholder-product absolute inset-0 bg-cover bg-center"
                      }
                    />
                    <div className="absolute inset-0 bg-black/20" />
                    <span className="absolute bottom-2 left-2 rounded-md bg-white px-2 py-1 font-mono text-[10px] font-semibold text-brand-ink">
                      {id}.png
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-brand-border bg-white">
          <div className="mx-auto grid max-w-[1280px] divide-y divide-brand-border px-5 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 lg:px-8">
            {[
              ["One input", "A JSON spec is the only thing the renderer reads."],
              ["One engine", "The preview and the server use the same code."],
              ["Up to 35 slides", "Enough for a full TikTok photo carousel."],
              ["Private by default", "Every file is checked against its owner."],
            ].map(([title, body]) => (
              <div key={title} className="px-5 py-7 first:pl-0 last:pr-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-6 text-brand-muted">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white py-24 lg:py-32">
          <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
            <h2 className="max-w-[14ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
              From spec to posted carousel.
            </h2>
            <div className="mt-14 grid gap-px overflow-hidden rounded-app-dialog bg-brand-border md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <article
                  key={step.title}
                  className="bg-white p-6 lg:min-h-[300px]"
                >
                  <step.icon className="size-6 text-brand-accent" />
                  <h3 className="mt-20 text-xl font-semibold tracking-[-0.03em]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-brand-muted">
                    {step.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-5 py-24 lg:px-8 lg:py-32">
          <h2 className="max-w-[16ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
            Explicit layout, no hidden heuristics.
          </h2>
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl bg-brand-surface-muted p-7"
              >
                <feature.icon className="size-7 text-brand-accent" />
                <h3 className="mt-12 text-2xl font-semibold tracking-[-0.035em]">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-brand-muted">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-brand-border bg-white py-24 lg:py-32">
          <div className="mx-auto grid max-w-[1280px] gap-12 px-5 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <IconLock className="size-8 text-brand-accent" />
              <h2 className="mt-8 max-w-[12ch] text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
                Your media stays yours.
              </h2>
              <p className="mt-6 max-w-[54ch] text-base leading-7 text-brand-muted">
                Uploads, collections, and rendered slides live in private
                storage tied to your account.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "Owner-checked files",
                  "Every image is served through a route that verifies the signed-in owner.",
                ],
                [
                  "Guarded remote images",
                  "Image URLs in a spec are fetched with private-network blocking and a size cap.",
                ],
                [
                  "Hashed API keys",
                  "Keys are shown once at creation and stored only as a hash.",
                ],
                [
                  "Read-only history",
                  "A render keeps its resolved spec; changing a template never rewrites past output.",
                ],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-app-panel bg-brand-surface-muted p-5"
                >
                  <IconCheck className="size-5 text-brand-success" />
                  <p className="mt-8 font-semibold">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-brand-muted">
                    {body}
                  </p>
                </div>
              ))}
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
                <p className="mt-3 text-sm leading-6 text-brand-muted">
                  {answer}
                </p>
              </article>
            ))}
          </div>
        </section>

        <CTASection
          title="Render your first carousel from a starter template."
          body="Pick a template, drop in your photos and copy, and download the slides in under a minute."
        />
      </div>
      <MarketingFooter />
    </main>
  );
}
