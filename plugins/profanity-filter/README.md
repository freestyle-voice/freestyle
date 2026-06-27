# Profanity Filter

Keeps your dictation family-friendly — and funnier. Curse words are swapped for
wholesome, lighthearted stand-ins on the fly.

> "what the hell is this damn thing" → "what the heck is this dang thing"
> "are you shitting me" → "are you shooting me"
> "son of a bitch" → "son of a biscuit"

## How it works

A deterministic text rewrite on the server `afterCleanup` hook
(`post-process.ts:261`) — the final text-rewrite stage, same place as dictionary
replacement. No LLM, no added latency. Matching is case-insensitive, on word
boundaries (so "class" and "hello" are never touched), and phrases beat their
component words ("son of a bitch" → "son of a biscuit", not "son of a meanie").
Casing is mirrored, so "SHIT" → "SUGAR" and "Damn" → "Dang". Where a word has
several alternatives, repeats cycle through them for variety.

Identity-based slurs are intentionally **not** included — this is a playful
filter, not a euphemism generator for those.

## UI page

The plugin contributes a **Profanity Filter** page (React + Vite) that explains
how the filter works, lets you preview any sentence live, and lists every word
being swapped. It reads the live, effective list (defaults + your overrides) from
a small read-only endpoint
(`GET /api/plugins/freestyle-voice-profanity-filter/replacements`) through the
`window.freestyle` host bridge.

## Configuration

Tweak it via the `[name, options]` tuple form in the `plugins` setting:

```jsonc
[
  ["@freestyle-voice/profanity-filter", {
    "replacements": { "fuck": ["fishsticks", "fiddlesticks"], "crap": "kerfuffle" },
    "disableDefaults": false,
    "preserveCase": true
  }]
]
```

- `replacements` — add or override substitutions (merged over the defaults; a
  string or an array of alternatives).
- `disableDefaults` — use only your own `replacements`.
- `preserveCase` — mirror the matched word's casing onto the replacement
  (default `true`).

## Build

```
pnpm install
pnpm --filter @freestyle-voice/profanity-filter build
```
