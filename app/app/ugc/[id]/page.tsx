import { redirect } from "next/navigation"

import { StandaloneMobileNav } from "@/components/realfarm/standalone-mobile-nav"
import { UgcRunStatusPanel } from "@/components/realfarm/ugc/ugc-run-status"
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
      <main className="min-h-screen bg-background px-4 py-10 pt-[4.5rem] md:pt-10">
        <UgcRunStatusPanel runId={id} />
      </main>
      <StandaloneMobileNav />
    </>
  )
}
