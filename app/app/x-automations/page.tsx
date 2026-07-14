import { redirect } from "next/navigation"

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
    <XAutomationStudio initialAutomations={automations} initialRuns={runs} />
  )
}
