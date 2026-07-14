# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-daily-automation.spec.ts >> Journey 2 — daily automation >> import images, build an automation, run it, see it on the calendar
- Location: e2e/02-daily-automation.spec.ts:6:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.evaluate: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('aside').getByRole('button', { name: 'Collections', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - link "Skip to content" [ref=e3] [cursor=pointer]:
      - /url: "#main"
    - navigation [ref=e4]:
      - generic [ref=e5]:
        - link "LumenClip" [ref=e6] [cursor=pointer]:
          - /url: /
          - text: LumenClip
        - generic [ref=e8]:
          - link "Product" [ref=e9] [cursor=pointer]:
            - /url: /product
          - link "Solutions" [ref=e10] [cursor=pointer]:
            - /url: /solutions
          - link "Pricing" [ref=e11] [cursor=pointer]:
            - /url: /pricing
          - link "Careers" [ref=e12] [cursor=pointer]:
            - /url: /careers
        - generic [ref=e13]:
          - link "Log in" [ref=e14] [cursor=pointer]:
            - /url: /login
          - link "Create account" [ref=e15] [cursor=pointer]:
            - /url: /login?mode=register
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]:
          - heading "Stop rebuilding every piece of content from scratch." [level=1] [ref=e20]
          - paragraph [ref=e21]: Turn saved creative research into repeatable workflows, reusable assets, and approved content runs.
          - generic [ref=e22]:
            - link "Create account" [ref=e23] [cursor=pointer]:
              - /url: /login?mode=register
              - text: Create account
              - img [ref=e24]
            - link "See the product" [ref=e27] [cursor=pointer]:
              - /url: /product
              - img [ref=e28]
              - text: See the product
        - generic [ref=e34]:
          - generic [ref=e36]: Source record
          - paragraph [ref=e38]: The hook, transcript, visual, and angle stay connected.
          - generic [ref=e39]:
            - generic [ref=e40]: Hook
            - generic [ref=e41]: Assets
            - generic [ref=e42]: Proof
      - generic [ref=e45]:
        - generic [ref=e46]:
          - paragraph [ref=e47]: Source records
          - paragraph [ref=e48]: Research stays attached to the reason it mattered.
        - generic [ref=e49]:
          - paragraph [ref=e50]: Review gates
          - paragraph [ref=e51]: Nothing leaves the workspace before approval.
        - generic [ref=e52]:
          - paragraph [ref=e53]: Persisted runs
          - paragraph [ref=e54]: Useful attempts remain inspectable and reusable.
        - generic [ref=e55]:
          - paragraph [ref=e56]: Private by default
          - paragraph [ref=e57]: Every record belongs to its signed-in user.
      - generic [ref=e58]:
        - generic [ref=e59]:
          - heading "Your swipe folder is not a content system." [level=2] [ref=e60]
          - paragraph [ref=e61]: Screenshots lose context. Prompts drift. Good outputs disappear into export folders. The next campaign still starts with a blank document.
        - generic [ref=e62]:
          - generic [ref=e63]:
            - img [ref=e64]
            - paragraph [ref=e67]: Before
            - paragraph [ref=e68]: Loose links, unlabeled screenshots, copied prompts, and no clear path from research to output.
          - generic [ref=e69]:
            - img [ref=e70]
            - paragraph [ref=e72]: With LumenClip
            - paragraph [ref=e73]: One record connects the source, angle, assets, workflow, generated result, and next decision.
      - generic [ref=e75]:
        - heading "A straight path from evidence to output." [level=2] [ref=e76]
        - generic [ref=e77]:
          - article [ref=e78]:
            - img [ref=e79]
            - heading "Capture the source" [level=3] [ref=e84]
            - paragraph [ref=e85]: Save ads, pages, hooks, transcripts, and visual references while the context is still fresh.
          - article [ref=e86]:
            - img [ref=e87]
            - heading "Structure what worked" [level=3] [ref=e91]
            - paragraph [ref=e92]: Keep the promise, angle, assets, and notes together instead of losing them in a folder.
          - article [ref=e93]:
            - img [ref=e94]
            - heading "Run a repeatable workflow" [level=3] [ref=e98]
            - paragraph [ref=e99]: Turn proven inputs into scripts, slideshows, creator assets, and queued content runs.
          - article [ref=e100]:
            - img [ref=e101]
            - heading "Review before publishing" [level=3] [ref=e103]
            - paragraph [ref=e104]: Inspect every generated artifact and keep approval between the model and your audience.
      - generic [ref=e105]:
        - heading "One workspace for the parts that usually scatter." [level=2] [ref=e106]
        - generic [ref=e107]:
          - article [ref=e108]:
            - img "LumenClip visual system and product surface" [ref=e109]
            - generic [ref=e111]:
              - img [ref=e112]
              - heading "Creative research that stays usable." [level=3] [ref=e117]
              - paragraph [ref=e118]: Capture the source and keep the extracted promise, objection, CTA, media, and notes beside it.
          - article [ref=e119]:
            - img [ref=e120]
            - heading "Automations with visible inputs." [level=3] [ref=e122]
            - paragraph [ref=e123]: Choose collections, characters, templates, and schedules. Every run saves its artifacts and status.
          - article [ref=e124]:
            - img [ref=e125]
            - heading "Reusable creator assets" [level=3] [ref=e130]
            - paragraph [ref=e131]: Keep characters, references, captions, prompt attachments, and generated media tied to a source of truth.
          - article [ref=e132]
      - generic [ref=e134]:
        - heading "Built for teams that need fewer blank starts." [level=2] [ref=e135]
        - generic [ref=e136]:
          - article [ref=e137]:
            - heading "Content teams" [level=3] [ref=e138]
            - paragraph [ref=e139]: Keep research, production inputs, approvals, and output history in one operating view.
            - link "See the workflow" [ref=e140] [cursor=pointer]:
              - /url: /solutions
              - text: See the workflow
              - img [ref=e141]
          - article [ref=e144]:
            - heading "Performance marketers" [level=3] [ref=e145]
            - paragraph [ref=e146]: Turn proven angles into controlled variants without losing the source evidence.
            - link "See the workflow" [ref=e147] [cursor=pointer]:
              - /url: /solutions
              - text: See the workflow
              - img [ref=e148]
          - article [ref=e151]:
            - heading "Creator-led brands" [level=3] [ref=e152]
            - paragraph [ref=e153]: Reuse characters, collections, captions, and formats across recurring content runs.
            - link "See the workflow" [ref=e154] [cursor=pointer]:
              - /url: /solutions
              - text: See the workflow
              - img [ref=e155]
      - generic [ref=e158]:
        - generic [ref=e159]:
          - img [ref=e160]
          - heading "Your creative library belongs to your account." [level=2] [ref=e164]
          - paragraph [ref=e165]: Appwrite authentication protects the workspace. Automations, swipes, assets, generations, jobs, and results are scoped to the signed-in user.
        - generic [ref=e166]:
          - generic [ref=e167]:
            - img [ref=e168]
            - paragraph [ref=e170]: User-scoped records
            - paragraph [ref=e171]: Every private row carries an owner ID and user-specific row key.
          - generic [ref=e172]:
            - img [ref=e173]
            - paragraph [ref=e175]: Protected workspace
            - paragraph [ref=e176]: The app and private APIs verify an active server-side session.
          - generic [ref=e177]:
            - img [ref=e178]
            - paragraph [ref=e180]: Review before release
            - paragraph [ref=e181]: Generated content stays private until the workflow says otherwise.
          - generic [ref=e182]:
            - img [ref=e183]
            - paragraph [ref=e185]: Durable history
            - paragraph [ref=e186]: Saved runs and artifacts make useful attempts inspectable later.
      - generic [ref=e188]:
        - heading "Start with the workflow you already repeat." [level=2] [ref=e189]
        - paragraph [ref=e190]: LumenClip is in private beta. Individual workspaces are free while plan limits and team features are finalized.
        - generic [ref=e191]:
          - generic [ref=e192]:
            - paragraph [ref=e193]: Private workspace
            - paragraph [ref=e194]: $0
            - paragraph [ref=e195]: During private beta
            - list [ref=e196]:
              - listitem [ref=e197]:
                - img [ref=e198]
                - text: Private source library
              - listitem [ref=e200]:
                - img [ref=e201]
                - text: Automations and saved runs
              - listitem [ref=e203]:
                - img [ref=e204]
                - text: Creator assets and collections
              - listitem [ref=e206]:
                - img [ref=e207]
                - text: Manual review gates
            - link "Create account" [ref=e209] [cursor=pointer]:
              - /url: /login?mode=register
          - generic [ref=e210]:
            - paragraph [ref=e211]: Team workspace
            - paragraph [ref=e212]: Designed around your approval flow.
            - paragraph [ref=e213]: Shared libraries, roles, team review, higher run volume, and assisted migration are being shaped with early teams.
            - link "Compare plans" [ref=e214] [cursor=pointer]:
              - /url: /pricing
      - generic [ref=e215]:
        - heading "Questions before you start?" [level=2] [ref=e216]
        - generic [ref=e217]:
          - article [ref=e218]:
            - heading "Is LumenClip a video editor?" [level=3] [ref=e219]
            - paragraph [ref=e220]: No. It is the operating layer around creative research, reusable assets, generation workflows, review, and publishing.
          - article [ref=e221]:
            - heading "Can I keep using my current tools?" [level=3] [ref=e222]
            - paragraph [ref=e223]: Yes. LumenClip is designed to organize the inputs and outputs around your existing creative process.
          - article [ref=e224]:
            - heading "Does content publish automatically?" [level=3] [ref=e225]
            - paragraph [ref=e226]: Only when you choose that workflow. Review gates keep generated outputs private until they are approved.
          - article [ref=e227]:
            - heading "Is each workspace private?" [level=3] [ref=e228]
            - paragraph [ref=e229]: Yes. Automations, swipes, assets, runs, and generations are scoped to the signed-in Appwrite user.
          - article [ref=e230]:
            - heading "What should I add first?" [level=3] [ref=e231]
            - paragraph [ref=e232]: Start with one saved source, one reusable collection, and one workflow you already repeat manually.
      - generic [ref=e236]:
        - heading "Build the first content system your team can actually reuse." [level=2] [ref=e237]
        - paragraph [ref=e238]: Start with one saved source. Keep its context, assets, workflow, and outputs connected from the first run.
        - link "Create account" [ref=e239] [cursor=pointer]:
          - /url: /login?mode=register
    - generic [ref=e240]:
      - generic [ref=e241]:
        - generic [ref=e242]:
          - generic [ref=e243]: LumenClip
          - paragraph [ref=e244]: The private creator operations workspace for turning source material into content that ships.
        - generic [ref=e245]:
          - link "Product" [ref=e246] [cursor=pointer]:
            - /url: /product
          - link "Solutions" [ref=e247] [cursor=pointer]:
            - /url: /solutions
          - link "Pricing" [ref=e248] [cursor=pointer]:
            - /url: /pricing
          - link "Careers" [ref=e249] [cursor=pointer]:
            - /url: /careers
          - link "Log in" [ref=e250] [cursor=pointer]:
            - /url: /login
          - link "Privacy" [ref=e251] [cursor=pointer]:
            - /url: /privacy
          - link "Terms" [ref=e252] [cursor=pointer]:
            - /url: /terms
      - generic [ref=e253]: © 2026 LumenClip
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e259] [cursor=pointer]:
    - img [ref=e260]
  - alert [ref=e263]
```

# Test source

```ts
  255 | 
  256 |   // --- PostFast (schedule/calendar) --------------------------------------
  257 |   await page.route("**/api/postfast/**", async (route) => {
  258 |     const url = route.request().url()
  259 |     if (url.includes("/posts")) return json(route, { configured: false, posts: { posts: [] } })
  260 |     if (url.includes("/integrations")) return json(route, { integrations: [] })
  261 |     return json(route, {})
  262 |   })
  263 | 
  264 |   // --- Knowledge bases ----------------------------------------------------
  265 |   await page.route("**/api/knowledge-bases", async (route) => {
  266 |     if (route.request().method() === "GET") {
  267 |       return json(route, { knowledgeBases: state.knowledgeBases })
  268 |     }
  269 |     if (route.request().method() === "POST") {
  270 |       const payload = route.request().postDataJSON() as any
  271 |       const kb = { id: `kb-${id()}`, name: payload?.name ?? "Knowledge base", status: "idle", sources: [] }
  272 |       state.knowledgeBases = [kb, ...state.knowledgeBases]
  273 |       return json(route, { knowledgeBase: kb }, 201)
  274 |     }
  275 |     return route.continue()
  276 |   })
  277 |   await page.route("**/api/knowledge-bases/upload", async (route) => {
  278 |     // A source file is attached to the most recent KB.
  279 |     const kb = state.knowledgeBases[0] ?? { id: `kb-${id()}`, name: "Knowledge base", status: "idle", sources: [] }
  280 |     kb.sources = [...(kb.sources ?? []), { id: `src-${id()}`, name: "source.pdf", status: "ready" }]
  281 |     if (!state.knowledgeBases.includes(kb)) state.knowledgeBases = [kb, ...state.knowledgeBases]
  282 |     return json(route, { knowledgeBase: kb }, 201)
  283 |   })
  284 |   await page.route("**/api/knowledge-bases/*", async (route) => {
  285 |     const kbId = route.request().url().split("/").pop()!.split("?")[0]
  286 |     if (route.request().method() === "PATCH") {
  287 |       const kb = state.knowledgeBases.find((k) => k.id === kbId)
  288 |       if (kb) kb.status = "ready" // refresh queued -> (mock) resolves to ready
  289 |       return kb ? json(route, { knowledgeBase: kb }) : json(route, { error: "Knowledge base not found" }, 404)
  290 |     }
  291 |     if (route.request().method() === "DELETE") {
  292 |       state.knowledgeBases = state.knowledgeBases.filter((k) => k.id !== kbId)
  293 |       return json(route, { knowledgeBase: { id: kbId } })
  294 |     }
  295 |     return route.continue()
  296 |   })
  297 | 
  298 |   // --- Variable (word) collections ---------------------------------------
  299 |   await page.route("**/api/word-collections", async (route) => {
  300 |     if (route.request().method() === "GET") {
  301 |       return json(route, { collections: state.wordCollections })
  302 |     }
  303 |     if (route.request().method() === "POST") {
  304 |       const payload = route.request().postDataJSON() as any
  305 |       if (!payload?.name || !String(payload.name).trim()) {
  306 |         return json(route, { error: "name: name is required" }, 400)
  307 |       }
  308 |       const collection = { id: `word-${id()}`, name: payload.name, description: payload.description, words: payload.words ?? [], source: "manual", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  309 |       state.wordCollections = [collection, ...state.wordCollections]
  310 |       return json(route, { collection }, 201)
  311 |     }
  312 |     return route.continue()
  313 |   })
  314 |   await page.route("**/api/word-collections/*", async (route) => {
  315 |     if (route.request().method() === "DELETE") {
  316 |       const wid = route.request().url().split("/").pop()!.split("?")[0]
  317 |       state.wordCollections = state.wordCollections.filter((w) => w.id !== wid)
  318 |       return json(route, { collection: { id: wid } })
  319 |     }
  320 |     return route.continue()
  321 |   })
  322 | 
  323 |   // --- Assets -------------------------------------------------------------
  324 |   await page.route("**/api/assets", async (route) => {
  325 |     if (route.request().method() === "GET") return json(route, { assets: state.assets })
  326 |     return route.continue()
  327 |   })
  328 |   await page.route("**/api/assets/upload", async (route) => {
  329 |     const asset = { id: `asset-${id()}`, kind: "image", source: "upload", status: "ready", scope: "ugc_avatar", category: "outfit", name: "Uploaded asset", caption: "", fileUrl: "/api/local-assets/assets/files/mock.png", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  330 |     state.assets = [asset, ...state.assets]
  331 |     return json(route, { asset }, 201)
  332 |   })
  333 |   await page.route("**/api/assets/reference-import", async (route) => {
  334 |     const asset = { id: `asset-${id()}`, kind: "image", source: "upload", status: "ready", scope: "ugc_avatar", category: "reference", name: "Reference image", caption: "", fileUrl: "/api/local-assets/assets/files/ref.png", metadata: { analysisStatus: "ready", sourceUpload: true, analysis: { pose: { body_orientation: "angled" } } }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  335 |     state.assets = [asset, ...state.assets]
  336 |     return json(route, { asset }, 201)
  337 |   })
  338 | 
  339 |   // --- Image collection edit/upscale + delete ----------------------------
  340 |   await page.route("**/api/image-collections/image-actions", async (route) => {
  341 |     return json(route, { imageUrl: "/api/local-assets/image-collections/files/edited.jpg", taskId: `img-${id()}` })
  342 |   })
  343 | 
  344 |   // Media requests -> tiny transparent asset so <img>/<video> don't 404 loudly.
  345 |   await page.route("**/api/local-assets/**", (route) =>
  346 |     route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>" })
  347 |   )
  348 | }
  349 | 
  350 | /** Click a left-nav item by its visible label. */
  351 | export async function gotoView(page: Page, label: string) {
  352 |   await page
  353 |     .locator("aside")
  354 |     .getByRole("button", { name: label, exact: true })
> 355 |     .evaluate((button: HTMLButtonElement) => button.click())
      |      ^ Error: locator.evaluate: Test timeout of 60000ms exceeded.
  356 | }
  357 | 
  358 | /** Call an app API from the page so Playwright's mocked route handlers apply. */
  359 | export async function appApi(
  360 |   page: Page,
  361 |   path: string,
  362 |   options: { method?: string; data?: unknown } = {}
  363 | ) {
  364 |   return page.evaluate(
  365 |     async ({ path, method, data }) => {
  366 |       const response = await fetch(path, {
  367 |         method: method ?? "GET",
  368 |         headers: data === undefined ? undefined : { "Content-Type": "application/json" },
  369 |         body: data === undefined ? undefined : JSON.stringify(data),
  370 |       })
  371 |       const text = await response.text()
  372 |       let body: unknown
  373 |       try {
  374 |         body = text ? JSON.parse(text) : undefined
  375 |       } catch {
  376 |         body = text
  377 |       }
  378 |       return { status: response.status, body }
  379 |     },
  380 |     { path, method: options.method, data: options.data }
  381 |   )
  382 | }
  383 | 
  384 | export const test = base.extend<{ state: MockState }>({
  385 |   state: async ({ page }, provide) => {
  386 |     const state = emptyState()
  387 |     await mockApi(page, state)
  388 |     await provide(state)
  389 |   },
  390 | })
  391 | 
  392 | export { expect }
  393 | 
```