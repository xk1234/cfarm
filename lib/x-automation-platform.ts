import type { Automation } from "@/lib/realfarm-data"
import type { XAutomationPlatform } from "@/lib/x-automation"

export function xThreadsPlatformForDisplay(
  automation: Pick<Automation, "platform" | "handle" | "socialIntegrations">,
  runPlatform?: XAutomationPlatform
): XAutomationPlatform {
  if (runPlatform === "threads" || runPlatform === "x") return runPlatform
  if (automation.platform === "threads" || automation.platform === "x") {
    return automation.platform
  }

  const providers = automation.socialIntegrations.map(
    (integration) => integration.provider
  )
  if (
    providers.includes("threads") &&
    !providers.some((provider) => provider === "x" || provider === "twitter")
  ) {
    return "threads"
  }
  return /threads/i.test(automation.handle) ? "threads" : "x"
}
