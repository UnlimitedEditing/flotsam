# 05: Virtual companion (persona + animated avatar)

## Vision (Jacob)

Anyone can make their own virtual companion: media rendered on Graydient becomes a rigged puppet (brief 03) that performs, with expressions and gestures, while the user talks to a **normal Graydient chat persona**. The user writes the persona's character as a system prompt; the app teaches the persona a hidden vocabulary of animation cues. The persona emits special strings that trigger avatar animations; the app strips them so the user sees only conversation.

## What exists

- **Graydient persona chat API** (documented in `D:\ForgeExpress\cli\docs\graydient-api-support-notes.md`): `POST /api/v3/chat` with `persona`, `prompt`, `session_id`, optional `image_url` and `callback_url`; personas are user-creatable in My.Graydient and can be given a personality prompt; usable via API/WebUI/Telegram; the CLI has `graydient chat <persona> "<prompt>"`. Support has said the persona endpoint is usable without the one-render-at-a-time limit ("polly endpoint unlimited") but raw LLM access is not offered. **Unverified: how a browser app receives the reply** (the sample response is `sync:false` with a callback; the CLI must poll or stream, check `D:\ForgeExpress\cli`).
- **Rig Studio expression tracks** (`D:\rig-studio\docs\expression-track.md`): additive layers idle, reflex, intent, perform; "listener role" (backchannel reactions to the other speaker) was identified as the key aliveness win. Audio drives visemes, expression bends the corners.
- **Voice:** Higgs TTS workflows (`audio-higgs`, `clone-higgs`) for the companion's voice; device speech-to-text for the user's speech.
- Brief 03's puppet player and message API (`setExpression`, `trigger`, `play`).

## Discovery pass (first session, before any building)

1. **Chat transport:** exactly how to send and receive a persona message from the web app and from Android (sync vs callback vs polling; streaming?). Test with a throwaway persona and a fake key-free mock where possible.
2. **Can the app shape the persona?** Can personas be created or edited via API, or only in the web UI? Can we prepend a per-request instruction? If not, the app guides the user to paste a **generated protocol preamble** into their persona's prompt once (the app writes the exact text; the user chooses what character to add).
3. **Cue reliability:** does the persona obey a cue vocabulary consistently? Graydient's notes say personality prompts are picked up weakly in some modes. Measure cue-emission rate over ~100 turns on a couple of persona models before designing around it.
4. **Mangling:** Graydient's chat/prompt parsers mangle `{}()[]|/` and bare `<` `>` (see `GRAYDIENT-COMPLETE-REFERENCE.md`). Pick a cue syntax that survives, e.g. `~wave~` or `@@smile@@`, and verify round trip.
5. **Latency budget:** user speech to text to persona to reply to TTS (Graydient render, queued) to playback. Decide what is acceptable and what needs device TTS as a fast path.
6. **Policy:** Graydient limits personal API keys to personal use; check that a "companion app" for other people is not a reseller pattern, and that nothing is hosted by us.

## Proposed architecture

- **Cue protocol:** a small vocabulary (maybe 20-30): emotions (`smile`, `laugh`, `sad`, `surprised`, `think`, `blush`), gestures (`wave`, `nod`, `shake`, `shrug`, `lean_in`), and states (`listening`, `speaking`). The app owns the vocabulary and generates the persona preamble from it ("When your tone or mood changes, put one cue like @@smile@@ in the text before the sentence it applies to. Never mention cues.").
- **Stream filter:** a parser that sits between the reply stream and the UI. It buffers partial cues across chunks, removes complete cues and any malformed cue-like fragments from the visible text, and emits timed animation events keyed to the character offset where they appeared. Unknown cues are dropped silently, never shown. Unit-tested heavily (split across chunks, nested, escaped, user-typed look-alikes).
- **Fallback layer:** if the persona omits cues, a client-side idle + sentiment/punctuation heuristic keeps the avatar alive (idle breathing, blinks, nods on question marks), so the companion still feels present.
- **Listener mode:** while the user speaks (device STT or push-to-talk), the avatar plays backchannel reactions from the idle/reflex layers.
- **Avatar:** puppet from the library (brief 03), driven through its message API. **Companion** = {persona id, system-prompt text the user wrote, puppet, voice, cue map}, saved in the project store.
- **Storage and privacy:** conversation history stays on the device in an explicit store with Delete and Export, included in Clear all data; no logs sent anywhere but Graydient (the API). Make clear in the UI that the persona text goes to Graydient.
- **Safety:** an 18+ companion app needs thought: age gate already exists, but also content policy, no impersonation of real people from uploaded photos (add a consent/notice and a block on "make a puppet of a real person" claims in the UI copy; consider legal review), and a visible "this is an AI" label with an easy way to end or wipe a companion. Dependency/wellbeing wording reviewed before launch.

## Phasing (separate sessions)

- **5.0 Discovery** (above) ending in a decision memo.
- **5.1 Text companion:** persona chat screen with the cue filter and a placeholder avatar (static expressions); preamble generator; companion setup wizard.
- **5.2 Real avatar:** plug in the rigged puppet and expression layers; listener mode.
- **5.3 Voice:** STT in, TTS out (Higgs workflow or device TTS), lip-sync from audio via the Rig Studio viseme path.
- **5.4 Polish:** multiple companions, backgrounds from renders, export/import a companion as an M3DS bundle.

## Definition of done

A user can create a companion (persona prompt + generated character), chat with it by text and voice, and see the avatar react with cue-driven expressions while no cue text ever appears in the conversation, on web and Android.

## Risks

Persona obedience to the cue protocol (the central unknown: that is why discovery comes first). Reply transport and latency on a queued render account. Policy and safety questions around companions. Avatar quality depends on brief 03. Cost/quota: every TTS line is a render.
