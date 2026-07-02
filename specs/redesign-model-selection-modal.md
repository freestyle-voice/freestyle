# Redesign: Model selection modal (mini spec)

Status: **Proposed** · Scope: renderer-only · Files:
`apps/electron/src/renderer/src/pages/models/model-modal.tsx`
(+ a new `model-list.tsx`; can retire `components/voice-row.tsx` &
`components/model-row.tsx` usage here)

---

## 1. Goal

Make the voice/LLM picker **one simple, scannable list with filters**. Two filter
dimensions the user asked for:

- **Source** — Cloud vs On-device.
- **Provider** — OpenAI, Anthropic, Groq, …

Keep it minimalist: one row component, one filter bar, one mental model for both voice
and LLM.

## 2. Problems with the current modal

- **Two different row components** — `VoiceRow` (speed/quality dual-meters, cost,
  streaming, size, tooltips) and `LlmModelRow` (+ `ProviderModelHeader`). Voice rows are
  visually dense.
- **No filters** — only free-text search. Provider/source filtering was dropped in the
  last redesign.
- **LLM list is provider-grouped with sticky headers**; voice list is a flat
  on-device-then-cloud dump. Two layouts for the same task.

## 3. Proposed design

One header (title + search + close), one **filter bar**, one flat list of uniform rows.

```
┌─ Choose a voice model ──────────────────── [ 🔍 search ] [×] ┐
│  [ All ]  [ Cloud ]  [ On-device ]   ·   [OAI] [GQ] [DG] [11]│  ← filter chips
├──────────────────────────────────────────────────────────────┤
│  Whisper Large            On-device              ✓ Selected   │
│  GPT-4o Transcribe        OpenAI · $0.18/hr         [ Use ]   │
│  whisper-v3-turbo         Groq · $0.04/hr        [ Add key ]  │
│  Whisper Base             On-device · 150 MB     [ Download ] │
└──────────────────────────────────────────────────────────────┘
```

### Filter bar
- **Single-select chips**, left→right: `All`, `Cloud`, `On-device`, then a chip per
  provider that actually has models of this type (deduped from `available`). Provider
  chips reuse the existing `PROVIDER_FILTER_MARKS` glyphs (OAI / A / G / GQ / M / DG / 11).
- Single active filter at a time, **combined with the search box** (AND). Provider chips
  already imply cloud, so one selection is enough — no nested/multi-select needed.
- The bar is the only place filtering lives — no separate "Fastest / Most accurate / No
  cost" chips (those were sorting, not filtering — cut).

### Row anatomy (one component for cloud + local, voice + LLM)
- **Left**: model name (`text-[14px] font-medium`) + one muted secondary line:
  - cloud → `Provider · $X/hr` (cost omitted when unknown)
  - local → `On-device` (+ ` · 150 MB` when not yet downloaded)
- **Right**: a single state-driven action:
  - selected & ready → `✓ Selected` (no button)
  - cloud, has key → `[ Use ]`
  - cloud, no key → `[ Add key ]` (→ in-modal key step, unchanged)
  - local, ready → `[ Use ]` + small `⋯`/trash to delete
  - local, not downloaded → `[ Download ]` (+ size)
  - local, downloading → inline progress bar + `[ Cancel ]`
  - local, error → `[ Retry ]`
- **Dropped from rows**: the dual speed/quality 5-dot meters, streaming badge, per-stat
  tooltips. (Keep download progress — it's functional, not decorative.)

This collapses `VoiceRow` + `LlmModelRow` + `ProviderModelHeader` into **one `ModelRow`**
fed a normalized item.

### Normalized item shape
```ts
type Row = {
  key: string;
  name: string;
  source: "cloud" | "local";
  provider: string;          // provider_id, for the provider filter
  meta: string;              // "OpenAI · $0.18/hr" | "On-device · 150 MB"
  selected: boolean;
  // action state
  kind: "cloud" | "local";
  hasKey?: boolean;          // cloud
  status?: "ready" | "not_downloaded" | "downloading" | "verifying" | "error";
  engine?: "whisper" | "mlx";
  defId?: string;            // local
  available?: AvailableModel; // cloud (for select/key flow)
  state?: WhisperModelDownloadState; // local progress
};
```
Built by small adapters from the existing `voiceItems` (already normalized) and from
`llmModelsByProvider`. No backend change.

## 4. Filter behavior

```
visible = rows
  .filter(bySource)        // All → pass; Cloud → source==="cloud"; On-device → "local"
  .filter(byProvider)      // provider chip → row.provider === chip
  .filter(bySearch)        // name/provider contains query
```
Filter is single-select, so `bySource` and `byProvider` never both constrain — the active
chip is either a source chip or a provider chip. Empty result → "No models match."

## 5. Local LLM (Ollama / LM Studio)

The `On-device` filter for **LLM** shows the connect form (URL + optional key + Test) at
the top, then discovered models as normal rows. With `All` selected it appears as a small
"On-device" group above cloud rows. Same simplified form as today — just relocated under
the `On-device` filter instead of always-pinned.

## 6. Key step

Unchanged: picking a keyless cloud row flips the modal to the in-modal key step
(`Back` / `Save & use`). Out of scope for this redesign.

## 7. Component structure

```
model-modal.tsx   shell + step routing + key step (kept, trimmed)
model-list.tsx    NEW: <FilterBar/> + <ModelRow/> + buildRows() adapters (~180 lines)
```
Retire the page's use of `components/voice-row.tsx` and `components/model-row.tsx`
(check for other importers first; keep the files if shared elsewhere).

## 8. What's removed
- Speed/quality meters, streaming badge, stat tooltips on rows.
- Provider sticky-group headers + per-provider "Show more" pagination (search + provider
  chip replace it).
- The voice "Fastest / Most accurate / No usage cost" filter chips.

## 9. Open choice
- **Cost line**: keep `$X/hr` on cloud rows (cheap signal, already in `VOICE_META`) or
  drop for max minimalism? Recommendation: **keep** — it's the one decision-useful number.
