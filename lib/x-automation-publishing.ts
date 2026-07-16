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
  const integrations = input.automation.publishing.integrations.filter(
    (integration) =>
      !integration.disabled &&
      providerIsEnabled(integration, input.automation.platform)
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
  let unsupportedThreads = 0
  for (const integration of integrations) {
    const platform = platformForProvider(integration.provider)
    const platformPosts = input.run.posts.filter(
      (post) => (post.platform ?? input.run.platform) === platform
    )
    if (platformPosts.length !== 1) {
      unsupportedThreads += 1
      continue
    }
    const result = await publishPost({
      type: "now",
      integrationId: integration.integration_id,
      provider: integration.provider,
      content: contentFor(input.run, integration.provider, platformPosts[0].text),
      controls: controlsFor(input.run, integration.provider),
      sourceType: "x_automation",
      sourceId: input.run.id,
      rootDir: input.postfastRootDir,
      request: input.request,
    })
    if (result.ok) published += 1
    else failed += 1
  }

  return {
    attemptedAt,
    published,
    failed,
    ...(published === 0 && failed === 0 && unsupportedThreads > 0
      ? {
          skippedReason:
            "PostFast does not expose reply-chain publishing, so X threads remain drafts.",
        }
      : {}),
  }
}

function providerIsEnabled(
  integration: PostFastSocialIntegration,
  platform: XAutomationRecord["platform"]
) {
  if (integration.provider === "x" || integration.provider === "twitter") {
    return platform === "x"
  }
  return integration.provider === "threads" && platform === "threads"
}

function platformForProvider(provider: PostFastSocialProvider) {
  return provider === "threads" ? "threads" : "x"
}

function contentFor(
  run: XAutomationRun,
  provider: PostFastSocialProvider,
  text: string
) {
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
