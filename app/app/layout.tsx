import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await getCurrentUser())) {
    redirect("/?auth=sign-in&next=/app")
  }

  return children
}
