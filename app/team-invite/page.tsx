import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"

import { TeamInviteCard } from "@/components/team-invite-card"
import { getCurrentUser } from "@/lib/auth"

export default async function TeamInvitePage() {
  const user = await getCurrentUser()
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-brand-canvas px-5 py-10">
      <div className="w-full max-w-[460px]">
        <Link
          href="/"
          className="mb-7 flex items-center justify-center gap-2.5 font-semibold"
        >
          <Image
            src="/brand/lumenclip-mark.png"
            alt=""
            width={34}
            height={34}
          />
          LumenClip
        </Link>
        <Suspense fallback={null}>
          <TeamInviteCard authenticated={Boolean(user)} />
        </Suspense>
      </div>
    </main>
  )
}
