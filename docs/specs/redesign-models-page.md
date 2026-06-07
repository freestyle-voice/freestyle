# Redesign: Models page

Status: **Proposed** (awaiting review) · Scope: renderer-only · Target file:
`apps/electron/src/renderer/src/pages/models/`

---

## 1. Original brief

> Take a look at our Models page (`apps/electron/src/renderer/src/pages/models/index.tsx`).
> Right now the logic is too sophisticated — too many actions for one page. We want to
> radically simplify the logic and the functionality.
>
> Product requirements:
> 1. Must be able to configure the voice model (required).
> 2. Must be able to configure the post-processing model (optional).
> 3. Must be able to configure API keys for the voice / post-processing model if required.
> 4. For voice models, must support downloading local models too.
>
> Goal: completely redesign the models configuration page. Keep it very minimalist and
> simple to follow — minimalist UI, minimal code.

---

## 2. Why the current page is heavy

The page is **~2,530 lines across 12 files** for a surface that is really just "pick a
voice model, optionally pick a cleanup model, manage keys."

| Current piece | Lines | Needed by spec? |
|---|---:|---|
| `index.tsx` — orchestrator (40+ state vars, ~25 handlers) | 942 | core, but bloated |
| `dialogs.tsx` — 4 separate modals | 396 | partially |
| `llm-picker.tsx` — provider filters, search, pagination, Ollama connect-form | 314 | optional model only |
| `providers-section.tsx` — recommended-providers empty state, status, edit/delete | 243 | keys only |
| `pair-card.tsx` — serif hero + toggle | 142 | the two slots |
| `voice-picker.tsx` + 6 filter chips | 109 | no |
| `mlx-memory-section.tsx` — keep-alive minutes | 78 | **no** |
| `model-picker-shell` / `page-chrome` / `utils` / `constants` / `types` | ~280 | scaffolding |

Root causes of the bloat:

- **Two bespoke pickers** (`voice-picker`, `llm-picker`) do the same job — list models,
  select one — with different code.
- **Two key-capture paths**: an inline "pending key" flow *and* a standalone
  `ApiKeyDialog` modal.
- **Keys get a whole management section** (`providers-section`) plus an editorial
  "recommended providers" empty state.
- **Two parallel local engines** (whisper.cpp + Apple MLX), each with its own
  download / cancel / delete / poll wiring, surfaced as separate UI sections, plus an
  **MLX memory keep-alive tuner** that isn't model configuration at all.

## 3. Backend is fine — reuse as-is

This is a **renderer-only** redesign. Every endpoint we need already exists:

- **Models**: `GET /api/models/available`, `GET /api/models/configured`,
  `POST /api/models/configured`, `PUT /api/models/configured/:id/default`,
  `DELETE /api/models/configured/:id`
- **Keys**: `GET /api/keys`, `POST /api/keys`, `POST /api/keys/validate`,
  `DELETE /api/keys/:provider`
- **Local voice**: `GET /api/whisper/status` & `GET /api/mlx-asr/status`;
  `POST .../models/:model/download|cancel`, `DELETE .../models/:model`,
  `POST .../server/start`
- **Settings**: `GET|PUT|DELETE /api/settings/:key` (used for `llm_cleanup`,
  `local_llm_url`, `local_llm_api_key`)

`POST /api/models/configured` already enforces single-default-per-type (it clears the
prior default before insert), so "select a model" stays a one-call operation.

---

## 4. Design principle

> **Two side-by-side slots, one shared selection modal, keys captured at the point of need.**

No per-type bespoke pickers. No separate keys section. No settings that aren't in scope.

## 5. Layout

**Keep the current side-by-side pair layout** — Voice model and Post-processing sit next
to each other (stacking only on narrow widths), exactly as the existing `PairCard` does.

```
┌─ Models ───────────────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────────────────┬─────────────────────────────┐ │
│  │ VOICE MODEL · required       │ POST-PROCESSING · optional   │ │
│  │                              │                    ( ● on )  │ │
│  │  Whisper Large (Local)       │  Claude Haiku 4.5            │ │
│  │  On-device · no key needed   │  via Anthropic · key saved   │ │
│  │                              │                              │ │
│  │            [ Change ]        │            [ Change ]        │ │
│  └─────────────────────────────┴─────────────────────────────┘ │
│                                                                 │
│  ───────────────────────────────────────────────────────────── │
│  API keys                                                       │
│  Anthropic        •••• saved                  [edit] [remove]   │
│  Groq             •••• saved                  [edit] [remove]   │
└─────────────────────────────────────────────────────────────────┘
```

Clicking **Change** on either slot opens **one shared modal** (centered overlay, not an
inline panel) — the same component for both slots, fed a different list:

```
        ┌─ Choose a voice model ──────────────  [search] [×] ┐
        │  ON-DEVICE                                         │
        │   ○ Whisper Base        ~150MB   [ Download ]      │
        │   ● Whisper Large       ready    ✓ selected        │
        │  CLOUD                                             │
        │   ○ Groq · whisper-v3-turbo      (needs key)       │
        │   ○ OpenAI · gpt-4o-transcribe   ✓ key saved       │
        └────────────────────────────────────────────────────┘
```

When the user picks a cloud model whose provider has **no stored key**, the modal does
not close — it swaps to an **in-modal key step** for that provider:

```
        ┌─ Add your Groq API key ─────────────────────  [×] ┐
        │  whisper-v3-turbo needs a Groq key to run.        │
        │  ┌──────────────────────────────────────────────┐ │
        │  │ sk-…                                     [👁] │ │
        │  └──────────────────────────────────────────────┘ │
        │  Stored in keychain · never logged                │
        │                          [ Back ]  [ Save & use ] │
        └────────────────────────────────────────────────────┘
```

On **Save & use**: validate (`POST /keys/validate`) → on valid `POST /keys` →
`POST /models/configured` → close modal and refetch. **Back** returns to the model list.
Errors render inline in this step; nothing is saved until the key validates.

## 6. The four requirements → one interaction model

1. **Configure voice (required).** Voice slot → **modal** lists on-device + cloud voice
   models in one flat list. Pick → `POST /models/configured {type:"voice", is_default:true}`
   (+ `POST /whisper|mlx-asr/server/start` for local). Refetch, slot updates, modal closes.
2. **Configure post-processing (optional).** The slot's **toggle is the enable/disable**,
   persisted to `llm_cleanup`. On → the modal lists cloud LLMs (+ one local-server entry,
   see §8). Off → no post-processing, no model required.
3. **Configure keys (when required).** Selecting a cloud model whose provider has no key
   **switches the same modal to a key step** for that provider (see §5): paste →
   `POST /keys/validate` → on valid `POST /keys` → then `POST /models/configured`, all
   without leaving the modal. One path, no separate dialog component.
4. **Download local voice models.** On-device rows live in the same voice modal.
   Not-downloaded → `[Download]` with inline progress (reuse the existing 500 ms poll
   while `status === downloading|verifying`). Ready → selectable. Delete via a small
   row overflow with a confirm. whisper.cpp and MLX models render as uniform "On-device"
   rows — engine is an implementation detail, not a UI section.

## 7. What gets cut (out of scope)

- **The 6 voice filter chips** (Fast / Most accurate / No usage cost…) — that's sorting,
  not configuration. A single search box covers find-by-name.
- **MLX memory keep-alive section** (`mlx-memory-section.tsx`) — app setting, not model
  config; remove from this page.
- **Recommended-providers editorial empty state** — replace with a plain empty slot
  ("No voice model selected — choose one").
- **Standalone "Providers & keys" section** → collapses to a compact "API keys" list
  (edit / remove only).
- **Provider status badges + revalidate** — show key / no-key only.
- **The standalone `ApiKeyDialog`/`EditKeyDialog` components + the duplicate pending-key
  path** — fold key capture into the shared model modal as an in-modal "key" step (§5),
  so there is a single selection surface and a single key-entry surface.

## 8. What stays (locked decisions)

- **Local post-processing (Ollama / LM Studio): keep, simplified.** A single "Local
  server" entry in the LLM sheet. Selecting it reveals URL + optional key inline; on a
  successful `POST /settings/local-llm/test` (or equivalent), its models appear in the
  same list. Drops the current sticky test-form, pagination, and verbose connection
  status.
- **Both local voice engines: unify in UI.** Backend keeps whisper.cpp **and** MLX; the
  sheet shows one flat "On-device" list and does not expose which engine powers each row.
  The existing `buildVoiceItems` helper already merges both into one `VoiceItem[]`, so the
  UI just renders that list and routes select/download/delete by the item's `localEngine`.

## 9. Proposed file structure

Target **≈ 450–550 lines** (from 2,530).

```
models/
  index.tsx        ~170  page: data load + side-by-side slots + keys list + modal host
  pair-card.tsx     ~90  KEPT/trimmed — the side-by-side Voice + Post-processing layout
  model-modal.tsx  ~190  shared modal: model list + in-modal key step (cloud/local/download)
  use-models.ts    ~120  data hook: load, select, save-key, local download + poll
```

Reuse `pair-card.tsx` (it already implements the required side-by-side layout + toggle);
trim it to call `onChange` → open the modal and drop the inline-picker `active`/`pickerOpen`
coupling.

Delete: `voice-picker.tsx`, `llm-picker.tsx`, `providers-section.tsx`, `dialogs.tsx`,
`model-picker-shell.tsx`, `mlx-memory-section.tsx`, `constants.ts` (fold the few remaining
literals inline), and trim `utils.ts` / `types.ts` to what the new files use. Keep the
shared `@renderer/lib/models.ts` helpers (`buildVoiceItems`, `displayProviderName`, etc.).
The `ModalShell` wrapper from the old `dialogs.tsx` can be lifted into `model-modal.tsx`.

## 10. Component contracts (sketch)

```ts
// pair-card.tsx (kept) — side-by-side Voice (required) + Post-processing (optional)
function PairCard(props: {
  voice?: ConfiguredModel;
  llm?: ConfiguredModel;
  llmCleanup: boolean;
  onToggleCleanup: (on: boolean) => void;
  onChangeVoice: () => void;     // -> opens modal with type:"voice"
  onChangeLlm: () => void;       // -> opens modal with type:"llm"
}): JSX.Element

// model-modal.tsx — ONE modal for both voice and llm, with two internal steps
type ModalStep =
  | { kind: "list" }
  | { kind: "key"; provider: string; pendingRow: SheetRow };  // in-modal key capture

function ModelModal(props: {
  type: "voice" | "llm";
  groups: SheetGroup[];          // [{ heading: "On-device"|"Cloud"|provider, rows }]
  keyProviders: Set<string>;
  search: string;
  setSearch: (v: string) => void;
  onSelect: (row: SheetRow) => void;   // if cloud row needs a key -> switch to step "key"
  onSaveKey: (provider: string, key: string, row: SheetRow) => Promise<void>;
  validating: boolean;
  keyError: string | null;
  onDownload?: (row: SheetRow) => void;
  onDelete?: (row: SheetRow) => void;
  onClose: () => void;
}): JSX.Element
```

The modal owns its own `step` state: selecting a keyless cloud row flips it to the `key`
step; **Back** returns to `list`; **Save & use** calls `onSaveKey`. `use-models.ts` owns:
`available`, `configured`, `apiKeys`, whisper/mlx status, the `llm_cleanup` flag, and the
action helpers (`selectModel`, `saveKeyAndSelect`, `downloadLocal`, `deleteLocal`,
`setCleanup`). The page component becomes mostly markup.

## 11. Risks / notes

- **Local-LLM model discovery** still depends on a reachable server; keep the existing
  `models/available` behavior (it already appends `local-llm/*` when the server answers).
- **Polling**: preserve the two 500 ms download-status effects; they're the only timers
  and they already self-stop when no download is active.
- **MLX availability**: `canRunMlxAsr()` gates MLX rows server-side; the unified list
  simply won't include MLX rows on unsupported machines — no client branching needed.
- **No backend changes** are required for any of the above.

## 12. Open follow-ups (not blocking)

- Where should the MLX keep-alive setting live once removed from this page? (Suggest a
  general "Local models" area in app settings.)
- Confirm the exact local-LLM test endpoint to use for the simplified inline flow
  (`settings/local-llm/test` is referenced by the current picker).
