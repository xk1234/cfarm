import { redirect } from "next/navigation"

import { StandaloneMobileNav } from "@/components/realfarm/standalone-mobile-nav"
import { XAutomationStudio } from "@/components/x-automation-studio"
import { getCurrentUser } from "@/lib/auth"
import { listXAutomations, listXAutomationRuns } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export default async function XAutomationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const [automations, runs] = await Promise.all([
    listXAutomations(),
    listXAutomationRuns(),
  ])
  return (
    <>
      {/* Padding clears the fixed bottom bar on mobile. */}
      <div className="pb-24 md:pb-0">
        <XAutomationStudio initialAutomations={automations} initialRuns={runs} />
      </div>
      <StandaloneMobileNav />
    </>
  )
}
