import { redirect } from "next/navigation"

import { SlideshowWorkflowPanel } from "@/components/realfarm/automation-settings/slideshow-workflow-view"
import { StandaloneMobileNav } from "@/components/realfarm/standalone-mobile-nav"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function SlideshowWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await getCurrentUser())) redirect("/login")
  const { id } = await params

  return (
    <>
      <main className="min-h-[100dvh] bg-app-surface-subtle px-4 py-8 pt-[4.5rem] sm:px-6 md:py-12 md:pt-12">
        <SlideshowWorkflowPanel runId={id} />
      </main>
      <StandaloneMobileNav />
    </>
  )
}
