import { redirect } from "next/navigation"

import { ContentCalendar } from "@/features/calendar/ui/content-calendar"
import { WorkspaceShell } from "@/features/workspace/ui/workspace-shell"
import { getCurrentUser } from "@/lib/auth"

export default async function SchedulePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/?auth=sign-in&next=/app/schedule")

  return (
    <WorkspaceShell view="schedule" ownerName={user.name}>
      <ContentCalendar />
    </WorkspaceShell>
  )
}
