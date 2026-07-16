import Image from "next/image"
import Link from "next/link"

const navigation = [
  ["Product", "/product"],
  ["Solutions", "/solutions"],
  ["Pricing", "/pricing"],
  ["Careers", "/careers"],
] as const

export function MarketingNav() {
  return (
    <nav className="sticky top-0 z-20 border-b border-brand-border/80 bg-brand-canvas/88 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-[1280px] items-center justify-between px-5 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-[-0.03em]"
        >
          <span className="overflow-hidden rounded-app-control">
            <Image
              src="/brand/lumenclip-mark.png"
              alt=""
              width={34}
              height={34}
            />
          </span>
          LumenClip
        </Link>
        <div className="hidden items-center gap-7 md:flex">
          {navigation.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-brand-text-soft transition hover:text-brand-ink"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-app-control px-3 py-2 text-sm font-medium hover:bg-brand-surface sm:px-4"
          >
            Log in
          </Link>
          <Link
            href="/login?mode=register"
            className="brand-button brand-button-primary min-h-0 px-3 py-2 sm:px-4"
          >
            Create account
          </Link>
        </div>
      </div>
    </nav>
  )
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-brand-border bg-brand-canvas">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-14 md:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <div className="flex items-center gap-2.5 font-semibold tracking-[-0.03em]">
            <Image
              src="/brand/lumenclip-mark.png"
              alt=""
              width={30}
              height={30}
              className="rounded-app-control"
            />
            LumenClip
          </div>
          <p className="mt-4 max-w-[38ch] text-sm leading-6 text-brand-muted">
            The private creator operations workspace for turning source material
            into content that ships.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm font-medium text-brand-text-soft sm:grid-cols-3">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-brand-ink">
              {label}
            </Link>
          ))}
          <Link href="/login">Log in</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>
      <div className="mx-auto max-w-[1280px] border-t border-brand-border px-5 py-5 text-xs text-brand-text-faint lg:px-8">
        © {new Date().getFullYear()} LumenClip
      </div>
    </footer>
  )
}

export function PageHero({
  title,
  description,
  action = true,
}: {
  title: string
  description: string
  action?: boolean
}) {
  return (
    <section className="mx-auto max-w-[1280px] px-5 pt-18 pb-20 lg:px-8 lg:pb-24">
      <div className="lc-spectrum mb-6 h-1 w-16 rounded-full" />
      <h1 className="max-w-[12ch] text-5xl leading-[0.98] font-semibold tracking-[-0.055em] text-brand-ink sm:text-6xl lg:text-7xl">
        {title}
      </h1>
      <p className="mt-6 max-w-[58ch] text-lg leading-7 text-brand-muted">
        {description}
      </p>
      {action ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login?mode=register"
            className="brand-button brand-button-primary"
          >
            Create account
          </Link>
          <Link
            href="/product"
            className="brand-button brand-button-secondary"
          >
            See the product
          </Link>
        </div>
      ) : null}
    </section>
  )
}

export function CTASection({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto max-w-[1280px] px-5 py-20 lg:px-8 lg:py-28">
      <div className="relative overflow-hidden rounded-2xl bg-brand-ink px-6 py-14 text-white sm:px-12 lg:px-16 lg:py-18">
        <div className="absolute -top-28 -right-20 size-80 rounded-full bg-brand-accent opacity-40 blur-3xl" />
        <div className="relative max-w-[720px]">
          <h2 className="text-4xl leading-[1.02] font-semibold tracking-[-0.045em] sm:text-5xl">
            {title}
          </h2>
          <p className="mt-5 max-w-[54ch] text-base leading-7 text-brand-muted-on-dark">
            {body}
          </p>
          <Link
            href="/login?mode=register"
            className="brand-button brand-button-secondary mt-8"
          >
            Create account
          </Link>
        </div>
      </div>
    </section>
  )
}
