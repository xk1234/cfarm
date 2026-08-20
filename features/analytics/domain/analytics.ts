import type { CanonicalMetric } from "@/lib/metric-registry"
import type {
  AccountFollowerSnapshot,
  PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import type { PostFastPostRecord } from "@/lib/postfast-posts"
import type { SocialIntegration } from "@/lib/social/provider-contract"

export type AnalyticsPayload = {
  integrations: SocialIntegration[]
  snapshots: PostFastMetricSnapshot[]
  publications: PostFastPostRecord[]
  slideshowPreviews?: Record<string, string[]>
  followerSnapshots: AccountFollowerSnapshot[]
  capabilities: Record<
    string,
    { supported: boolean; metrics: CanonicalMetric[] }
  >
  days: number
  integrationWarning?: string
}
