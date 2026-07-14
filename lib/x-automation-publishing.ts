import { publishPost, type PublishRequest } from "@/lib/publishing"
import type {
  PostFastSocialIntegration,
  PostFastSocialProvider,
} from "@/lib/postfast-client"
import type { XAutomationRecord, XAutomationRun } from "@/lib/x-automation"

export async function publishXAutomationRun(input: {
  automation: XAutomationRecord
  run: XAutomationRun
  request?: PublishRequest
  postfastRootDir?: string
}) {
  const attemptedAt = new Date().toISOString()
  if (input.run.contentType !== "single") {
    return {
      attemptedAt,
      published: 0,
      failed: 0,
      skippedReason:
        "PostFast does not expose a reply-chain or X Article contract in this project, so only single posts can autopost safely.",
    }
  }

  const integrations = input.automation.publishing.integrations.filter(
    (integration) =>
      !integration.disabled &&
      providerIsEnabled(integration, input.run.platforms)
  )
  if (integrations.length === 0) {
    return {
      attemptedAt,
      published: 0,
      failed: 0,
      skippedReason: "No enabled X or Threads account is selected.",
    }
  }

  let published = 0
  let failed = 0
  for (const integration of integrations) {
    const result = await publishPost({
      type: "now",
      integrationId: integration.integration_id,
      provider: integration.provider,
      content: contentFor(input.run, integration.provider),
      controls: controlsFor(input.run, integration.provider),
      sourceType: "x_automation",
      sourceId: input.run.id,
      rootDir: input.postfastRootDir,
      request: input.request,
    })
    if (result.ok) published += 1
    else failed += 1
  }

  return { attemptedAt, published, failed }
}

function providerIsEnabled(
  integration: PostFastSocialIntegration,
  platforms: XAutomationRun["platforms"]
) {
  if (integration.provider === "x" || integration.provider === "twitter") {
    return platforms.includes("x")
  }
  return integration.provider === "threads" && platforms.includes("threads")
}

function contentFor(run: XAutomationRun, provider: PostFastSocialProvider) {
  const text = run.posts[0]?.text ?? run.hook
  if (
    run.reactionMode === "quote" &&
    run.sourceCandidate?.url &&
    provider === "threads"
  ) {
    return `${text}\n\n${run.sourceCandidate.url}`
  }
  return text
}

function controlsFor(run: XAutomationRun, provider: PostFastSocialProvider) {
  if (
    (provider === "x" || provider === "twitter") &&
    run.sourceCandidate?.url &&
    (run.reactionMode === "quote" || run.reactionMode === "repost")
  ) {
    return { xRetweetUrl: run.sourceCandidate.url }
  }
  return undefined
}
