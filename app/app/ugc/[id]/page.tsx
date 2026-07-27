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
  if (!(await getCurrentUser())) redirect("/login")
  const { id } = await params
  return (
    <>
      <main className="min-h-screen bg-background px-4 py-10 pb-24 md:pb-10">
        <UgcRunStatusPanel runId={id} />
      </main>
      <StandaloneMobileNav />
    </>
  )
}
