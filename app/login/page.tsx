import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { AuthForm } from "@/components/auth-form"
import { getCurrentUser } from "@/lib/auth"

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect("/app")

  return (
    <main className="grid min-h-[100dvh] bg-brand-surface text-brand-ink lg:grid-cols-[minmax(0,1.08fr)_minmax(480px,0.92fr)]">
      <aside className="relative hidden min-h-[100dvh] overflow-hidden bg-brand-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <Image
          src="/brand/lumenclip-brandkit.png"
          alt=""
          fill
          sizes="(min-width: 1024px) 55vw, 0vw"
          className="object-cover object-[68%_72%] opacity-45"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,23,0.52)_0%,rgba(17,17,23,0.22)_42%,rgba(17,17,23,0.94)_100%)]" />

        <Link
          href="/"
          className="relative flex w-fit items-center gap-3 text-lg font-semibold tracking-[-0.04em]"
        >
          <span className="overflow-hidden rounded-app-control bg-brand-ink">
            <Image
              src="/brand/lumenclip-mark.png"
              alt=""
              width={38}
              height={38}
            />
          </span>
          LumenClip
        </Link>

        <div className="relative max-w-[560px]">
          <h2 className="max-w-[10ch] text-5xl font-semibold leading-[0.98] tracking-[-0.055em] xl:text-6xl">
            From source to signal.
          </h2>
          <p className="mt-5 max-w-[38ch] text-base leading-7 text-brand-muted-on-dark-soft">
            Keep your creative inputs, workflows, and published output in one
            working system.
          </p>
        </div>
      </aside>

      <section className="flex min-h-[100dvh] items-center justify-center px-6 py-10 sm:px-10 lg:px-14 xl:px-20">
        <div className="w-full max-w-[430px]">
          <Link
            href="/"
            className="mb-14 flex w-fit items-center gap-2.5 text-base font-semibold tracking-[-0.035em] lg:hidden"
          >
            <span className="overflow-hidden rounded-app-control">
              <Image
                src="/brand/lumenclip-mark.png"
                alt=""
                width={32}
                height={32}
              />
            </span>
            LumenClip
          </Link>

          <Suspense fallback={null}>
            <AuthForm />
          </Suspense>
        </div>
      </section>
    </main>
  )
}
