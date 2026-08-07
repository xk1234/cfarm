import { redirect } from "next/navigation"

import { StandaloneMobileNav } from "@/components/realfarm/standalone-mobile-nav"
import { XAutomationStudio } from "@/components/x-automation-studio"
import { getCurrentUser } from "@/lib/auth"
import { listXAutomations, listXAutomationRuns } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export default async function XAutomationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/?auth=sign-in&next=/app/social-templates")
  const [automations, runs] = await Promise.all([
    listXAutomations(),
    listXAutomationRuns(),
  ])
  return (
    <>
      {/* Padding clears the fixed mobile header. */}
      <div className="pt-14 md:pt-0">
        <XAutomationStudio
          initialAutomations={automations}
          initialRuns={runs}
        />
      </div>
      <StandaloneMobileNav />
    </>
  )
}
