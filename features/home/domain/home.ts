import type { Automation } from "@/lib/realfarm-data"

export type HomeRouteData = {
  automations: Automation[]
  publishedPostDates: string[]
}
