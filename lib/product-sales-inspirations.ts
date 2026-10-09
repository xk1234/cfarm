export type ProductSalesCreative = {
  visualHook: string
  textHook: string
  script: string[]
}

export type ProductSalesInspiration = {
  id: string
  source: {
    id?: string
    platform: "reel_farm" | "pdf" | "tiktok"
    label?: string
    category?: string
    creator: string
    url?: string
    assetName?: string
    page?: number
    views?: number
    likes?: number
    engagementRate?: number
  }
  original: ProductSalesCreative
  repurposed: ProductSalesCreative
  analysis?: {
    pattern: string
    whyItFits: string
  }
}

type ProductInput = {
  id?: string
  asin?: string
  name: string
  useCase: string
}

type SourceKey =
  | "choice-reveal"
  | "setback-proof"
  | "product-test"
  | "head-to-head"
  | "wrong-use"
  | "hidden-detail"

type SourceDefinition = Pick<ProductSalesInspiration, "source" | "original"> & {
  pattern: string
}

type CuratedConcept = {
  id: string
  source: SourceKey
  visualHook: string
  textHook: string
  script: string[]
  whyItFits: string
}

const REEL_FARM_DATABASE_URL =
  "https://reel.farm/dashboard/database?view=browse"

const SOURCES: Record<SourceKey, SourceDefinition> = {
  "choice-reveal": {
    source: {
      platform: "reel_farm",
      label: "Choice reveal",
      creator: "@homedecorave",
      url: REEL_FARM_DATABASE_URL,
      views: 91_500_000,
      likes: 3_100_000,
      engagementRate: 0.034,
    },
    original: {
      visualHook:
        "A fixed wide shot of an awkward unused stairwell gap, circled in red. Every option is revealed from the identical camera angle.",
      textHook: "??? which one should I go with",
      script: ["??? which one should I go with", "#1", "#2", "#3", "#4", "#5"],
    },
    pattern:
      "An unresolved visual choice creates curiosity; identical framing makes every option effortless to compare.",
  },
  "setback-proof": {
    source: {
      platform: "reel_farm",
      label: "Specific setback proof",
      creator: "@lu.casteli",
      url: REEL_FARM_DATABASE_URL,
      views: 20_000_000,
      likes: 3_900_000,
      engagementRate: 0.195,
    },
    original: {
      visualHook:
        "A recognizable product fills a clean editorial frame, with negative space reserved for one short, surprising claim.",
      textHook: "dyson built 5126 failed prototypes",
      script: [
        "Dyson built 5,126 failed prototypes.",
        "The Ordinary's branding was called too plain to sell.",
        "Glossier started as a cringe blog with no team.",
      ],
    },
    pattern:
      "A specific obstacle creates tension while a polished product image signals that a satisfying reversal is coming.",
  },
  "product-test": {
    source: {
      platform: "pdf",
      label: "Product test",
      creator: "Creator College",
      assetName: "04-Viral Hooks.pdf",
      page: 1,
    },
    original: {
      visualHook:
        "The PDF supplies no visual direction. A product-and-problem test setup is inferred for slideshow use.",
      textHook: "Is this product overhyped? Let's put it to the test...",
      script: [
        "The PDF supplies this hook line only; no continuation script is included.",
      ],
    },
    pattern:
      "A declared test gives the carousel a question, method, evidence, and verdict instead of an unsupported recommendation.",
  },
  "head-to-head": {
    source: {
      platform: "pdf",
      label: "Head-to-head comparison",
      creator: "Creator College",
      assetName: "04-Viral Hooks.pdf",
      page: 2,
    },
    original: {
      visualHook:
        "The PDF supplies no visual direction. A controlled side-by-side demonstration is inferred for slideshow use.",
      textHook:
        "Let's compare these two products and see which one is worth your money",
      script: [
        "The PDF supplies this hook line only; no continuation script is included.",
      ],
    },
    pattern:
      "A controlled comparison turns preference into observable criteria and gives each slide a clear job.",
  },
  "wrong-use": {
    source: {
      platform: "pdf",
      label: "Wrong-use correction",
      creator: "Creator College",
      assetName: "04-Viral Hooks.pdf",
      page: 3,
    },
    original: {
      visualHook:
        "The PDF supplies no visual direction. A wrong-versus-right demonstration is inferred for slideshow use.",
      textHook:
        "Wrong-use template (paraphrased): point out a common usage mistake.",
      script: [
        "The PDF supplies a hook template only; no continuation script is included.",
      ],
    },
    pattern:
      "The correction creates immediate contrast, while one practical setup step makes the content useful rather than accusatory.",
  },
  "hidden-detail": {
    source: {
      platform: "pdf",
      label: "The part demos omit",
      creator: "Creator College",
      assetName: "04-Viral Hooks.pdf",
      page: 3,
    },
    original: {
      visualHook:
        "The PDF supplies no visual direction. A close-up of the overlooked setup or limitation is inferred for slideshow use.",
      textHook:
        "Hidden-detail template (paraphrased): reveal the step most demonstrations omit.",
      script: [
        "The PDF supplies a hook template only; no continuation script is included.",
      ],
    },
    pattern:
      "Showing the omitted step builds trust and creates a reveal without hiding preparation or limitations.",
  },
}

const PRODUCT_CONCEPTS: Record<string, CuratedConcept[]> = {
  B081VQTG2Q: [
    concept(
      "one-square-test",
      "product-test",
      "Tape off one dirty grout square. Place the compact scrubber beside it and keep every slide at the same macro angle.",
      "I gave this scrubber one grout square to prove itself.",
      [
        "I gave this scrubber one grout square to prove itself.",
        "No flattering before photo. This is the actual grout.",
        "Same cleaner. Same lighting. One powered pass.",
        "The clean track appears directly behind the head.",
        "Now compare the test square with the grout around it.",
        "If that difference matters in your bathroom, check the head size before buying.",
      ],
      "The small head creates a precise clean track that reads instantly in a still image."
    ),
    concept(
      "three-grout-options",
      "choice-reveal",
      "Circle one stained grout line, then reveal a toothbrush, spray bottle, and Rubbermaid scrubber in the exact same position.",
      "Which one would you use on this grout line?",
      [
        "Which one would you use on this grout line?",
        "#1: toothbrush and elbow grease",
        "#2: spray, wait, then scrub",
        "#3: Rubbermaid power scrubber",
        "Same grout. Three methods. One close-up result.",
        "I would pick the method that reaches the corners without wrecking my wrist.",
      ],
      "The product is easiest to understand when viewers compare its compact powered head with familiar manual alternatives."
    ),
    concept(
      "head-choice",
      "hidden-detail",
      "Open on the scrubber head failing to sit flat in a narrow corner, then show the correct head meeting the grout line.",
      "The satisfying scrub is easy. Picking the right head is the real trick.",
      [
        "The satisfying scrub is easy. Picking the right head is the real trick.",
        "Wide surface? Use the broad head.",
        "Grout line or tap base? Use the pointed head.",
        "Let the bristles do the work; do not force the motor.",
        "Then show one uninterrupted cleaning pass.",
        "Check the spaces you need to clean before choosing the kit.",
      ],
      "Head selection is a real buying and usage question, so the hook offers useful proof instead of generic hype."
    ),
  ],
  B0BNLT3X59: [
    concept(
      "clean-without-kneeling",
      "setback-proof",
      "Show a grimy shower floor from standing height with the long scrubber already reaching the far corner; leave clear space for the hook.",
      "The shower floor was not the problem. Cleaning it on my knees was.",
      [
        "The shower floor was not the problem. Cleaning it on my knees was.",
        "A hand brush reaches the grime. It also puts you on the floor.",
        "This handle reaches the same corner while you stay standing.",
        "Swap to the corner head for the edge the round brush misses.",
        "Pull back to the dry, finished floor.",
        "Measure your shower and storage space before choosing a handle this long.",
      ],
      "The long handle solves a different, highly visible problem from the compact scrubbers: body position."
    ),
    concept(
      "eight-heads-edit",
      "hidden-detail",
      "Arrange all eight heads in a clean grid, then circle only the three used for the actual bathroom sequence.",
      "Eight heads sounds useful. You will probably reach for these three.",
      [
        "Eight heads sounds useful. You will probably reach for these three.",
        "Large flat brush: floor and broad tile.",
        "Corner brush: grout edges and tap bases.",
        "Soft head: surfaces that need a gentler pass.",
        "The rest only matter if they match jobs in your home.",
        "Buy the kit for the heads you will use, not the number on the box.",
      ],
      "The large accessory count is both the attraction and the objection; editing it down creates buyer clarity."
    ),
    concept(
      "far-corner-test",
      "product-test",
      "Mark a shower corner beyond easy arm's reach and show the long handle entering frame without the creator kneeling.",
      "Can a long-handle scrubber clean the corner you usually avoid?",
      [
        "Can a long-handle scrubber clean the corner you usually avoid?",
        "Start with the untouched corner in full view.",
        "Choose the head that can sit flat against both surfaces.",
        "One slow pass. No jump cut over the hard part.",
        "Show the corner and the surrounding tile together.",
        "The result matters; so does whether the handle feels controllable in your bathroom.",
      ],
      "The awkward far corner gives the long handle a fair, product-specific test."
    ),
  ],
  B07J1RPL4D: [
    concept(
      "drill-cleaning-mode",
      "wrong-use",
      "Show a normal cordless drill, then snap on the brush attachment while the dirty oven door stays visible behind it.",
      "Your drill has a cleaning mode. It just did not come in the box.",
      [
        "Your drill has a cleaning mode. It just did not come in the box.",
        "Lock the brush into the chuck like a drill bit.",
        "Use the brush stiffness that matches the surface.",
        "Start slowly on one test patch.",
        "Let the rotating bristles reveal one clean stripe.",
        "Skip delicate finishes until you have tested a hidden spot.",
      ],
      "The transformation of a familiar drill into a scrubber is the product's strongest surprise."
    ),
    concept(
      "one-stripe-verdict",
      "product-test",
      "Divide a soap-scummed panel with tape and place the drill brush on one side before the first pass.",
      "One stripe will tell us whether this drill brush is worth storing.",
      [
        "One stripe will tell us whether this drill brush is worth storing.",
        "Same residue on both sides of the tape.",
        "One side gets a normal hand scrub.",
        "One side gets the drill brush at low speed.",
        "Remove the tape and show both finishes together.",
        "Judge the result, control, and cleanup—not just the speed.",
      ],
      "A taped comparison supplies visible evidence and avoids relying on broad cleaning claims."
    ),
  ],
  B0967C18JP: [
    concept(
      "forty-five-piece-reality",
      "hidden-detail",
      "Pour the full kit onto a plain surface, then group four heads beside a sink, hob, tile corner, and car panel.",
      "Forty-five pieces sounds excessive until each surface gets its own head.",
      [
        "Forty-five pieces sounds excessive until each surface gets its own head.",
        "Soft pad: polished surface.",
        "Stiff brush: stubborn residue.",
        "Small head: corners and fittings.",
        "Polishing pad: the finishing pass.",
        "If you only clean one surface, you do not need the whole kit.",
      ],
      "The kit's visual abundance is compelling only when organized around real jobs rather than raw piece count."
    ),
    concept(
      "four-surface-test",
      "product-test",
      "Build a four-panel first slide: sink, hob, grout corner, and car panel, each with the matching attachment in frame.",
      "Can one drill kit handle four completely different surfaces?",
      [
        "Can one drill kit handle four completely different surfaces?",
        "Test 1: sink residue with a medium brush.",
        "Test 2: hob buildup with a suitable non-scratch pad.",
        "Test 3: tile corner with the small head.",
        "Test 4: car panel with the polishing pad.",
        "The useful number is not 45. It is how many jobs fit your home.",
      ],
      "Rapid head swaps and visibly different surfaces make versatility understandable in a carousel."
    ),
    concept(
      "kit-vs-drawer",
      "head-to-head",
      "Split the frame between the organized kit and a drawer of separate brushes and pads used for the same four jobs.",
      "One 45-piece kit or four separate cleaning tools?",
      [
        "One 45-piece kit or four separate cleaning tools?",
        "Compare the jobs both setups can actually complete.",
        "Then compare setup time and control.",
        "Now compare storage after everything is dry.",
        "The kit wins only if its useful heads replace tools you already keep.",
        "Count your real cleaning jobs before counting the pieces.",
      ],
      "The purchase decision is about consolidation and storage, not an abstract accessory total."
    ),
  ],
  B082YW95XK: [
    concept(
      "rental-wall-choice",
      "head-to-head",
      "Split one plain wall vertically: paint swatch and roller on the left, faux-brick sheet and squeegee on the right.",
      "Paint or peel-and-stick brick: which would you risk in a rental?",
      [
        "Paint or peel-and-stick brick: which would you risk in a rental?",
        "Paint changes the color but needs prep and a clean exit plan.",
        "Peel-and-stick changes the texture but exposes every bad seam.",
        "Apply one sheet from the same top corner.",
        "Pull back only after the edge and pattern match are visible.",
        "Test adhesion on your wall finish before covering the whole room.",
      ],
      "Rental reversibility and seam quality are more persuasive than a generic room makeover."
    ),
    concept(
      "judge-the-corner",
      "hidden-detail",
      "Start on a tight inside corner where two faux-brick sheets meet, not on the flattering finished wall.",
      "Do not judge faux brick from the middle. Judge this corner.",
      [
        "Do not judge faux brick from the middle. Judge this corner.",
        "A good front view can hide a bad edge.",
        "Align the brick pattern before pressing the sheet flat.",
        "Trim the corner with a fresh blade and firm guide.",
        "Then reveal the full feature wall.",
        "If the seam still looks right up close, the wide shot has earned itself.",
      ],
      "Close-up seam credibility answers the main visual objection to faux finishes."
    ),
  ],
  B07Q98WXDR: [
    concept(
      "half-counter-test",
      "product-test",
      "Cover exactly half the worn counter and stop at a ruler-straight divide so old and new remain in one frame.",
      "Cover half the counter. Then decide if the other half is worth doing.",
      [
        "Cover half the counter. Then decide if the other half is worth doing.",
        "Clean and dry the surface first.",
        "Align the stone pattern before removing all the backing.",
        "Smooth from the center and work air toward the edge.",
        "Stop at halfway. Show old and new under the same light.",
        "Only finish the job if the seam, color, and texture pass the close-up.",
      ],
      "The product creates its own proof asset: a dramatic half-covered comparison."
    ),
    concept(
      "replace-or-wrap",
      "head-to-head",
      "Frame the tired counter between a replacement quote folder and the rolled liner, keeping both options visually literal.",
      "Replace this counter or wrap it first?",
      [
        "Replace this counter or wrap it first?",
        "Replacement changes the material and construction.",
        "A liner changes the visible finish.",
        "Show the liner around one edge and one flat section.",
        "Inspect the seam and heat-prone area before calling it done.",
        "Choose the wrap for a cosmetic fix—not as a claim that the counter became stone.",
      ],
      "The hook positions the liner honestly as a cosmetic alternative rather than overstating it as renovation."
    ),
    concept(
      "edge-is-the-test",
      "hidden-detail",
      "Lead with the liner wrapping the counter's front edge while the flat top remains out of focus.",
      "The flat surface is easy. This edge decides whether the wrap looks convincing.",
      [
        "The flat surface is easy. This edge decides whether the wrap looks convincing.",
        "Warm and guide the material only as the instructions allow.",
        "Keep the pattern straight while the edge turns.",
        "Press out air before sealing the underside.",
        "Now pull back to the full counter.",
        "Check the edge and seam in daylight before covering more.",
      ],
      "Edges and seams are the real credibility test for contact-paper transformations."
    ),
  ],
  B08FCF7BN3: [
    concept(
      "one-drawer-reset",
      "choice-reveal",
      "Circle one scratched drawer base, then reveal plain liner, solid-color liner, and the checkered sheet from the same overhead angle.",
      "Which finish would make you stop hating this drawer?",
      [
        "Which finish would make you stop hating this drawer?",
        "#1: leave the scratched base visible",
        "#2: cover it with a plain solid",
        "#3: use the checkered sheet",
        "Cut once, align the first row, then smooth outward.",
        "The pattern only works if the edges stay square.",
      ],
      "The graphic pattern produces a distinct choice and a satisfying overhead reveal in a small, achievable space."
    ),
    concept(
      "first-row-rule",
      "wrong-use",
      "Show a checkered sheet starting slightly crooked, exaggerating the drift by the far edge, then reset it against a square guide.",
      "One crooked row can ruin the whole checkerboard.",
      [
        "One crooked row can ruin the whole checkerboard.",
        "Do not start by peeling the entire backing.",
        "Square the first row against a real edge.",
        "Peel a little, press a little, and keep checking alignment.",
        "Finish with one continuous overhead reveal.",
        "Use a small drawer or shelf first if you have never applied patterned film.",
      ],
      "Pattern drift is immediately visible, making alignment a more credible hook than generic ease-of-use claims."
    ),
  ],
  B0D57TSX8Q: [
    concept(
      "first-tile-decides",
      "wrong-use",
      "Place the first ivory-slate tile visibly off-level, overlay a red guide, then show the corrected tile starting the running bond.",
      "The first tile decides whether the whole backsplash looks cheap.",
      [
        "The first tile decides whether the whole backsplash looks cheap.",
        "Find a level reference before removing the backing.",
        "Dry-place the first row and check the pattern break.",
        "Press the first tile only when the edge is true.",
        "Build the running bond from that reference.",
        "Check the last edge before committing to the full wall.",
      ],
      "The modular tile layout makes one setup mistake multiply visibly across every later slide."
    ),
    concept(
      "tile-or-sticker",
      "head-to-head",
      "Split the backsplash between a real tile sample with mortar tools and the peel-and-stick tile with a cutting guide.",
      "Real tile or peel-and-stick: what are you actually paying for?",
      [
        "Real tile or peel-and-stick: what are you actually paying for?",
        "Real tile changes the wall system and needs wet installation.",
        "Peel-and-stick changes the visible face with lighter tools.",
        "Compare the edge, seam, and reflection at arm's length.",
        "Then compare the same details in a close-up.",
        "Choose based on permanence, surface condition, and the finish you can accept.",
      ],
      "The product invites a high-intent comparison, but the script keeps permanence and finish claims honest."
    ),
    concept(
      "last-edge",
      "hidden-detail",
      "Open on the final narrow tile beside a cabinet edge, with the measurement and cut line visible.",
      "The middle tiles are satisfying. This last edge is the real job.",
      [
        "The middle tiles are satisfying. This last edge is the real job.",
        "Measure the remaining gap at the top and bottom.",
        "Transfer both marks before cutting.",
        "Dry-fit the piece before exposing the adhesive.",
        "Press the edge, then reveal the full backsplash.",
        "Judge the makeover by the cuts, not only the wide shot.",
      ],
      "The awkward final cut separates believable DIY content from a frictionless montage."
    ),
  ],
  B0CKKW7KZG: [
    concept(
      "closet-no-outlet",
      "setback-proof",
      "Start inside a dark closet with no visible outlet; the closed door opens and the ceiling light triggers above the lens.",
      "No outlet. No electrician. Just open the closet door.",
      [
        "No outlet. No electrician. Just open the closet door.",
        "The problem was not the bulb. This closet had no light point.",
        "Mount the magnetic base where the sensor can see the door opening.",
        "Walk in and let the light trigger without touching it.",
        "Detach the light to show how charging works.",
        "Check sensor placement and charging access before fixing the mount.",
      ],
      "The motion trigger and detachable charging mechanism can both be proven in a simple door-opening sequence."
    ),
    concept(
      "sensor-position-test",
      "product-test",
      "Show three possible ceiling positions marked A, B, and C, then capture whether the light triggers as the door opens from each one.",
      "Where should a motion light sit so it turns on before you need it?",
      [
        "Where should a motion light sit so it turns on before you need it?",
        "Position A: too deep inside the closet.",
        "Position B: blocked by the open door.",
        "Position C: clear view of the entrance.",
        "Test the trigger before attaching the mount permanently.",
        "The best light is useless if the sensor cannot see you.",
      ],
      "Placement, not brightness alone, determines whether this ceiling product solves the user's real problem."
    ),
  ],
  B0FBRPPT5L: [
    concept(
      "cabinet-wakeup",
      "choice-reveal",
      "Keep one dark cabinet locked in frame; reveal no light, one center light, then three lights activating in sequence.",
      "How many lights does this cabinet actually need?",
      [
        "How many lights does this cabinet actually need?",
        "#1: one bright spot in the middle",
        "#2: two lights with dark corners",
        "#3: three lights across the full shelf",
        "Open the door and show the activation sequence.",
        "Pick the count from the cabinet width, not the pack size.",
      ],
      "A three-pack earns its place only when viewers can see how spacing changes the cabinet."
    ),
    concept(
      "three-colour-test",
      "product-test",
      "Photograph the same countertop under all three color temperatures with identical exposure and a white object for reference.",
      "Warm, neutral, or white—which one makes this counter look right?",
      [
        "Warm, neutral, or white—which one makes this counter look right?",
        "Same counter. Same camera exposure.",
        "Warm mode: softer, yellower surface.",
        "Neutral mode: balanced everyday light.",
        "White mode: cooler, clearer task light.",
        "Choose the mode for the room, not the product photo.",
      ],
      "Three color modes create a legitimate visual comparison without inventing performance claims."
    ),
    concept(
      "charging-reality",
      "hidden-detail",
      "Open on one light removed from its magnetic strip and connected to charge while the other two remain installed.",
      "The motion reveal is the fun part. Charging all three is the part to plan.",
      [
        "The motion reveal is the fun part. Charging all three is the part to plan.",
        "Mount them where they can slide or lift off easily.",
        "Check whether one cable can reach your charging spot.",
        "Rotate charging so the cabinet is never completely dark.",
        "Then show all three back in place and triggering together.",
        "The pack works best when charging is easy enough to keep doing.",
      ],
      "Rechargeability is a real ownership detail and a stronger trust hook than another generic dark-to-light reveal."
    ),
  ],
  B0C4GXSL33: [
    concept(
      "pantry-depth",
      "setback-proof",
      "Show an unlit deep pantry where the back row disappears, then repeat the exact frame as four bars illuminate separate shelf zones.",
      "This pantry did not need more shelves. It needed light at the back.",
      [
        "This pantry did not need more shelves. It needed light at the back.",
        "An overhead bulb leaves the front bright and the back hidden.",
        "Place one bar where each shelf starts losing visibility.",
        "Walk past the sensor and keep the camera exposure fixed.",
        "Now every row can be seen without moving the front items.",
        "Map the dark zones before deciding how many bars you need.",
      ],
      "Four separate bars solve distributed shadow, a more specific and visible problem than general brightness."
    ),
    concept(
      "overhead-vs-bars",
      "head-to-head",
      "Split the same pantry between its overhead light and four shelf-level bars, keeping exposure locked.",
      "One ceiling light or four shelf lights—which shows more of the pantry?",
      [
        "One ceiling light or four shelf lights—which shows more of the pantry?",
        "Use the same camera exposure for both setups.",
        "Ceiling light: bright entrance, shadowed shelves.",
        "Shelf bars: light closer to the stored items.",
        "Compare the back row, corners, and glare.",
        "Choose the layout that fixes your actual shadow pattern.",
      ],
      "The product's benefit is spatial distribution, which a locked-exposure comparison can demonstrate honestly."
    ),
  ],
  B0DZ2734F6: [
    concept(
      "switch-problem",
      "setback-proof",
      "Frame a dim hallway from the doorway with the existing switch out of reach; a person steps in and the ceiling light triggers.",
      "The hallway was dark because the switch was in the wrong place.",
      [
        "The hallway was dark because the switch was in the wrong place.",
        "A brighter bulb would not move the switch.",
        "Position the sensor where it sees the first step into the hall.",
        "Mount the rechargeable light without opening the ceiling.",
        "Walk the route again and let the trigger prove the setup.",
        "Test the sensor before committing to the mount.",
      ],
      "This reframes the product around access and automatic triggering rather than unsupported brightness claims."
    ),
    concept(
      "no-wire-test",
      "product-test",
      "Lay out the magnetic mount, light, and charging cable on the floor beneath the intended ceiling position.",
      "Can this hallway get an automatic ceiling light without new wiring?",
      [
        "Can this hallway get an automatic ceiling light without new wiring?",
        "Start with the existing ceiling and no power point.",
        "Test the sensor and light position at head height first.",
        "Fix the magnetic mount only after the route works.",
        "Walk in, trigger the light, then detach it for charging.",
        "The trade-off is simple: easier installation, periodic charging.",
      ],
      "The install-versus-charging trade-off is the honest decision frame for a rechargeable ceiling light."
    ),
  ],
  B08CVKDLWQ: [
    concept(
      "draw-one-line",
      "product-test",
      "Place the pen tip on one discolored grout line and stop halfway, leaving a sharp old-versus-new boundary.",
      "Do not redo the whole floor. Draw one line first.",
      [
        "Do not redo the whole floor. Draw one line first.",
        "Clean and dry one grout section.",
        "Run the pen over half the line only.",
        "Let it settle before judging the color.",
        "Show the untreated and revived halves in one macro frame.",
        "If the color match works, continue. If it does not, stop at one line.",
      ],
      "The pen produces a precise, low-risk test with an unusually clear split result."
    ),
    concept(
      "which-grout-line",
      "choice-reveal",
      "Circle four adjacent grout lines, then reveal one cleaned only, one recolored, one left alone, and one fully refreshed.",
      "Which grout line would you keep?",
      [
        "Which grout line would you keep?",
        "#1: cleaned, but still discolored",
        "#2: left exactly as it was",
        "#3: one fresh white pen pass",
        "#4: second pass after the first dried",
        "Choose the finish that matches the surrounding tile—not the brightest line.",
      ],
      "The grid itself creates a natural choice layout, while multiple treatments make the result more credible."
    ),
    concept(
      "prep-before-pen",
      "hidden-detail",
      "Open on the pen skipping over damp, dirty grout, then show the same line after cleaning and drying.",
      "The pen is not the first step. Clean grout is.",
      [
        "The pen is not the first step. Clean grout is.",
        "Remove surface dirt before covering the color.",
        "Let the grout dry so the coating can sit evenly.",
        "Test the shade in a small corner.",
        "Then draw the visible line in one controlled pass.",
        "Good preparation makes the before-and-after worth trusting.",
      ],
      "Preparation directly affects the visible finish and prevents the content from presenting the pen as magic."
    ),
  ],
  B09VGVRGZD: [
    concept(
      "dirty-or-failed-caulk",
      "setback-proof",
      "Show a stained, ragged caulk line after it has already been wiped clean, with the removal tool ready at one end.",
      "If this still looks dirty after cleaning, the problem may be the caulk.",
      [
        "If this still looks dirty after cleaning, the problem may be the caulk.",
        "Cleaner cannot straighten a torn seal.",
        "Use the removal edge to lift the failed bead.",
        "Clear the residue before adding new caulk.",
        "Use the profile tool to smooth one continuous seam.",
        "Judge the repair after it cures, not while it is still glossy.",
      ],
      "The hook distinguishes dirt from material failure, giving the tool a credible reason to exist."
    ),
    concept(
      "removal-first",
      "hidden-detail",
      "Lead with a macro shot of old caulk residue left behind after a rushed scrape, then show the clean channel before resealing.",
      "The smooth new bead is not the hard part. Removing the old one is.",
      [
        "The smooth new bead is not the hard part. Removing the old one is.",
        "Cut both edges of the failed seal.",
        "Lift the bead instead of smearing it across the joint.",
        "Remove residue from the channel.",
        "Only then lay and profile the replacement bead.",
        "The final seam can only be as clean as the surface under it.",
      ],
      "Removal is the less glamorous step that determines whether the final close-up looks convincing."
    ),
    concept(
      "one-seam-test",
      "product-test",
      "Divide one sink seam into an untouched half and a fully removed-and-resealed half, photographed from the same low angle.",
      "Can one five-in-one tool take this seam from ragged to clean?",
      [
        "Can one five-in-one tool take this seam from ragged to clean?",
        "Start with the whole failed joint visible.",
        "Remove only half so the comparison stays in frame.",
        "Clean, reseal, and profile that same half.",
        "Return after curing for the real result.",
        "The tool passes only if removal and finishing both look controlled.",
      ],
      "One seam lets the product demonstrate both of its meaningful functions without padding the carousel."
    ),
  ],
  B0C5SN4X3K: [
    concept(
      "no-paint-tray",
      "setback-proof",
      "Place a large paint tray beside one tiny wall scuff, then replace it with the refillable pen in the next frame.",
      "This wall scuff does not need a paint tray.",
      [
        "This wall scuff does not need a paint tray.",
        "It does need the correct leftover paint.",
        "Fill the pen and test the flow away from the wall.",
        "Touch only the scuffed area in thin passes.",
        "Let it dry before judging the color match.",
        "Use the pen for small marks—not as a shortcut for damaged paintwork.",
      ],
      "The absurd scale mismatch between tray and scuff explains the product instantly."
    ),
    concept(
      "dry-color-test",
      "hidden-detail",
      "Show the fresh touch-up looking too dark beside the wall, then the same patch after drying under identical light.",
      "Do not judge touch-up paint while it is wet.",
      [
        "Do not judge touch-up paint while it is wet.",
        "Match the original paint, not just a similar white.",
        "Test one tiny mark first.",
        "Let the patch dry under the room's normal light.",
        "Then compare it from straight on and from the side.",
        "The pen controls the application; the paint match controls the result.",
      ],
      "Dry-down and color matching are the honest limitations behind a visually satisfying scuff repair."
    ),
  ],
  B0DHS1Z5WT: [
    concept(
      "scratch-angle",
      "wrong-use",
      "Photograph the same scratch straight on and under side light, then place the matching marker beside both views.",
      "If the scratch only disappears from one angle, the color match is wrong.",
      [
        "If the scratch only disappears from one angle, the color match is wrong.",
        "Test two nearby shades on a hidden edge.",
        "Use the marker for color, not for filling a deep groove.",
        "Use wax only where the scratch needs material.",
        "Buff the repair and check it again under side light.",
        "Stop when the repair blends; more pigment can make it darker.",
      ],
      "Furniture repairs are judged by angle and light, so the hook exposes the real standard instead of hiding it."
    ),
    concept(
      "marker-vs-wax",
      "head-to-head",
      "Split one damaged board between a pale surface scratch and a deeper chip; place the marker over one and wax over the other.",
      "Marker or wax—which one does this scratch actually need?",
      [
        "Marker or wax—which one does this scratch actually need?",
        "Surface lost color but stayed flat: test the marker.",
        "Groove catches your nail: it may need wax first.",
        "Match the tone on a hidden area.",
        "Repair both and compare them under the same side light.",
        "Choose the tool from the depth of the damage, not the easiest applicator.",
      ],
      "The dual-tool kit becomes understandable when each tool is assigned to a visibly different defect."
    ),
  ],
  B07WP4165D: [
    concept(
      "six-frames",
      "setback-proof",
      "Show six picture frames drifting slightly across a wall, then project one laser line through all their intended top edges.",
      "Eyeballing one frame is easy. Matching six is where it falls apart.",
      [
        "Eyeballing one frame is easy. Matching six is where it falls apart.",
        "Choose one reference height for the whole row.",
        "Project the line across every hanging point.",
        "Mark each position without moving the reference.",
        "Hang the frames and switch the laser off.",
        "The proof is the row after the guide disappears.",
      ],
      "A multi-frame wall magnifies tiny alignment errors and makes the laser line instantly useful."
    ),
    concept(
      "laser-line-test",
      "product-test",
      "Place three intentionally crooked frames beneath a projected horizontal line, keeping both the error and correction visible.",
      "Can a small laser fix this gallery wall without measuring every frame twice?",
      [
        "Can a small laser fix this gallery wall without measuring every frame twice?",
        "Start with the crooked row fully visible.",
        "Set one reference point and project the cross-line.",
        "Move each frame to the same laser edge.",
        "Turn the laser off for the final test.",
        "The result should still look aligned without the green guide.",
      ],
      "The product's value survives the final slide only if the arrangement remains visibly level after the laser disappears."
    ),
  ],
  B088T5PPSK: [
    concept(
      "pipe-cut",
      "product-test",
      "Start with a floorboard blank pressed against a pipe, showing the impossible gap; place the locked contour gauge over the obstruction.",
      "This cut usually fails at the pipe. Let's try it once.",
      [
        "This cut usually fails at the pipe. Let's try it once.",
        "Press the gauge evenly around the full contour.",
        "Lock it before lifting it away.",
        "Transfer the shape without changing the orientation.",
        "Make one careful cut and slide the board into place.",
        "The test passes only if the first fit closes the gap.",
      ],
      "The pipe creates a universally legible problem and a single high-stakes reveal."
    ),
    concept(
      "lock-before-lift",
      "wrong-use",
      "Show an accurate contour changing shape as an unlocked gauge is lifted, then repeat with the lock engaged.",
      "The contour is useless if it moves before you trace it.",
      [
        "The contour is useless if it moves before you trace it.",
        "Press the pins square to the object.",
        "Check both ends reached the reference edge.",
        "Lock the shape before lifting the gauge.",
        "Trace it in the same orientation.",
        "The lock is what turns a good impression into a usable cut.",
      ],
      "The locking mechanism is the product-specific difference and can be demonstrated in two still frames."
    ),
    concept(
      "cardboard-vs-gauge",
      "head-to-head",
      "Split the first slide between a hand-trimmed cardboard template and the locked gauge around the same pipe.",
      "Cardboard template or contour gauge: which gets the first fit?",
      [
        "Cardboard template or contour gauge: which gets the first fit?",
        "Give both methods the same pipe and board.",
        "Show every adjustment needed for the cardboard template.",
        "Press and lock the gauge once.",
        "Transfer both shapes and make the cuts.",
        "Compare fit, correction needed, and whether the tool earns its storage space.",
      ],
      "The familiar cardboard workaround creates a fair alternative and a decisive first-fit payoff."
    ),
  ],
  B0CY3VP6GW: [
    concept(
      "self-level-snap",
      "product-test",
      "Set the laser visibly tilted on a workbench and capture the green cross settling level against a marked wall reference.",
      "Watch this crooked laser line correct itself.",
      [
        "Watch this crooked laser line correct itself.",
        "Start with the tool visibly off-level.",
        "Unlock self-leveling and keep the camera fixed.",
        "Let the green cross settle against the reference marks.",
        "Use the corrected line to place one shelf or tile row.",
        "Check the finished work with a separate level before trusting the setup.",
      ],
      "The self-leveling motion is the product's most distinctive visual event."
    ),
    concept(
      "bubble-vs-cross",
      "head-to-head",
      "Frame a short spirit level on one shelf and the green cross extending across the full wall behind it.",
      "A bubble checks one shelf. What checks the whole wall?",
      [
        "A bubble checks one shelf. What checks the whole wall?",
        "Use the spirit level on one short edge.",
        "Project the cross-line across every planned fixing point.",
        "Compare how many times each reference must move.",
        "Install from the chosen reference.",
        "Verify the final shelf before packing either tool away.",
      ],
      "The comparison focuses on reference coverage rather than claiming one leveling method is universally better."
    ),
  ],
  B0FGD3D7N1: [
    concept(
      "looked-level",
      "setback-proof",
      "Show a shelf that looks level to the eye, then attach the magnetic inclinometer and fill the negative space with its live reading.",
      "The shelf looked level. The display disagreed.",
      [
        "The shelf looked level. The display disagreed.",
        "Zero the tool on a known reference.",
        "Attach it to the shelf bracket or saw table.",
        "Read the angle before making an adjustment.",
        "Correct the setup and show the new reading.",
        "Then step back: the number matters only if the finished work is right.",
      ],
      "The live numerical disagreement creates tension without inventing a specific measurement."
    ),
    concept(
      "magnet-detail",
      "hidden-detail",
      "Open on the inclinometer holding itself to a vertical metal surface while both hands adjust the workpiece.",
      "The useful part is not the screen. It is having both hands free.",
      [
        "The useful part is not the screen. It is having both hands free.",
        "Check that the reference surface is clean and magnetic.",
        "Attach the inclinometer where the reading stays visible.",
        "Use both hands to adjust the shelf or machine angle.",
        "Stop when the target reading settles.",
        "For non-magnetic work, plan how the tool will sit before starting.",
      ],
      "The magnetic base changes the workflow in a way a static specification cannot communicate."
    ),
    concept(
      "bubble-vs-number",
      "head-to-head",
      "Place a bubble level and digital inclinometer on the same adjustable surface, with both readings visible in one frame.",
      "Bubble level or digital angle: which answer do you actually need?",
      [
        "Bubble level or digital angle: which answer do you actually need?",
        "For simple level, the bubble may be enough.",
        "For a target angle, the number is easier to repeat.",
        "Zero both tools on the same reference.",
        "Adjust the surface and compare what each tells you.",
        "Buy the digital tool for repeatable angles, not because a screen looks clever.",
      ],
      "The comparison gives buyers a concrete reason to choose digital precision without dismissing a cheaper tool."
    ),
  ],
}

export function buildAmazonHomeImprovementInspirations(
  _collectionId: string,
  product: ProductInput
): ProductSalesInspiration[] {
  const productId = (product.id || product.asin || "").toUpperCase()
  const concepts = PRODUCT_CONCEPTS[productId] ?? []

  return concepts.map((entry) => {
    const source = SOURCES[entry.source]
    return {
      id: entry.id,
      source: source.source,
      original: source.original,
      repurposed: {
        visualHook: entry.visualHook,
        textHook: entry.textHook,
        script: entry.script,
      },
      analysis: {
        pattern: source.pattern,
        whyItFits: entry.whyItFits,
      },
    }
  })
}

function concept(
  id: string,
  source: SourceKey,
  visualHook: string,
  textHook: string,
  script: string[],
  whyItFits: string
): CuratedConcept {
  return { id, source, visualHook, textHook, script, whyItFits }
}
