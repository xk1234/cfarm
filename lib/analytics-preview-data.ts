import type { AnalyticsPayload } from "@/components/realfarm/analytics/analytics-view"
import type { CanonicalMetric } from "@/lib/metric-registry"
import type { PostFastSocialProvider } from "@/lib/postfast-client"

export const analyticsPreviewPlatforms = [
  "overall",
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "pinterest",
  "x",
  "threads",
  "bluesky",
  "telegram",
  "google-business-profile",
  "tiktok-creative",
  "tiktok-seller",
] as const

export type AnalyticsPreviewPlatform =
  (typeof analyticsPreviewPlatforms)[number]

const platformDefinitions: Array<{
  provider: Exclude<AnalyticsPreviewPlatform, "overall">
  names: string[]
  metrics: CanonicalMetric[]
  supported: boolean
}> = [
  {
    provider: "tiktok",
    names: ["Orbit Notes", "Moon Method", "Cosmic Clarity"],
    metrics: ["views", "likes", "comments", "shares", "saves", "interactions"],
    supported: true,
  },
  {
    provider: "instagram",
    names: ["Aster House", "Chart Language", "Soft Saturn"],
    metrics: [
      "views",
      "impressions",
      "reach",
      "likes",
      "comments",
      "shares",
      "saves",
      "interactions",
    ],
    supported: true,
  },
  {
    provider: "facebook",
    names: ["Everyday Astrology", "Rising Sign Club", "The Chart Room"],
    metrics: [
      "views",
      "impressions",
      "reach",
      "likes",
      "comments",
      "shares",
      "clicks",
      "interactions",
    ],
    supported: true,
  },
  {
    provider: "youtube",
    names: ["Sky Patterns", "Placement Study", "Transit Weekly"],
    metrics: ["views", "likes", "comments", "shares", "interactions"],
    supported: true,
  },
  {
    provider: "linkedin",
    names: ["Creator Signals", "Social Systems", "Audience Practice"],
    metrics: [
      "impressions",
      "reach",
      "likes",
      "comments",
      "shares",
      "clicks",
      "interactions",
    ],
    supported: true,
  },
  {
    provider: "pinterest",
    names: ["Zodiac Index", "Celestial Boards", "Astro Reference"],
    metrics: ["impressions", "views", "saves", "clicks", "interactions"],
    supported: true,
  },
  {
    provider: "x",
    names: ["Chart Takes", "Transit Thread", "Astrology Brief"],
    metrics: [],
    supported: false,
  },
  {
    provider: "threads",
    names: ["Placement Talk", "The Astro Edit", "Sign Notes"],
    metrics: [],
    supported: false,
  },
  {
    provider: "bluesky",
    names: ["Open Sky Notes", "Chart Feed", "Transit Social"],
    metrics: [],
    supported: false,
  },
  {
    provider: "telegram",
    names: ["Astro Dispatch", "Daily Transit", "Chart Alerts"],
    metrics: [],
    supported: false,
  },
  {
    provider: "google-business-profile",
    names: ["Aster Studio", "Chart House", "Cosmic Practice"],
    metrics: [],
    supported: false,
  },
  {
    provider: "tiktok-creative",
    names: ["Creative Research", "Trend Reference", "Hook Library"],
    metrics: [],
    supported: false,
  },
  {
    provider: "tiktok-seller",
    names: ["Astro Shop", "Zodiac Goods", "Celestial Store"],
    metrics: [],
    supported: false,
  },
]

const topics = [
  "The placement that changes how you handle conflict",
  "Why your rising sign shows up before your sun sign",
  "Three chart patterns that explain sudden distance",
]

const captureDates = [
  "2026-06-20T09:00:00.000Z",
  "2026-06-28T09:00:00.000Z",
  "2026-07-06T09:00:00.000Z",
  "2026-07-14T09:00:00.000Z",
]

export function buildAnalyticsPreviewData(): AnalyticsPayload {
  const integrations: AnalyticsPayload["integrations"] = []
  const snapshots: AnalyticsPayload["snapshots"] = []
  const followerSnapshots: AnalyticsPayload["followerSnapshots"] = []
  const capabilities: AnalyticsPayload["capabilities"] = {}

  platformDefinitions.forEach((definition, platformIndex) => {
    definition.names.forEach((name, accountIndex) => {
      const integrationId = `${definition.provider}-${accountIndex + 1}`
      const accountSeed = platformIndex * 3 + accountIndex
      integrations.push({
        integration_id: integrationId,
        provider: definition.provider as PostFastSocialProvider,
        name,
        profile: `@${name.toLowerCase().replace(/\s+/g, "")}`,
        picture: avatarDataUrl(name, accountSeed),
      })
      capabilities[integrationId] = {
        supported: definition.supported,
        metrics: definition.metrics,
      }

      captureDates.forEach((capturedAt, captureIndex) => {
        followerSnapshots.push({
          id: `followers-${integrationId}-${captureIndex}`,
          integrationId,
          provider: definition.provider,
          capturedAt,
          followers:
            18_700 +
            platformIndex * 5_900 +
            accountIndex * 8_300 +
            captureIndex * (540 + accountIndex * 90),
        })
      })

      topics.forEach((topic, postIndex) => {
        captureDates.forEach((capturedAt, captureIndex) => {
          const exposure =
            12_400 +
            platformIndex * 2_600 +
            accountIndex * 5_200 +
            postIndex * 3_100 +
            captureIndex * (3_900 + accountIndex * 450)
          const interactions = Math.round(
            exposure * (0.041 + accountIndex * 0.006 + postIndex * 0.003)
          )
          snapshots.push({
            id: `snapshot-${integrationId}-${postIndex}-${captureIndex}`,
            postId: `post-${integrationId}-${postIndex}`,
            platformPostId: `remote-${integrationId}-${postIndex}`,
            integrationId,
            provider: definition.provider,
            capturedAt,
            publishedAt: `2026-07-${String(13 - postIndex * 3 - accountIndex).padStart(2, "0")}T12:00:00.000Z`,
            content: topic,
            thumbnailUrl: postArtDataUrl(
              definition.provider,
              topic,
              accountSeed + postIndex
            ),
            releaseUrl: "https://example.com/post",
            sourceType:
              postIndex === 0
                ? "slideshow"
                : postIndex === 1
                  ? "video_automation"
                  : "external",
            metrics: definition.supported
              ? metricValues(
                  definition.metrics,
                  exposure,
                  interactions,
                  postIndex
                )
              : {},
            latestMetric: {},
            rawMetrics: {},
            observedKeys: definition.metrics,
          })
        })
      })
    })
  })

  return {
    integrations,
    snapshots,
    followerSnapshots,
    capabilities,
    days: 30,
  }
}

function metricValues(
  supported: CanonicalMetric[],
  exposure: number,
  interactions: number,
  postIndex: number
) {
  const values: Partial<Record<CanonicalMetric, number>> = {}
  const put = (metric: CanonicalMetric, value: number) => {
    if (supported.includes(metric)) values[metric] = value
  }
  put("views", exposure)
  put("impressions", Math.round(exposure * 1.08))
  put("reach", Math.round(exposure * 0.82))
  put("likes", Math.round(interactions * 0.58))
  put("comments", Math.round(interactions * 0.12))
  put("shares", Math.round(interactions * 0.15))
  put("saves", Math.round(interactions * (0.15 + postIndex * 0.02)))
  put("clicks", Math.round(interactions * 0.24))
  put("interactions", interactions)
  const denominator = values.views ?? values.impressions ?? values.reach
  if (denominator) values.engagementRate = (interactions / denominator) * 100
  return values
}

function avatarDataUrl(name: string, seed: number) {
  const palettes = [
    ["#e7ddfb", "#7654a6", "#392b50"],
    ["#f7dfd7", "#bd6a55", "#5b3028"],
    ["#dcebea", "#4f8b83", "#244945"],
    ["#f5e8c9", "#b88734", "#59451d"],
  ]
  const [background, shirt, hair] = palettes[seed % palettes.length]
  const initial = name.charAt(0).toUpperCase()
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="48" fill="${background}"/>
      <circle cx="48" cy="39" r="21" fill="#f4c9ad"/>
      <path d="M25 39c0-18 10-27 24-27 13 0 23 9 23 25-8-8-16-12-27-12-7 0-14 5-20 14Z" fill="${hair}"/>
      <path d="M14 96c3-25 16-37 34-37s31 12 34 37" fill="${shirt}"/>
      <text x="74" y="85" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="white">${initial}</text>
    </svg>
  `)
}

function postArtDataUrl(platform: string, title: string, seed: number) {
  const colors = [
    ["#1b1230", "#8c63d7", "#f0b4dc"],
    ["#102a2a", "#458e82", "#d9b76d"],
    ["#2f171e", "#ad526c", "#f0c98c"],
    ["#17243c", "#4775b8", "#dc9d63"],
  ][seed % 4]
  const short = escapeXml(title.split(" ").slice(0, 7).join(" "))
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs><radialGradient id="g" cx="22%" cy="18%" r="90%"><stop stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[0]}"/></radialGradient></defs>
      <rect width="640" height="360" fill="url(#g)"/>
      <circle cx="510" cy="70" r="130" fill="${colors[2]}" opacity=".16"/>
      <circle cx="560" cy="300" r="175" fill="none" stroke="${colors[2]}" stroke-width="2" opacity=".35"/>
      <text x="46" y="62" font-family="Arial" font-size="20" font-weight="700" fill="${colors[2]}" letter-spacing="2">${platform.toUpperCase()}</text>
      <foreignObject x="44" y="104" width="470" height="170"><div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font:700 34px/1.14 Arial;letter-spacing:-1px">${short}</div></foreignObject>
      <rect x="46" y="308" width="86" height="4" rx="2" fill="${colors[2]}"/>
    </svg>
  `)
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
