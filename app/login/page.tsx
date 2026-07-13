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
    <main className="grid min-h-[100dvh] place-items-center bg-[#f7f7fa] px-5 py-10">
      <div className="w-full max-w-[430px]">
        <Link
          href="/"
          className="mb-7 flex items-center justify-center gap-2.5 font-semibold tracking-[-0.03em]"
        >
          <span className="overflow-hidden rounded-[10px]">
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
          <AuthForm />
        </Suspense>
      </div>
    </main>
  )
}
