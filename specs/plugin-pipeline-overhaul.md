# Plugin pipeline overhaul

Status: **Implemented (Parts B–E); Part A (UI-hosting consolidation) deferred**
· Scope: SDK + server + electron · Breaking: **yes** (SDK major bump, shipped)
· Target packages: `packages/sdk`, `apps/server`, `apps/electron`

---

## 0. Implementation status

This PR implements the hook-model overhaul (§5–9) and the `beforeOutput`
consolidation (§4.1) in full. It **defers** the UI-hosting consolidation
(§4.2–4.4: serving plugin UI from the server, deleting the `freestyle-plugin://`
custom scheme, simplifying the bridge, session partitioning) as a follow-up —
that slice touches the sandboxed `WebContentsView`/preload/renderer plugin-hub
surface which can't be verified without an interactive Electron session, and is
lower-risk to land separately. See §14 for the as-shipped summary and what's
left.

**Shipped:**
- SDK: `HookApi`/`PipelineControl` (cancel/suppress), `beforeTranscribe` hook,
  `PluginLlm` capability, extended `beforeCleanup` (`prompt`/`skip`),
  declarative `PluginContributes.settings`, `registry.has()`.
- Server: per-dictation `HookApi` threaded through `beforeTranscribe` →
  `afterTranscribe` → `beforeCleanup` → `afterCleanup`; adaptive cloud mode
  (raw+local-cleanup instead of combined when a plugin needs the hooks);
  `beforeOutput` moved server-side via `POST /api/output/deliver` (see §4.1
  correction below); `POST /api/events` relay; plugin storage routes
  (`GET/PUT/DELETE /api/plugins/:name/storage/:key`).
- Electron: app-side hook registry deleted entirely (`plugins/index.ts`,
  `loader.ts`'s `loadAppPlugins`, `plugins/context.ts`); `deliverOutput()` is
  now purely mechanical; recording/output events relay to the server instead of
  running a local `event` hook.

**Deferred (not in this PR):** §4.2–4.4, §11's "Delete" list for
`manifest.ts`/`ui.ts`/`view-manager.ts`/`ui-host.ts`, §12.1–12.3.

### Correction to the original design (§4.1)

The original plan assumed `beforeOutput`'s final text could be folded into the
`/api/transcribe` response envelope. That's wrong for multi-segment recordings:
the client combines multiple `/api/transcribe` results via a *separate*
`POST /api/post-process` call before the final text exists, so no single
transcribe response ever holds it. **Fix:** `beforeOutput` runs in a dedicated
`POST /api/output/deliver` endpoint that the renderer calls once, right before
delivery, on whatever text it has already assembled (single- or multi-chunk).
See §4.1 (updated) below.

---

## 1. Original brief

> I want to update the plugin pipeline — I feel like there are gaps and the plugin
> system doesn't have full control over it.

Decisions taken during scoping:

- **Scope:** full pipeline overhaul (redesign the hook model, not just patch it).
- **Compat:** breaking changes are acceptable (SDK is early; major version bump).
- **Priority gaps:** cancellation/suppression, capture/audio-stage hooks, LLM
  capability (`ctx.llm`), writable app-side storage + declarative config.
- **Capture veto:** **server-side only** (audio is already in the request body; no
  recording-time veto in the renderer).
- **Consolidation:** collapse the plugin system to be **server-owned end to end**,
  including serving plugin **UI from the server**. The Electron main process keeps
  only what is intrinsically OS-level (output delivery, hosting a view surface).

---

## 2. Why the current system is heavy and leaky

Today a plugin is loaded into **two hosts** — the Freestyle server (`apps/server`)
and the Electron main process (`apps/electron`) — and each hook only runs in the
process it belongs to. This split is the root of most gaps.

### 2.1 Hook surface (current)

| Hook | Host | Fires | Powers | Source |
|---|---|---|---|---|
| `event` | both | pipeline events | observe only | `hooks.ts:27` |
| `config` | server | boot | deep-merge config | `hooks.ts:34` |
| `afterTranscribe` | server | after STT | rewrite raw text | `hooks.ts:43` |
| `beforeCleanup` | server | prompt assembly (cleanup on, local model only) | append `system[]`, override destination | `hooks.ts:51` |
| `afterCleanup` | server | final text | rewrite text | `hooks.ts:62` |
| `beforeOutput` | **app** | before paste | rewrite text / switch mode | `hooks.ts:69` |
| `middleware` | server | boot | Hono middleware | `plugin.ts:63` |

Capabilities on `PluginContext` (`context.ts:70-83`): `settings` (read-only),
`storage` (JSON KV — **read-only/no-op on the app side**, `apps/electron/src/main/plugins/context.ts:47-56`),
`logger`. No LLM, no key access, no cancellation.

### 2.2 The concrete gaps

1. **No capture/pre-transcribe control.** Recording events are emit-only. No hook
   can preprocess the audio buffer, override provider/model/bias per-recording, or
   veto a dictation. `PipelineStage.Capture` exists (`events.ts:28`) with zero
   mutating hook.
2. **No cancellation / suppression.** `registry.run()` swallows throws
   (`registry.ts:86-90`); a hook cannot abort. `afterTranscribe` has **no**
   `consumed` flag (the published docs describe one — `apps/docs/sdk-reference.mdx`
   — but it is not in `hooks.ts`). A voice-command plugin must return `""` and rely
   on downstream empty-text suppression (`index.ts:1218`), which is fragile and
   loses the raw text.
3. **Provider-dependent hook inconsistency (a correctness bug).** On the Freestyle
   Cloud *combined* path (`transcribe.ts:155-217`), STT + cleanup run remotely, so
   `afterTranscribe` and `beforeCleanup` **never fire** — only `afterCleanup` (via
   `applyFinalRewrites`, `post-process.ts:209-237`). The same plugin behaves
   differently depending on the user's provider/cleanup combo.
4. **`beforeCleanup` is under-powered.** Can only append system fragments + override
   destination; can't replace the prompt, change intensity/tone/model, or skip
   cleanup. Fires only on the local/direct-model path.
5. **No LLM capability.** `ctx.llm` / `PluginLlm` is referenced in project memory
   (voice-commands design) but is **absent** from `context.ts`. "Smart" plugins must
   bundle and manage their own credentials — against the intended design.
6. **App-side plugins are effectively read-only.** `storage.set/delete` are no-ops;
   settings are a frozen HTTP snapshot (`apps/electron/src/main/plugins/context.ts`).
7. **No declarative config.** Plugins get UI *pages* (a WebContentsView) but no
   host-rendered settings; config arrives only via the `plugins` setting tuple at
   load time.
8. **Multi-segment route asymmetry.** `POST /api/post-process`
   (`post-process-route.ts`) runs `beforeCleanup`/`afterCleanup` but not
   `afterTranscribe`.

### 2.3 The two-host tax (why UI is heavy)

The Electron side carries a large, duplicative plugin surface:

- **Duplicate discovery:** `apps/electron/src/main/plugins/manifest.ts`
  (`discoverPlugins`) re-implements manifest scanning that the server already does.
- **Custom-scheme UI host:** `apps/electron/src/main/plugins/ui.ts` registers
  `freestyle-plugin://<slug>/...` (`ui.ts:35-50`) and `view-manager.ts` hosts a
  sandboxed `WebContentsView` per page.
- **A fetch proxy that exists only because of the custom scheme:**
  `plugin-bridge:fetch` (`ui-host.ts:189-216`) round-trips every plugin API call
  through IPC → main → `fetch(loopback)` because the page's *secure custom-scheme*
  origin can't hit `http://127.0.0.1` directly (mixed content). **Serving the UI
  from the server origin deletes this entire proxy.**
- **A wide IPC surface:** `plugins:list|refresh|set-enabled|catalog|install|
  uninstall|check-updates`, `plugin-view:show|hide|set-bounds`,
  `plugin-bridge:config|action|fetch` (`ui-host.ts:89-216`).
- **An app-side registry + loader + context** (`apps/electron/src/main/plugins/
  index.ts`, `loader.ts`, `context.ts`) that exists solely to run `beforeOutput` and
  the app-side `event` hook.

---

## 3. Design principles

1. **One host owns plugins: the server.** Discovery, loading, execution, storage,
   config, and UI serving all live in `apps/server`. Electron main becomes a thin
   client.
2. **The pipeline is a single ordered chain of server-side stages** with a shared,
   explicit control object. Cancellation and suppression are first-class.
3. **Provider-independent hooks.** A plugin's hooks fire the same way regardless of
   local vs. cloud vs. BYOK. The cloud path adapts to preserve hook semantics.
4. **Capabilities are injected per-run**, so they reflect current config (LLM,
   cancellation signal) and can be host-gated.
5. **The app never re-implements server logic.** It executes OS actions (paste) and
   renders surfaces (a view pointed at a server URL).

---

## 4. Part A — Server-owned consolidation

### 4.1 Move `beforeOutput` server-side — via a dedicated endpoint (shipped, revised)

`beforeOutput` was the only pipeline hook running in the app. The app context it
needs (`appName`/`windowTitle`/`url`/`bundleId`) is already captured at recording
time and sent to the server via the `x-app-context` header (`transcribe.ts:96-98`),
so the output decision can be computed server-side.

**Revision from the original plan:** folding the decision into the
`/api/transcribe` response doesn't work for multi-segment recordings — the
renderer combines several `/api/transcribe` results via a separate
`POST /api/post-process` call before the final text exists, so no single
transcribe response ever holds the text that's actually delivered. As shipped:

- New `POST /api/output/deliver` (`apps/server/src/routes/output.ts`) accepts
  `{ text, mode, appContext }`, runs `beforeOutput` with a fresh per-call
  `HookApi`, and returns:

  ```ts
  {
    output: { text: string; mode: "paste" | "clipboard" | "none" },
    disposition: "deliver" | "suppressed" | "aborted",
    reason?: string,
  }
  ```

- The renderer (`app.tsx`'s `drainQueue`) calls this once, right before
  delivering — for both single- and multi-chunk dictations — passing whatever
  final text it has already assembled, and uses the *returned* text/mode/
  disposition to decide whether/how to call `window.api.pasteText`/`copyText`.
- Electron's `deliverOutput()` (`index.ts`) no longer runs any plugin hook — it
  mechanically pastes/copies exactly what the renderer already resolved, and
  relays `outputDelivered`/`pipelineError` events to `POST /api/events` instead
  of emitting to a local registry.
- Separately, `/api/transcribe`'s response gained `disposition`/`reason` too —
  but that reflects `afterTranscribe`/`beforeCleanup` consuming/aborting the
  *dictation* stage (e.g. a voice-command plugin), independent of the later
  `beforeOutput` stage handled by `/api/output/deliver`.

**Net:** the entire app-side plugin **hook registry** is deleted
(`plugins/index.ts`'s registry, `loader.ts`'s `loadAppPlugins`,
`plugins/context.ts`). The plugin-management helpers (install/uninstall/enable/
catalog/updates) and the UI-hosting layer (`manifest.ts`, `ui.ts`,
`view-manager.ts`, `ui-host.ts`) are untouched — see §4.2 for why that's
deferred.

### 4.2 Serve plugin UI from the server (deferred — not in this PR)

Add server routes (mounted under the existing `/api/plugins`):

- `GET /api/plugins/:slug/ui/*` — serve static assets from
  `<userData>/plugins/<slug>/`, path-traversal guarded. This is the server-side
  equivalent of `resolvePluginAsset` (`apps/electron/src/main/plugins/manifest.ts:276-292`),
  which moves server-side.
- `GET /api/plugins` — return the discovered plugin list (name, slug, pages, icon,
  displayName, version, description, author, readme, enabled, missing) for the hub.
  The renderer fetches this directly instead of via `plugins:list` IPC.

Electron main keeps a **simplified** `PluginViewManager` that loads
`http://<serverBase>/api/plugins/<slug>/ui/<entry>` instead of the custom scheme.
Everything else about bounds syncing is unchanged.

**Deletions enabled:**

- `apps/electron/src/main/plugins/ui.ts` (custom scheme) — **deleted**.
- `apps/electron/src/main/plugins/manifest.ts` — **deleted** (discovery is
  server-only; the server already has `discoverPlugins` via the SDK loader).
- `apps/electron/src/main/plugins/context.ts` — **deleted**.
- `apps/electron/src/main/plugins/loader.ts`, `index.ts` — **deleted** (no app
  registry).
- `plugin-bridge:fetch` proxy (`ui-host.ts:189-216`) — **deleted**; the page fetches
  same-origin.
- Most of `ui-host.ts` IPC — replaced by direct renderer→server HTTP. What remains:
  a minimal host-action channel (below).

### 4.3 The `window.freestyle` bridge, simplified (deferred — not in this PR)

Because the UI is now same-origin with the server:

- `bridge.serverUrl` = `location.origin`.
- `bridge.api(path, init)` = a plain `fetch(path, init)` (same-origin;
  `connect-src 'self'` CSP suffices). No IPC, no serialization protocol
  (`shared/bridge-protocol.ts` proxy types become unnecessary).
- `bridge.invoke(channel, payload)` (host actions: `copy`, `toast`, `navigate`,
  `bridge.ts:47-54`) still needs to reach the host. Two options — see
  **Open questions §12.1**. Default proposal: a tiny preload exposing only
  `invoke` over one IPC channel (`plugin-bridge:action`, already exists at
  `ui-host.ts:167-184`). Everything else is same-origin fetch.

### 4.4 Event unification (shipped, app→server direction only)

Recording/output events originate in Electron main
(`RecordingStarted/Committed/Cancelled`, `OutputDelivered`). To keep a **single**
`event` sink (server registry), the app relays these to the server:

- Add `POST /api/events` (lightweight, internal) that calls `plugins().emit(event)`
  server-side. Mirrors the existing `POST /api/telemetry` relay pattern.
- Result: the `event` hook runs **only** server-side and receives every event
  exactly once. `apps/electron/src/main/plugins/*` no longer emits.

---

## 5. Part B — Unified hook API + pipeline control

### 5.1 Handler signature (breaking)

```ts
// packages/sdk/src/hooks.ts
export type Handler<I, O> = (
  input: I,
  output: O,
  api: HookApi,
) => void | Promise<void>;
```

### 5.2 `HookApi` (new, per-run)

```ts
// packages/sdk/src/hook-api.ts (new)
export interface HookApi {
  /** Cancellation + suppression control for the whole dictation. */
  readonly control: PipelineControl;
  /** Aborts when the recording/pipeline is cancelled by the user or host. */
  readonly signal: AbortSignal;
  /** The host's configured LLM, or undefined when none is set. Server only. */
  readonly llm?: PluginLlm;
  /** Same logger as the setup context, for convenience. */
  readonly logger: PluginLogger;
}

export interface PipelineControl {
  /** Stop running later plugins for THIS hook only. */
  stopPropagation(): void;
  /** Mark the dictation handled: skip all downstream stages, suppress output. */
  consume(reason?: string): void;
  /** Hard stop: no output, emit PipelineError with the given reason. */
  abort(reason?: string): void;
  readonly state: "running" | "consumed" | "aborted";
}
```

### 5.3 Registry changes

- `PluginRegistry.run()` accepts/creates the shared `HookApi`, checks
  `control.state` between plugins, and stops iterating on `consumed`/`aborted` (or
  `stopPropagation` for the current hook).
- `run()` returns `{ output, state }` so pipeline callers can branch.
- A single `PipelineControl` instance is created **per dictation** and threaded
  through the server stages (`afterTranscribe` → `beforeCleanup` → `afterCleanup` →
  `beforeOutput`). Because all stages now run server-side (Part A), one in-memory
  control object suffices — no cross-process coordination.
- The transcribe route maps terminal control state to the response `disposition`
  (`consumed` → `suppressed`, `abort` → `aborted`). Electron delivers accordingly.

### 5.4 Suppression replaces the empty-string hack

`afterTranscribe`'s output stays `{ text }` (no `consumed` field). Suppression is
expressed via `api.control.consume()`. The voice-commands plugin becomes:

```ts
afterTranscribe(input, output, api) {
  if (isCommand(output.text)) {
    runCommand(output.text);
    api.control.consume("voice-command");
  }
}
```

---

## 6. Part C — Capture / audio-stage hook (server-side)

Add a new **server** hook that runs at the top of `/api/transcribe` before STT:

```ts
// hooks.ts
beforeTranscribe?: Handler<
  BeforeTranscribeInput,
  {
    audio: Uint8Array;            // replaceable (denoise, trim, etc.)
    providerId: string;           // override the voice provider
    modelId: string;              // override the voice model
    language?: string;            // override language
    bias?: string[];              // override/augment ASR vocabulary bias
  }
>;

export interface BeforeTranscribeInput {
  readonly providerId: string;    // the resolved default, pre-override
  readonly modelId: string;
  readonly audioDurationMs: number;
  readonly appContext?: AppContext;
}
```

- Runs at `transcribe.ts` right after audio + defaults are resolved (~line 147),
  **before** provider dispatch and **before** the cloud-combined branch.
- A plugin can `api.control.consume()` here to skip STT entirely (e.g. a plugin that
  handles the audio itself).
- Overrides feed both the cloud-combined path and the local/BYOK path, closing the
  provider-inconsistency gap for the transcribe stage.

`PipelineStage.Capture` now has a real hook.

---

## 7. Part D — LLM capability (`api.llm`)

```ts
// packages/sdk/src/llm.ts (new)
export interface PluginLlm {
  readonly providerId: string;
  readonly modelId: string;
  /** The raw Vercel AI SDK LanguageModel instance (typed as unknown in SDK). */
  getModel(): unknown;
  /** Convenience wrapper over generateText. */
  generateText(opts: {
    prompt: string;
    system?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>;
}
```

- Built per-request in `apps/server/src/lib/plugins/` from `getDefaultModels().llm`
  + `resolveChatModel(provider, model)` + the resolved key (reusing the existing
  `post-process.ts` machinery).
- `undefined` when no LLM is configured; plugins guard with `if (api.llm)`.
- **Plugins never see keys.** The SDK types `getModel()` as `unknown` so the SDK
  stays a leaf package (no `ai` / `@ai-sdk/*` dependency; see project constraint that
  the published SDK must not depend on private packages).
- App-side hooks don't receive `llm` (there is only one app hook path left — none
  after Part A moves `beforeOutput` server-side — so this is server-only by
  construction).

---

## 8. Part E — Writable storage + declarative config

### 8.1 Writable storage everywhere

Since all hooks run server-side now, `PluginStorage` is backed by the server DB
directly (`apps/server/src/lib/plugins/context.ts` already implements real
read/write). The app-side no-op storage is deleted with the app registry (Part A).

For **plugin UI** that needs to persist (the WebContentsView pages), storage is
reached over same-origin fetch to new routes:

- `GET  /api/plugins/:name/storage/:key`
- `PUT  /api/plugins/:name/storage/:key`
- `DELETE /api/plugins/:name/storage/:key`

writing the existing `plugin:<name>:<key>` convention (`context.ts:11`).

### 8.2 Declarative config schema

Add to the manifest (`freestyle.contributes.settings`) a small field schema the host
renders in the plugin detail page — so a plugin gets configuration **without**
building a full UI page.

```ts
// packages/sdk/src/ui.ts — extend PluginContributes
export interface PluginContributes {
  pages?: PluginUIPage[];
  settings?: PluginSettingField[];   // new
}

export type PluginSettingField =
  | { key: string; type: "string" | "number"; label: string; default?: string; description?: string }
  | { key: string; type: "boolean"; label: string; default?: boolean; description?: string }
  | { key: string; type: "select"; label: string; options: { value: string; label: string }[]; default?: string; description?: string };
```

- Parsed tolerantly (drop invalid entries) alongside `parsePluginPages`
  (`packages/sdk/src/ui.ts`), with a Zod schema in
  `packages/validations/src/plugins.ts`.
- The renderer plugin detail page renders the fields and persists to
  `plugin:<name>:<key>` via the settings API.
- Plugins read them with `ctx.settings.getOwn(key)` (already supported).

---

## 9. Cloud-path consistency (folded in)

The cloud *combined* path is the one place hooks currently don't fire. Fix it
adaptively:

- If any loaded plugin implements `beforeTranscribe`, `afterTranscribe`, or
  `beforeCleanup` (detected once via a new `registry.has(hookName)`), the transcribe
  route uses cloud **`mode: "raw"`** for STT and runs the **local cleanup path**
  (`post-process.ts`) so `beforeCleanup` runs — instead of `mode: "combined"`.
- Otherwise, keep `mode: "combined"` for latency.
- `afterCleanup` already runs on all paths via `applyFinalRewrites`; keep that.

This makes hook firing provider-independent at the cost of one extra round-trip only
when a relevant plugin is installed.

---

## 10. New SDK surface (summary of breaking changes)

| Change | Kind |
|---|---|
| `Handler` gains 3rd arg `api: HookApi` | breaking (major) |
| New `HookApi`, `PipelineControl`, `PluginLlm`, `PluginSettingField` exports | additive |
| New `beforeTranscribe` hook | additive |
| `beforeOutput` reclassified server-side (host detail; signature unchanged) | behavioral |
| `afterTranscribe` output stays `{ text }` (no `consumed`) | doc fix |
| `PluginContributes.settings` | additive |
| App-side `PluginContext` writable storage no-op removed | behavioral |
| Response envelope gains `output` + `disposition` | additive (server/app contract) |

The two shipped plugins need **no code changes**: `profanity-filter` uses
`afterCleanup` + `middleware`; `audio-transcription` uses a UI page + `middleware`.
`voice-commands` (draft) is simplified to use `api.control.consume()`.

---

## 11. File-by-file change map

### Create
- `packages/sdk/src/hook-api.ts` — `HookApi`, `PipelineControl`.
- `packages/sdk/src/llm.ts` — `PluginLlm`.
- `apps/server/src/lib/plugins/llm.ts` — build `PluginLlm` from host providers.
- `apps/server/src/lib/plugins/ui-assets.ts` — server-side asset serving +
  path-traversal guard (port of `manifest.ts:resolvePluginAsset`).
- `apps/server/src/routes/events.ts` — `POST /api/events` relay.
- Storage routes + declarative-settings validation (in existing files).

### Modify
- `packages/sdk/src/hooks.ts` — new `Handler` signature; `beforeTranscribe`; docs.
- `packages/sdk/src/registry.ts` — thread `HookApi`, honor `control`, `run()` returns
  state, add `has(hook)`.
- `packages/sdk/src/index.ts` — export new types.
- `packages/sdk/src/ui.ts` + `packages/validations/src/plugins.ts` — `settings`
  contribution schema + parser.
- `apps/server/src/routes/transcribe.ts` — `beforeTranscribe`; per-dictation
  `PipelineControl`; adaptive cloud mode; `beforeOutput` server-side; response
  `output` + `disposition`.
- `apps/server/src/lib/post-process.ts` — pass `HookApi`/control; `beforeCleanup`
  extended powers.
- `apps/server/src/routes/post-process-route.ts` — run `afterTranscribe` too
  (symmetry).
- `apps/server/src/routes/plugins.ts` + `routes/index.ts` — `GET /api/plugins`,
  `GET /api/plugins/:slug/ui/*`, storage routes.
- `apps/electron/src/main/index.ts` — `deliverOutput` reads response `disposition`;
  relay recording/output events to `POST /api/events`.
- `apps/electron/src/main/plugins/view-manager.ts` — load server URL, per-plugin
  session partition (see §12.2).
- `apps/electron/src/main/plugins/ui-host.ts` — trimmed to host-action IPC +
  view show/hide/bounds.
- `apps/electron/src/renderer/**` plugin hub pages — fetch `GET /api/plugins`
  directly; render declarative settings.
- `apps/docs/*plugins*.mdx`, `sdk-reference.mdx` — rewrite to match reality.

### Delete
- `apps/electron/src/main/plugins/ui.ts` (custom scheme).
- `apps/electron/src/main/plugins/manifest.ts` (discovery → server).
- `apps/electron/src/main/plugins/context.ts` (app context).
- `apps/electron/src/main/plugins/loader.ts`, `index.ts` (app registry).
- `apps/electron/src/shared/bridge-protocol.ts` (fetch-proxy protocol) + the
  `plugin-bridge:fetch` handler.

---

## 12. Open questions

1. **Host actions transport.** After same-origin UI, `copy`/`toast`/`navigate`
   still need to reach the host. Options: (a) keep a minimal preload + one IPC
   channel (recommended, least change); (b) `window.postMessage` to the embedding
   dashboard; (c) server-mediated (awkward for `navigate`). Proposal: (a).
2. **Per-plugin origin isolation.** The custom scheme gave each plugin its own
   origin. Serving all plugins from `http://<server>` shares one origin (shared
   `localStorage`/cookies, cross-plugin asset reads). Mitigation: a per-plugin
   `session` partition on each `WebContentsView` + strict CSP + path-scoped serving.
   Confirm this is acceptable. (`http://127.0.0.1`/`localhost` is still a secure
   context in Chromium, so SubtleCrypto etc. keep working.)
3. **Remote server auth for UI assets.** When the server is remote, the plugin UI
   view must send `FREESTYLE_AUTH_TOKEN` on asset + API requests. Plan: inject it
   as a header via the view's session `webRequest`, or scope a short-lived cookie.
4. **Phasing.** Suggested order: (1) SDK core (HookApi/control + registry) →
   (2) server pipeline (beforeTranscribe, control wiring, cloud adaptivity,
   beforeOutput server-side, response envelope) → (3) app thinning (deliverOutput,
   event relay, delete app registry) → (4) UI serving + bridge simplification →
   (5) LLM capability → (6) declarative config → (7) docs. Each phase is
   independently testable.

---

## 13. Verification

- `apps/server` unit tests for: control `consume`/`abort` → response `disposition`;
  `beforeTranscribe` override + audio replace; adaptive cloud mode selection;
  storage routes; asset path-traversal guard.
- SDK tests for `registry.run()` propagation/stop semantics and `has()`.
- `typecheck:web` + `typecheck:node` for electron; `pnpm build`; biome; knip.
- Manual: profanity-filter + audio-transcription still load and function; a
  voice-command-style `consume()` suppresses output end-to-end on both local and
  cloud providers.

---

## 14. As-shipped summary (this PR)

**Verified:**
- `packages/sdk`: `pnpm build` + `pnpm test` (19 tests, incl. new
  `registry.test.ts` covering `stopPropagation`/`consume`/`abort`/`has`).
- `apps/server`: `tsc --noEmit` clean; `pnpm test` (209 tests, incl. new
  `output-and-events.test.ts` for `/api/output/deliver`, `/api/events`, and the
  plugin storage routes; updated `plugin-registry.test.ts` for the new `run()`
  signature).
- `apps/electron`: `typecheck:node` + `typecheck:web` clean; `electron-vite
  build` succeeds (main/preload/renderer).
- `knip`: no new dead code/exports.
- Shipped plugins (`profanity-filter`, `audio-transcription`) typecheck
  unchanged against the new SDK — confirms the 3-arg `Handler` is backward
  compatible with existing 2-arg implementations.

**Deferred to a follow-up PR** (needs interactive Electron verification, higher
risk, and is orthogonal to closing the control/capability gaps that motivated
this work):
- §4.2 Serving plugin UI from the server (`GET /api/plugins`,
  `GET /api/plugins/:slug/ui/*`).
- §4.3 Bridge simplification (same-origin `fetch` instead of the
  `plugin-bridge:fetch` IPC proxy).
- Deleting `apps/electron/src/main/plugins/manifest.ts`, `ui.ts`,
  `view-manager.ts`, and trimming `ui-host.ts` — these still work exactly as
  before and are unaffected by this PR.
- §12.1–12.3 (host-action transport, per-plugin origin isolation, remote-server
  asset auth) — only relevant once §4.2/4.3 land.
- Docs (`apps/docs/*plugins*.mdx`, `sdk-reference.mdx`) — should be updated
  together with whichever PR lands the deferred UI work, so they're written
  once against the final state rather than twice.
