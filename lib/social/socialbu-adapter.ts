import {
  normalizeSocialBuIntegration,
  type SocialBuSocialIntegration,
} from "@/lib/socialbu-client"
import type {
  SocialIntegration,
  SocialPublishingAdapter,
} from "@/lib/social/provider-contract"

export function mapSocialBuIntegration(
  integration: SocialBuSocialIntegration
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

export const socialBuSocialAdapter: SocialPublishingAdapter = {
  id: "socialbu",
  normalizeIntegration(value) {
    const integration = normalizeSocialBuIntegration(value)
    return integration ? mapSocialBuIntegration(integration) : null
  },
  normalizeIntegrations(values) {
    return values.flatMap((value) => {
      const integration = this.normalizeIntegration(value)
      return integration ? [integration] : []
    })
  },
}

export const normalizeSocialBuSocialIntegration =
  socialBuSocialAdapter.normalizeIntegration.bind(socialBuSocialAdapter)

export const normalizeSocialBuSocialIntegrations =
  socialBuSocialAdapter.normalizeIntegrations.bind(socialBuSocialAdapter)
