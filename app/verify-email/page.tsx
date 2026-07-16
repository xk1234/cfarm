import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"

import { EmailVerificationCard } from "@/components/email-verification-card"

export default function VerifyEmailPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-brand-canvas px-5 py-10">
      <div className="w-full max-w-[430px]">
        <Link
          href="/"
          className="mb-7 flex items-center justify-center gap-2.5 font-semibold tracking-[-0.03em]"
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
        <Suspense fallback={null}>
          <EmailVerificationCard />
        </Suspense>
      </div>
    </main>
  )
}
