// Preset definitions for video automation templates. Each preset seeds an
// AutomationVideoFormat (segments + text overlays) modeled on the winning
// low-effort TikTok ad formats: react & reveal, compilation, birdseye POV,
// screen record, screenshot pictures, and aesthetic video. Carousel is
// intentionally absent — slideshow automations already cover it.
import {
  defaultAutomationTextItem,
  type AutomationVideoFormat,
  type AutomationVideoSegment,
  type AutomationVideoTemplateId,
} from "@/lib/realfarm-automation"

export type VideoAutomationTemplatePreset = {
  id: AutomationVideoTemplateId
  name: string
  tagline: string
  description: string
  buildFormat: () => AutomationVideoFormat
}

export function videoSegmentPlaysFull(
  format: AutomationVideoFormat,
  segment: AutomationVideoSegment
) {
  return (
    segment.playFullVideo === true ||
    segment.mediaSource === "demo_asset" ||
    (format.template === "react_reveal" &&
      ["react-anticipation", "react-reveal"].includes(segment.id)) ||
    (format.template === "screen_record" &&
      ["screen-intro", "screen-demo", "screen-outro"].includes(segment.id))
  )
}

function segment(
  input: Partial<AutomationVideoSegment> & { id: string; label: string }
): AutomationVideoSegment {
  return {
    guidance: "",
    mediaSource: "collection",
    mediaKind: "video",
    collectionId: "",
    demoAssetId: "",
    clipCount: 1,
    clipDurationMs: 2500,
    transition: "cut",
    textItems: [],
    ...input,
  }
}

const ugcAdPreset: VideoAutomationTemplatePreset = {
  id: "ugc_ad",
  name: "UGC Ad",
  tagline: "Avatar intro, then demo clip",
  description:
    "The original AI UGC ad: an avatar hook clip followed by a demo video with hook text overlays.",
  buildFormat: () => ({
    template: "ugc_ad",
    hookPlacement: "first_segment",
    globalTextItems: [],
    segments: [],
  }),
}

const reactRevealPreset: VideoAutomationTemplatePreset = {
  id: "react_reveal",
  name: "React & Reveal",
  tagline: "Full reaction clip, then the full reveal",
  description:
    "Opens on a talking-head or teaser clip that sets up a curiosity loop, then cuts to the reveal. The payoff has to feel worth the wait.",
  buildFormat: () => ({
    template: "react_reveal",
    hookPlacement: "first_segment",
    globalTextItems: [],
    segments: [
      segment({
        id: "react-anticipation",
        label: "Anticipation",
        guidance:
          "Talking-head or teaser clip that sets up curiosity. The hook text makes an intriguing claim the reveal must pay off.",
        clipCount: 1,
        playFullVideo: true,
        textItems: [
          defaultAutomationTextItem({
            contentDirection: "hook text that opens a curiosity loop",
            textStyle: "outline",
            fontSize: "10px",
            textPosition: "center",
            textItemWidth: "80%",
          }),
        ],
      }),
      segment({
        id: "react-reveal",
        label: "Reveal",
        guidance:
          "The payoff: play the selected demo video in full so it delivers the feature, result, or proof promised by the hook.",
        mediaSource: "demo_asset",
        mediaKind: "video",
        clipCount: 1,
        playFullVideo: true,
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "payoff caption that delivers on the hook with a specific, tangible result",
            textStyle: "outline",
            fontSize: "8px",
            textPosition: "bottom",
            textItemWidth: "84%",
            wordLengthMin: 6,
            wordLengthMax: 14,
          }),
        ],
      }),
    ],
  }),
}

const compilationPreset: VideoAutomationTemplatePreset = {
  id: "compilation",
  name: "Compilation",
  tagline: "4-6 fast cuts, one persistent hook",
  description:
    "Stitches 4-6 clips from different angles or use cases with cuts every 2-3 seconds, under one persistent hook caption. Gives the algorithm multiple hooks to test.",
  buildFormat: () => ({
    template: "compilation",
    hookPlacement: "global",
    globalTextItems: [
      defaultAutomationTextItem({
        contentDirection:
          "one relatable hook caption shown for the whole video, lowercase",
        textStyle: "outline",
        fontSize: "9px",
        textPosition: "bottom",
        textItemWidth: "84%",
      }),
    ],
    segments: [
      segment({
        id: "compilation-clips",
        label: "Clips",
        guidance:
          "4-6 clips of the subject from different angles or scenarios. Keep the whole video under 15 seconds.",
        clipCount: 6,
        clipDurationMs: 1800,
      }),
    ],
  }),
}

const birdseyePovPreset: VideoAutomationTemplatePreset = {
  id: "birdseye_pov",
  name: "Birdseye POV",
  tagline: "Problem clip, then the better way",
  description:
    "Overhead over-the-shoulder shots that feel personal — a generic 'problem' example first, then quick cuts through the better alternative. Low production, high trust.",
  buildFormat: () => ({
    template: "birdseye_pov",
    hookPlacement: "first_segment",
    globalTextItems: [],
    segments: [
      segment({
        id: "birdseye-problem",
        label: "Problem",
        guidance:
          "Overhead/POV clip showing the generic, uninspiring status quo. Text names the relatable problem.",
        clipCount: 1,
        clipDurationMs: 2600,
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "relatable problem caption, lowercase, ending with 😩🚫",
            textStyle: "outline",
            fontSize: "9px",
            textPosition: "top",
            textItemWidth: "84%",
          }),
        ],
      }),
      segment({
        id: "birdseye-payoff",
        label: "Payoff",
        guidance:
          "Quick cuts through the better alternative, same overhead POV. Text flips the problem into the win.",
        clipCount: 4,
        clipDurationMs: 1900,
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "payoff caption that mirrors the problem caption, lowercase, ending with 🥳✅",
            textStyle: "outline",
            fontSize: "9px",
            textPosition: "top",
            textItemWidth: "84%",
            wordLengthMin: 5,
            wordLengthMax: 10,
          }),
        ],
      }),
    ],
  }),
}

const screenRecordPreset: VideoAutomationTemplatePreset = {
  id: "screen_record",
  name: "Screen Record",
  tagline: "Talk 3s, cut to the demo, close",
  description:
    "Hybrid demo: a person speaks for ~3 seconds, cut to a real-time screen recording of the product, close with a short call to action.",
  buildFormat: () => ({
    template: "screen_record",
    hookPlacement: "first_segment",
    globalTextItems: [],
    segments: [
      segment({
        id: "screen-intro",
        label: "Talking-head intro",
        guidance:
          "Person addressing the camera with the pain point. Hook text sits in a bold pill at the top.",
        clipCount: 1,
        clipDurationMs: 2900,
        playFullVideo: true,
        textItems: [
          defaultAutomationTextItem({
            contentDirection: "pain-point hook question with an emoji",
            textStyle: "background",
            fontSize: "9px",
            textPosition: "top",
            textItemWidth: "84%",
          }),
        ],
      }),
      segment({
        id: "screen-demo",
        label: "Screen demo",
        guidance:
          "Real-time screen recording walking through the most relevant feature. Keep it moving — no dead air.",
        mediaSource: "demo_asset",
        clipCount: 1,
        clipDurationMs: 20_000,
        playFullVideo: true,
      }),
      segment({
        id: "screen-outro",
        label: "Outro",
        guidance: "1-2 second talking-head close with a direct call to action.",
        clipCount: 1,
        clipDurationMs: 1800,
        playFullVideo: true,
        textItems: [
          defaultAutomationTextItem({
            contentDirection: "short direct call to action",
            textStyle: "outline",
            fontSize: "9px",
            textPosition: "bottom",
            textItemWidth: "80%",
            wordLengthMin: 3,
            wordLengthMax: 8,
          }),
        ],
      }),
    ],
  }),
}

const screenshotPicturesPreset: VideoAutomationTemplatePreset = {
  id: "screenshot_pictures",
  name: "Screenshot Pictures",
  tagline: "Static proof with a mini plot",
  description:
    "A slow sequence of static images — DMs, reviews, in-app moments — carried by a first-person narrative. Reads fast and feels like proof.",
  buildFormat: () => ({
    template: "screenshot_pictures",
    hookPlacement: "first_segment",
    globalTextItems: [],
    segments: [
      segment({
        id: "screenshot-hook",
        label: "Hook",
        guidance:
          "Selfie clip or image that opens the mini-story with a relatable problem or intent.",
        mediaKind: "video",
        clipCount: 1,
        clipDurationMs: 4800,
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "first-person hook that opens a mini-story, lowercase, casual",
            textStyle: "outline",
            fontSize: "9px",
            textPosition: "center",
            textItemWidth: "84%",
          }),
        ],
      }),
      segment({
        id: "screenshot-story",
        label: "Story screenshots",
        guidance:
          "Static screenshots that advance the story step by step (browsing, choosing, using). Each holds ~5 seconds.",
        mediaKind: "image",
        clipCount: 3,
        clipDurationMs: 5000,
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "first-person narrative caption for this step of the story, lowercase, casual",
            textStyle: "outline",
            fontSize: "8px",
            textPosition: "bottom",
            textItemWidth: "84%",
            wordLengthMin: 6,
            wordLengthMax: 14,
          }),
        ],
      }),
      segment({
        id: "screenshot-proof",
        label: "Proof",
        guidance:
          "The payoff screenshot: a DM, review, or result that lands the mini plot twist.",
        mediaKind: "image",
        clipCount: 1,
        clipDurationMs: 4200,
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "positive outcome payoff caption with an emotional beat, lowercase",
            textStyle: "outline",
            fontSize: "9px",
            textPosition: "center",
            textItemWidth: "80%",
            wordLengthMin: 4,
            wordLengthMax: 10,
          }),
        ],
      }),
    ],
  }),
}

const aestheticPreset: VideoAutomationTemplatePreset = {
  id: "aesthetic",
  name: "Aesthetic Video",
  tagline: "Mood clips + one long caption",
  description:
    "5-6 smooth, mood-consistent clips with music doing the heavy lifting, under one long monologue caption in a translucent box.",
  buildFormat: () => ({
    template: "aesthetic",
    // The monologue caption is AI-written from the hook rather than being the
    // raw hook itself, so no text item carries the hook directly.
    hookPlacement: "first_segment",
    globalTextItems: [
      defaultAutomationTextItem({
        contentDirection:
          "long fyp monologue (60-110 words) that speaks directly to the viewer's identity, lowercase, ends with a soft invitation",
        textStyle: "black50Background",
        fontSize: "6px",
        textPosition: "top",
        textItemWidth: "84%",
        wordLengthMin: 60,
        wordLengthMax: 110,
      }),
    ],
    segments: [
      segment({
        id: "aesthetic-clips",
        label: "Aesthetic clips",
        guidance:
          "5-6 short clips with a consistent aesthetic and mood. Smooth cuts, no harsh transitions.",
        clipCount: 6,
        clipDurationMs: 1700,
        transition: "fade",
      }),
    ],
  }),
}

const storyOverBrollPreset: VideoAutomationTemplatePreset = {
  id: "story_over_broll",
  name: "Story over B-roll",
  tagline: "Four story beats over fast b-roll",
  description:
    "A first-person discovery, concrete journey, observable payoff, and comment-gate CTA told over quick b-roll cuts.",
  buildFormat: () => ({
    template: "story_over_broll",
    hookPlacement: "first_segment",
    globalTextItems: [],
    segments: [
      segment({
        id: "story-hook",
        label: "Story hook",
        guidance:
          "Open the first-person story with a specific discovery that creates an open loop for the later beats.",
        clipCount: 1,
        clipDurationMs: 2800,
        transition: "cut",
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "story-opening hook in first person: the discovery moment ('I found/tried/noticed X'). Specific, casual, lowercase-friendly. Must create an open loop the later beats pay off.",
            textStyle: "outline",
            fontSize: "9px",
            textPosition: "center",
            textItemWidth: "84%",
            wordLengthMin: 6,
            wordLengthMax: 14,
          }),
        ],
      }),
      segment({
        id: "story-journey",
        label: "Story journey",
        guidance:
          "Show the two concrete actions the narrator took after the discovery, in chronological order.",
        clipCount: 2,
        clipDurationMs: 2600,
        transition: "cut",
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "the doing-it beats, in order: what the narrator actually did next. Concrete physical actions, no abstractions.",
            textStyle: "outline",
            fontSize: "8px",
            textPosition: "center",
            textItemWidth: "84%",
            wordLengthMin: 5,
            wordLengthMax: 12,
          }),
        ],
      }),
      segment({
        id: "story-payoff",
        label: "Story payoff",
        guidance:
          "Land the story with an observable qualitative result; never invent proof, statistics, or numbers.",
        clipCount: 1,
        clipDurationMs: 3000,
        transition: "cut",
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              "the result/proof beat: what changed, stated as an observable outcome. NO invented numbers — if no proof is configured, express the outcome qualitatively ('and it actually worked').",
            textStyle: "outline",
            fontSize: "9px",
            textPosition: "center",
            textItemWidth: "84%",
            wordLengthMin: 5,
            wordLengthMax: 12,
          }),
        ],
      }),
      segment({
        id: "story-cta",
        label: "Story CTA",
        guidance:
          "Close with one uppercase trigger word and a clear resource the viewer receives for commenting it.",
        clipCount: 1,
        clipDurationMs: 2800,
        transition: "cut",
        textItems: [
          defaultAutomationTextItem({
            contentDirection:
              'comment-gate CTA: tell the viewer to comment a single trigger word to get the resource. Format: comment "WORD" + what they\'ll get.',
            textStyle: "background",
            fontSize: "8px",
            textPosition: "bottom",
            textItemWidth: "84%",
            wordLengthMin: 8,
            wordLengthMax: 16,
          }),
        ],
      }),
    ],
  }),
}

const facelessReelPreset: VideoAutomationTemplatePreset = {
  id: "faceless_reel",
  name: "Faceless Reel",
  tagline: "One energy clip, one bold claim",
  description:
    "A bold native claim held over one aesthetic clip, with a lower comment-gate line that trades one memorable word for a useful resource.",
  buildFormat: () => ({
    template: "faceless_reel",
    hookPlacement: "global",
    globalTextItems: [
      defaultAutomationTextItem({
        contentDirection:
          "one bold, specific claim or curiosity hook that stops the scroll — a big promise, secret, or identity callout. Native TikTok voice.",
        textStyle: "outline",
        fontSize: "10px",
        textPosition: "center",
        textItemWidth: "84%",
        wordLengthMin: 8,
        wordLengthMax: 18,
      }),
      defaultAutomationTextItem({
        contentDirection:
          "comment-gate line: \"comment 'WORD' and I'll DM you the full thing\"",
        textStyle: "background",
        fontSize: "7px",
        textPosition: "bottom",
        textItemWidth: "84%",
        wordLengthMin: 8,
        wordLengthMax: 14,
      }),
    ],
    segments: [
      segment({
        id: "faceless-clip",
        label: "Faceless clip",
        guidance:
          "One aesthetic or high-energy background clip that supports a bold claim without requiring a literal visual reference.",
        clipCount: 1,
        clipDurationMs: 9000,
        transition: "cut",
      }),
    ],
  }),
}

export const videoAutomationTemplatePresets: VideoAutomationTemplatePreset[] = [
  ugcAdPreset,
  reactRevealPreset,
  compilationPreset,
  birdseyePovPreset,
  screenRecordPreset,
  screenshotPicturesPreset,
  aestheticPreset,
  storyOverBrollPreset,
  facelessReelPreset,
]

export function videoAutomationTemplatePreset(
  id: AutomationVideoTemplateId | undefined
) {
  return (
    videoAutomationTemplatePresets.find((preset) => preset.id === id) ??
    ugcAdPreset
  )
}
