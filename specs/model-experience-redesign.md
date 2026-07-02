# Design Spec: Model Experience Redesign

**Goal:** A non-technical first-time user gets from install to their first successful dictation
without ever making a model decision — while power users keep full control one click deeper.

Status: IMPLEMENTED · 2026-06-09 · branch `optimize-transcribe`

> Implementation notes (delta from the proposal below):
> - Cleanup LLM curated list uses `google/gemini-2.5-flash` (2.0 superseded on models.dev).
> - The LLM registry is additionally restricted to providers the app can run
>   (openai/anthropic/google/groq/mistral) — previously every models.dev provider leaked in.
> - Onboarding's advanced escape hatch reuses the existing onboarding selector overlay rather
>   than the Models-page picker (smaller diff, same UX); the language step is single-select
>   because the backend stores one language hint.
> - `/api/models/available` no longer fails entirely when models.dev is unreachable —
>   curated + local models always return.
> - Removed models stay resolvable at runtime via `LEGACY_WHISPER_MODELS` /
>   `LEGACY_MLX_ASR_MODELS` and appear in pickers only while downloaded (the "legacy tag"
>   shipped as this list-only behavior instead of a visual tag).
> - Open question #2 (offering AI cleanup at onboarding end) was not implemented.

---

## 1. The problem

Freestyle currently exposes:

| Surface | Choices today |
|---|---|
| Local Whisper models | **9** (tiny → large-v3-turbo, with quantized *and* unquantized variants of each size) |
| Local MLX models (Apple Silicon) | **4** (Qwen3 0.6B in two quantizations, Qwen3 1.7B, Parakeet) |
| Cloud voice models | **9 hardcoded** + an open-ended list from the models.dev registry (~18–20 total) |
| Post-processing LLMs | **50–100+** (every text model from models.dev across 5 providers, plus local LLM) |

A first-time user who clicks "Or choose a different model" during onboarding lands in a picker
with ~30 voice options described by jargon they can't evaluate: "Q5", "quantized", RAM
requirements, parameter counts, per-hour API pricing. The difference between `base` and
`base-q5_1` (85 MB and a quality delta nobody can perceive) is a decision we're asking users
to make that *we* should make.

The onboarding recommendation card (one model + "or choose different") is already the right
instinct — this spec extends that philosophy to the whole app and prunes the catalog behind it.

## 2. What the best apps do (research summary)

- **Wispr Flow** (widely cited as best-in-class onboarding): **no model picker exists**. The only
  capability question is "which languages do you speak?" Practice happens in a simulated
  Gmail/Notion sandbox before real use.
- **Superwhisper**: renames Whisper sizes into tiers — *Fast / Nano / Standard / Pro / Ultra* —
  hiding model IDs entirely. Switching its onboarding default to Parakeet **2×'d their
  trial→paid conversion** (Argmax case study). Still criticized as "power-user oriented,
  overwhelming."
- **Handy** (open source): curates aggressively — *omits Whisper tiny and base entirely*, gives
  each model one plain-language line ("Fast and accurate. Supports 25 European languages."),
  and exactly one model carries `is_recommended: true` (Parakeet V3).
- **VoiceInk** (open source, closest analog): powerful but reviews consistently flag setup
  complexity as its weakness. Its docs steer users: "Parakeet = best first choice."
- **ChatGPT's 2025 model-picker saga**: removing all choice caused a revolt; pure choice
  overwhelmed. The landing point — **auto default + human-meaningful tiers + an escape hatch
  for power users** — is the industry consensus pattern.
- **Apple Silicon local default consensus**: Parakeet (Superwhisper, VoiceInk, Handy all
  recommend it) with whisper-large-v3-turbo as the multilingual/pure-Whisper fallback.

## 3. Design principles

1. **Zero required decisions before first dictation.** The app picks the model; the user picks
   nothing (they can, but never must).
2. **Tiers, not model IDs.** Users choose between *meanings* (private/fast/most accurate), never
   between `base-q5_1` and `small-q5_1`. Raw IDs appear only in an Advanced view.
3. **One Recommended badge, everywhere.** Exactly one option per list is marked recommended.
4. **Progressive disclosure.** Simple picker (≤4 cards) → "All models" (curated ~12) →
   Advanced (registry/custom). Each level is one click deeper and clearly optional.
5. **Curation is removal.** Models that exist "because we can" get deleted, not hidden. Fewer
   things to test, document, and explain.
6. **Time-to-first-dictation is the metric.** Everything that can happen in the background
   (model download, server warm-up) happens while the user does something else (hotkey setup,
   tutorial).

## 4. Proposed catalog (the cuts)

### 4.1 Local Whisper: 9 → 3

Quantized q5 variants are visually indistinguishable in quality from their full-precision
siblings at ⅓ the size — shipping both is pure noise. Tiny is below the quality bar for a
product whose pitch is accuracy (Handy dropped tiny *and* base).

| Keep | Internal ID | User-facing label | One-liner | Size |
|---|---|---|---|---|
| ✅ | `base-q5_1` | **Whisper Fast** | "Light and quick — good for older machines." | 57 MB |
| ✅ | `small-q5_1` | **Whisper Balanced** | "Solid everyday accuracy." | 181 MB |
| ✅ | `large` (large-v3-turbo) | **Whisper Pro** | "Most accurate on-device option." | 1.6 GB |

**Remove:** `tiny`, `tiny-q5_1`, `base`, `small`, `medium`, `medium-q5_0`.
(`medium` is dominated by large-v3-turbo: bigger quality *and* faster.)

### 4.2 Local MLX (Apple Silicon): 4 → 3, Parakeet not default

| Keep | Internal ID | User-facing label | One-liner |
|---|---|---|---|
| ✅ **Recommended** | `qwen3-0.6b-8bit` | **Qwen3 Fast** | "Fast, accurate, runs privately on your Mac." |
| ✅ | `qwen3-1.7b-8bit` | **Qwen3 Pro** | "Highest on-device accuracy." |
| ✅ | `parakeet-tdt-0.6b-v3` | **Parakeet** | "Very fast · 25 languages · no custom-vocabulary support." |

**Remove:** `qwen3-0.6b-5bit` (quantization variant of the same model — noise).

Industry default is Parakeet, but ours stays **Qwen3 0.6B 8-bit**: Parakeet ignores vocabulary
bias (a Freestyle differentiator) and is 4× the download (2.5 GB vs 650 MB) — bad for
time-to-first-dictation. Revisit if Qwen accuracy complaints appear.

### 4.3 Cloud voice: ~18–20 → 4 (one per provider, registry OFF for voice)

| Keep | ID | User-facing label | One-liner |
|---|---|---|---|
| ✅ | `openai/gpt-4o-transcribe` | **OpenAI Transcribe** | "Most accurate overall." |
| ✅ | `groq/whisper-large-v3-turbo` | **Groq Whisper** | "Fastest and cheapest cloud option." |
| ✅ | `deepgram/nova-3` | **Deepgram Nova 3** | "Live streaming — see words as you speak." |
| ✅ | `elevenlabs/scribe_v2_realtime` | **ElevenLabs Scribe** | "Excellent across 99 languages." |

**Remove from the list:** `openai/whisper-1` (legacy), `openai/gpt-4o-mini-transcribe`
(marginal savings, confusing sibling), `deepgram/nova-2` (superseded), `elevenlabs/scribe_v1`
and `scribe_v2` (superseded by realtime variant, which also batches).
**Stop merging the models.dev registry into the voice list.** The dynamic feed is the main
source of clutter and of models we've never tested. (Registry stays for LLMs, behind Advanced —
see 4.4.)

### 4.4 Post-processing LLMs: 50–100+ → 5 curated + Advanced

Cleanup is a background utility — the user cares that it's fast and cheap, not which model runs
it. Curate one fast-tier model per provider the user might already have a key for:

| ID | Label |
|---|---|
| `groq/llama-3.3-70b-versatile` (or current Groq fast tier) | **Groq Llama** — "Fastest cleanup" · Recommended |
| `openai/gpt-4o-mini` | **GPT-4o mini** |
| `anthropic/claude-haiku-4-5` | **Claude Haiku** |
| `google/gemini-2.0-flash` | **Gemini Flash** |
| `mistral/mistral-small-latest` | **Mistral Small** |

Plus **Local LLM (Ollama / LM Studio)** as today. The full models.dev catalog moves behind an
"All models (advanced)" expander inside the LLM picker — searchable, unchanged behavior, but
never the first thing anyone sees. **Smart default:** if the user already has a cloud key, the
cleanup picker pre-highlights that provider's curated model (no second key to acquire).

Net effect: the default picker surfaces **3 voice tiers** (from a total curated catalog of 10)
and **5 cleanup models**. Today it's ~30 and 50–100+.

## 5. Onboarding redesign

### Current: Permissions → **Choose a model** → Tutorial/hotkey
### Proposed: Permissions → **Language** → Tutorial/hotkey *(model chosen & downloaded silently)*

**Step 1 — Permissions** (unchanged; copy already good).

**Step 2 — Language** (replaces the model step):
- Title: *"What languages do you speak?"* — multi-select with English pre-checked from system
  locale; "Auto-detect" available but de-emphasized (explicit language is faster and more
  accurate — this is also what Wispr asks, and the only choice that genuinely changes outcomes
  for a normal user).
- **The moment this screen appears, the platform default model starts downloading in the
  background:** Qwen3 Fast (650 MB) on Apple Silicon, Whisper Balanced (181 MB) elsewhere.
  No card, no decision. A quiet one-line progress indicator at the bottom:
  *"Setting up your transcription engine… 42%"*.
- Footnote escape hatch (small, muted): *"Want a specific model? Choose advanced setup."* →
  opens the same picker as the Models page (section 6).

**Step 3 — Hotkey + practice** (existing tutorial, two upgrades):
- Download continues during hotkey setup; by the time a user finishes recording a hotkey,
  the 181–650 MB default is typically done. If not, the practice box shows
  *"Almost ready — finishing download (1.2 of 1.6 GB)"* with the mic disabled until ready.
- Whisper server / MLX worker pre-warms as soon as the download lands, so the first practice
  dictation is fast — first impressions are the latency users remember.

**What gets deleted:** the entire "Choose a model." onboarding step, its recommendation card,
and its embedded selector overlay (~500 lines of `onboarding.tsx`). The advanced-setup link
reuses the Models-page picker instead of maintaining a second implementation.

## 6. Models page redesign

### 6.1 Rename the concepts
- "Voice model · required" → **"Transcription"**
- "Post-processing model · optional" → **"AI cleanup"** (toggle, off by default, unchanged)

The pair-card layout stays — it's good. Only the picker behind "Change" changes.

### 6.2 The picker: three tier cards, then disclosure

```
┌──────────────────────────────────────────────────────────────┐
│  How should Freestyle transcribe?                            │
│                                                              │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐   │
│  │ ● Private       │ │ Most accurate  │ │ Fastest        │   │
│  │   RECOMMENDED   │ │                │ │                │   │
│  │ Runs on your    │ │ OpenAI cloud — │ │ Groq cloud —   │   │
│  │ Mac. Nothing    │ │ needs an API   │ │ needs an API   │   │
│  │ leaves your     │ │ key (~$0.18/hr)│ │ key (~$0.04/hr)│   │
│  │ device. Free.   │ │                │ │                │   │
│  └────────────────┘ └────────────────┘ └────────────────┘   │
│                                                              │
│  All models →                                                │
└──────────────────────────────────────────────────────────────┘
```

- **Private** maps to the platform default (Qwen3 Fast / Whisper Balanced) — selecting it never
  asks anything; it downloads if needed.
- **Most accurate** → `openai/gpt-4o-transcribe`; **Fastest** → `groq/whisper-large-v3-turbo`.
  Selecting either runs the key flow (6.3) if no key exists.
- **"All models →"** opens the curated list (10 voice models from section 4) with the existing
  Cloud/On-device toggle, plain-language one-liners, size, and a single Recommended badge.
  No RAM columns, no "quantized" labels, no speed/quality meter widgets — one sentence each.

### 6.3 API key flow (mostly keep, three additions)
The current flow is already close to best practice (validate-then-save, keychain storage,
"never logged, never sent to us"). Add:
1. **"Get a key" link** on the entry modal, deep-linking to the provider's key page
   (platform.openai.com/api-keys, console.groq.com/keys, …) with a one-line instruction.
   This is the #1 BYOK drop-off point for non-technical users.
2. **Masked preview** in the keys list (`sk-…a4F2`) so users can tell keys apart.
3. **Friendly validation errors**: map provider error codes to actions — "This key was revoked —
   create a new one" instead of raw HTTP 401 text.

### 6.4 Keys section (keep as-is otherwise)
The keychain row UI, valid/invalid status, and delete-with-dependency-warning are good.

## 7. Migration & compatibility

- **Existing users keep working.** `model_configs` rows referencing removed models stay valid —
  the provider code paths (whisper.cpp, MLX, cloud) don't change. Curation removes models from
  *pickers and download lists*, not from runtime support. A previously downloaded `medium-q5_0`
  keeps transcribing.
- A removed-from-catalog model that is currently the user's default renders in the pair card
  with its stored display name and a subtle "legacy" tag; the picker simply no longer offers it
  to new users.
- Downloaded model files for removed catalog entries are *not* deleted.
- The `WHISPER_MODELS` / `MLX_ASR_MODELS` arrays shrink to the curated sets; status endpoints
  and download routes are unchanged in shape.

## 8. Out of scope (deliberately)

- Bundling a model in the installer (fastest possible first-run, but +200 MB installer; revisit).
- An "instant start" pattern — download Whisper Fast (57 MB) first, hot-swap to the real default
  when it lands. Good v2 idea; adds state-machine complexity now.
- Accounts, hosted inference, or any non-BYOK cloud path.
- Auto-routing between local and cloud per recording (ChatGPT's lesson: get the default and
  tiers right first).

## 9. Open questions

1. **Language step default**: pre-check from OS locale only, or ask? (Spec says pre-check +
   allow multi-select; zero-interaction path stays possible.)
2. Should **AI cleanup** be offered at the end of onboarding for users who entered a cloud key
   ("Want Freestyle to also fix punctuation and filler words?") — one-tap enable since the key
   already exists?
3. Keep Deepgram/ElevenLabs in the simple tier cards at all, or only in "All models"? (Spec
   says All-models only; the three cards stay three.)

## 10. Implementation map

| Change | Where |
|---|---|
| Shrink local catalogs | `apps/server/src/lib/whisper/constants.ts` (`WHISPER_MODELS`), `apps/server/src/lib/mlx-asr/constants.ts` (`MLX_ASR_MODELS`) |
| Curate cloud voice list, drop registry merge for voice | `apps/server/src/routes/models.ts` (builtin list + registry filter) |
| Curated LLM shortlist + Advanced expander | `apps/server/src/routes/models.ts`, `apps/electron/.../pages/models/model-list.tsx` |
| Onboarding: replace model step with language step + background download | `apps/electron/src/renderer/src/onboarding.tsx` |
| Tier-card picker | `apps/electron/.../pages/models/model-modal.tsx`, `model-list.tsx` |
| Plain-language labels/one-liners | `apps/electron/.../lib/models.ts` (display metadata) |
| Key flow additions (get-a-key links, masked preview, friendly errors) | key entry modal + `apps/server/src/routes/api-keys.ts` / `lib/validate-key.ts` |
| Legacy-model tag in pair card | `apps/electron/.../pages/models/pair-card.tsx` |
| Pre-warm after onboarding download | existing `autoStartWhisperServer()` / MLX warm path |

**Suggested sequencing:** (1) catalog cuts server-side — invisible-risk, instant clutter
reduction; (2) picker tier cards + plain labels; (3) onboarding language step + background
download; (4) key-flow polish.
