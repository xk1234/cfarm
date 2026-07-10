globalThis.CFARM_PLATFORM_ADAPTERS = [
  {
    id: "facebook",
    label: "facebook",
    adapter: "meta",
    candidateMode: "metaDetails",
    buttonMode: "metaDetails",
    cardSelectors: [],
    matches({ host }) {
      return host.includes("facebook.com")
    },
  },
  {
    id: "tiktok-creative",
    label: "tiktok-creative",
    adapter: "tiktokCreativeCenter",
    candidateMode: "tiktokCreativeCenter",
    buttonMode: "tiktokCreativeCenter",
    cardSelectors: [
      "[class*='TopadsVideoCard_card']",
      "[class*='TopadsList_cardWrapper']",
      "[class*='CommonGridLayoutDataList_cardWrapper']",
    ],
    matches({ host }) {
      return host.includes("ads.tiktok.com")
    },
  },
  {
    id: "tiktok-seller",
    label: "tiktok-seller",
    adapter: "tiktokSeller",
    candidateMode: "tiktokSeller",
    buttonMode: "tiktokSeller",
    cardSelectors: [
      "[data-tid='video-player']",
      "[id^='short_video_'][id$='-wrapper']",
    ],
    matches({ host }) {
      return host.includes("seller-sg.tiktok.com")
    },
  },
  {
    id: "tiktok",
    label: "tiktok",
    adapter: "tiktokVideo",
    candidateMode: "tiktokVideo",
    buttonMode: "tiktokVideo",
    cardSelectors: ["[data-e2e='user-post-item']"],
    matches({ host }) {
      return host.includes("tiktok.com")
    },
  },
  {
    id: "twitter",
    label: "twitter",
    adapter: "xTwitter",
    candidateMode: "xTwitter",
    buttonMode: "card",
    cardSelectors: [
      "article[data-testid='tweet']",
      "article[role='article']",
      "article[data-tweet-id]",
    ],
    matches({ host }) {
      return (
        host === "x.com" ||
        host.endsWith(".x.com") ||
        host === "twitter.com" ||
        host.endsWith(".twitter.com")
      )
    },
  },
  {
    id: "google",
    label: "google",
    adapter: "googleAdsTransparency",
    candidateMode: "googleAdsTransparency",
    buttonMode: "googleAdsTransparency",
    cardSelectors: [
      "creative-preview",
      "a[href*='/advertiser/'][href*='/creative/'][aria-label^='Advertisement']",
    ],
    matches({ host }) {
      return host.includes("adstransparency.google.com")
    },
  },
  {
    id: "google-ads",
    label: "google-ads",
    adapter: "googleAdsMarketing",
    candidateMode: "none",
    buttonMode: "none",
    cardSelectors: [],
    matches({ host }) {
      return host === "ads.google.com" || host.endsWith(".ads.google.com")
    },
  },
  {
    id: "tumblr",
    label: "tumblr",
    adapter: "tumblr",
    candidateMode: "backgroundCapture",
    buttonMode: "none",
    cardSelectors: ["article", "[data-id]"],
    matches({ host }) {
      return host === "www.tumblr.com" || host.endsWith(".tumblr.com")
    },
  },
]
