import { redirect } from "next/navigation"

import { StandaloneMobileNav } from "@/components/realfarm/standalone-mobile-nav"
import { UgcRunStatusPanel } from "@/components/realfarm/ugc/ugc-run-status"
import { ResponsivePage } from "@/components/ui/responsive-layout"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function UgcRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await getCurrentUser())) redirect("/?auth=sign-in&next=/app")
  const { id } = await params
  return (
    <>
      <main className="min-h-dvh bg-background px-3 py-6 pt-[4.5rem] sm:px-5 md:py-10 md:pt-10">
        <ResponsivePage width="compact">
          <UgcRunStatusPanel runId={id} />
        </ResponsivePage>
      </main>
      <StandaloneMobileNav />
    </>
  )
}
