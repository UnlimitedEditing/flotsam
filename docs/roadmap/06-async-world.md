# 06: Async world (an "almost live" MMO where an AI plays your character)

## Vision (Jacob)

Players design a character who then explores a shared persistent world on their behalf. To the player an "AI" is playing; in practice it is scripts, a few persona pings and some renders. The player is notified when something worth seeing happens, makes decisions when asked, and can ask for any moment to be rendered. Players meet each other's characters, so it is a real shared world, but it is asynchronous ("kinda live"), which makes it far cheaper to run than a real-time MMO.

## Decisions already made (2026-10-21, with Jacob)

1. **A real server with a persistent shared database.** Not seeded, not local-only: characters, locations, events and encounters live in the DB and players genuinely affect each other.
2. **Players render with their own Graydient key, on their own device.** The server **never holds a Graydient key** and never calls Graydient. It pushes _render requests as data_ (workflow, prompt, reference needs); the Flotsam app queues them in its normal job engine, renders, and reports back the resulting image URL. Reasons: avoids key custody and breach liability, avoids the "hosted service driving personal keys / reseller" terms question, keeps render cost on the player's own plan, and fits the one-render-at-a-time limit naturally (it is the player's own queue).
3. **References are image URLs.** Graydient has no upload endpoint and fetches reference images by URL (`/imageN:URL`), so the server asks each player to render a small set of **reference renders** (portrait, full body, turnaround, signature items, monsters they own) and stores only the **URLs of those renders** (Graydient-hosted). To combine characters or place a monster in a scene, the requesting player's workflow call is given the other participants' reference URLs. We host no images.
4. **Notifications carry no content**, as in the app today ("Something happened"); details are fetched after opening.

## What exists / to reuse

- Flotsam job engine, image handling (`src/jobs/`, `src/images/`), blur and gate rules, the CORS Worker pattern (`worker/`), the Telegram-style notification text rules (`src/pwa/notify.ts`, `NotificationText.kt`).
- Brief 03 (rigged character/puppet as the character visual), brief 04 (data-driven game schema, templates), brief 05 (persona chat, cue protocol for in-character dialogue).
- Graydient facts (`D:\ForgeExpress\cli\docs\graydient-api-support-notes.md`): persona chat endpoint exists; render API is one render at a time; image inputs are URLs; Graydient already runs its own Telegram bot (a possible partner or at least a precedent).

## Architecture sketch

- **Server (Cloudflare Workers + D1, Durable Objects for live encounters, Queues/Cron for ticks).** Authoritative for all world state; clients can only submit _intents_ (decisions, render-reference reports). Event-sourced log per character; **lazy evaluation** (advance a character from its last timestamp when anything needs its state) so quiet characters cost nothing. Interactions between players resolve in rounds on both sides' next ticks, or instantly inside a Durable Object room when both are online ("kinda live").
- **Identity:** a pseudonymous game account (passkey or Telegram login), **not** the Graydient key. The key stays on the device.
- **Autonomy engine:** behaviour scripts (utility AI / behaviour trees) driven by a player-authored personality and policies ("avoid fights", "collect rare items", "ask me before spending"). Persona flavour text is optional; because personas need the player's own key, they run **client-side** on request, or the server uses a cheap small model/templates for narration (decide in discovery; do not give the server Graydient access).
- **Render-request protocol** (server to client, all data): `{ id, kind: 'reference'|'scene', workflow, promptTemplate, fields, refs:[urls], consentScope, expiresAt }`. The client builds the final prompt, shows what it will cost in time, renders when the player allows (manual / ask / auto with daily cap), then returns `{ id, resultUrl, hash }`.
- **Reference registry:** server stores `{ owner, role, url, visibility: private|party|public, createdAt }` after validating the URL against an **allowlist of Graydient's result-storage hosts**; refuses anything else (no arbitrary URLs: abuse, tracking, illegal content hosting). It never fetches or proxies the image itself.
- **Notifications:** Telegram bot (webhook in a Worker), web push for the PWA, Android push (FCM or UnifiedPush; the push-backend decision from the original plan's human tasks). Optionally run the app inside Telegram as a Mini App (verify before relying on it).

## Hard problems (resolve before building the social layer)

1. **Likeness and consent.** A scene that includes another player's character uses their references. Rules: references are `private` by default; sharing is explicit per scope (party, friends, public); every combined render is for the **requesting player's own view**; revoking sharing stops future use but cannot recall renders already made (say so in the UI and terms). No "make a character from a real person's photo" flows.
2. **Content and moderation.** Users will see images made from other players' references. Adult content: blur by default, per-world content rating, separate adult/non-adult worlds or hard flags, age gate, report and block, a way to hide a player entirely, and a moderation queue that works on URLs and metadata without us hosting images. Telegram's own rules on adult content in bots must be checked. **Needs legal review** alongside the existing terms (`docs/privacy-and-terms.md`).
3. **URL lifetime.** We do not know how long Graydient-hosted render URLs stay valid. Mitigation: store the **render recipe** (workflow, prompt, seed) beside each reference so the client can re-render a missing one; mark references stale on 404. **Ask Graydient** about retention and about hotlinking at scale.
4. **Prompt injection and parser mangling.** Other players' text (names, bios) ends up inside your prompts: allowlist fields, length limits, strip control syntax, escape `{}()[]|/` and `<>` (Graydient parsers mangle them, see `GRAYDIENT-COMPLETE-REFERENCE.md`), never concatenate raw text into slash-commands.
5. **Render budget UX.** Every request costs the player time and credits. Provide per-player controls (auto/ask/off, daily cap), a text-only digest when they would rather not render, and clear "this will take about N s" estimates. Queue depth is one at a time, so batch and prioritise.
6. **Visual consistency** of a character across many separate renders. Use reference sheets and multi-reference workflows; **test identity drift early** (earlier multi-view experiments drifted).
7. **Cheating and griefing.** Server-authoritative simulation; rate limits on interactions; per-character caps; block lists; no client-submitted outcomes.
8. **Graydient relations.** The app is independent and must never imply endorsement. Consider telling Graydient about the project (and the load pattern of many accounts each rendering occasionally) rather than surprising them.

## Phasing (separate sessions)

- **6.0 Design and simulator (no graphics):** write the world model (locations graph, event grammar, character stats, encounter rules, economy), implement the autonomy engine and lazy-evaluation tick in a CLI simulator, run 1,000 and 100,000 characters to measure DB operations per simulated day and project hosting cost. Output: design doc, cost model, schema.
- **6.1 Accounts + characters + reference renders:** pseudonymous accounts, character creator in the app, the reference-render request flow, the host-allowlist registry, consent scopes.
- **6.2 Event log + notifications + "render this moment":** the event feed, content-free notifications (Telegram first), scene render requests from the player's own device.
- **6.3 Player interaction:** async encounters resolved in rounds, party/friends, combined-likeness renders with consent, monsters and NPCs as server-owned references.
- **6.4 Live rooms:** Durable Object encounters when both players are online; spectate.
- **6.5 Moderation, safety and launch:** reports, blocks, rating, takedown, legal sign-off, abuse monitoring, limits.

## Definition of done (first playable)

Two real players each create a character, render their reference set, leave the app, get notified that their characters met, see (or choose to render) a shared scene that includes both likenesses (with consent), and nothing on our server holds a Graydient key or an image file.

## Questions to settle first

Telegram vs app-only first? Single world or per-rating worlds? Are monsters and NPCs generated per event or drawn from a fixed bestiary with stable references? How much does the player decide vs the AI? Hosting budget ceiling? Who moderates?
