import {
  normalizePostFastIntegration,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import type {
  SocialIntegration,
  SocialPublishingAdapter,
} from "@/lib/social/provider-contract"

export function mapPostFastIntegration(
  integration: PostFastSocialIntegration
): SocialIntegration {
  return {
    provider: integration.provider,
    integration_id: integration.integration_id,
    name: integration.name,
    profile: integration.profile,
    picture: integration.picture,
    disabled: integration.disabled,
  }
}

export const postFastSocialAdapter: SocialPublishingAdapter = {
  id: "postfast",
  normalizeIntegration(value) {
    const integration = normalizePostFastIntegration(value)
    return integration ? mapPostFastIntegration(integration) : null
  },
  normalizeIntegrations(values) {
    return values.flatMap((value) => {
      const integration = this.normalizeIntegration(value)
      return integration ? [integration] : []
    })
  },
}

export const normalizePostFastSocialIntegration =
  postFastSocialAdapter.normalizeIntegration.bind(postFastSocialAdapter)

export const normalizePostFastSocialIntegrations =
  postFastSocialAdapter.normalizeIntegrations.bind(postFastSocialAdapter)
