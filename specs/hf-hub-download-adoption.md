# Technical Spec: Adopt `@huggingface/hub` for Local Model Downloads

**Status:** Draft
**Author:** _TBD_
**Date:** 2026-06-04
**Scope:** `apps/server` — Whisper and MLX ASR model download layer only. No inference-runtime changes.

---

## 1. Goal

Replace the hand-rolled model **download** plumbing with the official
[`@huggingface/hub`](https://www.npmjs.com/package/@huggingface/hub) client so that
downloading local voice models is reliable, integrity-checked, and uses the canonical
Hugging Face cache layout.

This is a **download-layer refactor only**. Inference (whisper.cpp binaries, the MLX
Python worker) and the public HTTP API are intentionally untouched. The renderer should
see no behavioral change other than fewer failed/corrupt downloads.

### Non-goals

- No change to inference runtimes, model selection, or transcription code.
- No change to the `/api/whisper/*` and `/api/mlx-asr/*` route contracts or the
  `ModelDownloadState` / `MlxModelDownloadState` shapes consumed by the renderer.
- Not adopting `sherpa-onnx`/Transformers.js or enabling Windows Parakeet/Qwen (separate effort).

---

## 2. Background — current state

### 2.1 Whisper (the primary target)

`apps/server/src/lib/whisper/models.ts`

- `downloadModel(modelId)` (`:141`) does a raw `fetch(model.url)` → streams into
  `${destPath}.downloading` → `renameSync` to final path.
- `model.url` is a hardcoded HF resolve URL built in `constants.ts:18`
  (`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-*.bin`).
- Readiness is decided by `isModelDownloaded()` (`:77`): the file exists **and**
  `stat.size >= model.sizeBytes * 0.95`, where `sizeBytes` is a hand-maintained constant.
- Progress is tracked by wrapping the response body in `webBodyToReadable()` (`:468`),
  which mutates an `ActiveDownload` entry in the in-memory `activeDownloads` map.

### 2.2 MLX ASR (secondary target)

`apps/server/src/lib/mlx-asr/models.ts`

- `downloadMlxModel(modelId)` (`:217`) **already downloads from Hugging Face**, but
  indirectly: it spawns the Python worker with `--model <hfId> --download-model` (`:276`),
  which calls `huggingface_hub` internally.
- Weights land in the standard HF cache (`hfRepoCacheDir()`, `:87`), i.e.
  `~/.cache/huggingface/hub/models--<repo>/snapshots/<rev>/`.
- Readiness = snapshot directory exists and is non-empty (`isMlxModelDownloaded`, `:99`).
- Progress = newline-delimited JSON (`{type:"progress", bytesDownloaded, bytesTotal}`)
  parsed off the worker's stdout (`:287`).
- **Coupling problem:** the model download cannot start until the Python runtime is
  present, so the flow first runs a `building_binary` phase to acquire the runtime
  (`ensureMlxRuntimeDownloaded`, `:254`) even though weight download is pure HTTP.

---

## 3. Problems with the current approach

| # | Problem | Where | Impact |
|---|---------|-------|--------|
| P1 | **No integrity check.** Readiness is a 95%-of-expected-size heuristic. A truncated or corrupt file that happens to be ≥95% reads as `ready`. | `whisper/models.ts:77` | Silent corruption → inference fails at runtime, not download time. |
| P2 | **No resume / no retry.** A dropped connection on a 1.6 GB model restarts from zero; transient 5xx/network blips fail the whole download. | `whisper/models.ts:193` | The reported "instability." |
| P3 | **Hand-maintained `sizeBytes`.** Doubles as the progress denominator and the readiness gate; drifts when upstream files change. | `whisper/constants.ts` | False progress %, false readiness. |
| P4 | **MLX download coupled to Python runtime.** Weights can't download until the runtime is installed; download runs through a spawned subprocess + brittle stdout-JSON parsing. | `mlx-asr/models.ts:244-346` | Extra failure surface; can't pre-fetch weights without the runtime. |
| P5 | **Two divergent cache layouts** (flat `freestyle/whisper-models` vs HF cache) with two bespoke download code paths to maintain. | both | Duplicated, drift-prone logic. |

---

## 4. Why `@huggingface/hub`

- **Integrity & dedup by design.** `downloadFileToCacheDir` stores content as
  `blobs/{etag}` with `snapshots/{rev}/{path}` symlinks; the etag is the content hash, so
  a completed download is content-addressed rather than size-guessed. (Fixes P1.)
- **Custom `fetch` hook.** All download functions accept a `fetch?: typeof fetch` param,
  so we can inject a progress-wrapping fetch and **reuse the existing
  `webBodyToReadable` byte-counter** — the renderer-facing progress contract is preserved.
- **Pinned revisions.** `revision` lets us pin a commit SHA instead of `main` for
  reproducible, verifiable downloads. (Fixes P3's drift.)
- **One cache model for both providers.** Whisper and MLX repos both become HF repos
  under the same cache. (Addresses P5.)
- **Pure TypeScript, no native deps** → safe to bundle in the Electron server (see §9).

Confirmed signature (from source):

```ts
export async function downloadFileToCacheDir(
  params: {
    repo: RepoDesignation;     // e.g. { type: "model", name: "ggerganov/whisper.cpp" }
    path: string;              // e.g. "ggml-tiny.bin"
    revision?: string;         // defaults to "main"; pin to a commit SHA
    hubUrl?: string;
    cacheDir?: string;
    fetch?: typeof fetch;      // custom fetch — our progress hook goes here
  } & Partial<CredentialsParams>,
): Promise<string>             // returns the snapshot symlink path to the blob
```

> ⚠️ Note: progress callbacks are **not** a first-class feature of the library. We get
> progress via the injected `fetch`, not an `onProgress` option.

---

## 5. Design

### 5.1 Shared progress-fetch helper

Add `apps/server/src/lib/hf/progress-fetch.ts`:

```ts
// Returns a fetch wrapper that (a) is bound to an AbortSignal for cancellation and
// (b) streams response.body through the existing byte-counter into `active`.
export function makeProgressFetch(
  active: { bytesDownloaded: number; bytesTotal: number; speedBps: number;
            lastUpdate: number; lastBytes: number },
  signal: AbortSignal,
): typeof fetch {
  return async (input, init) => {
    const res = await fetch(input, { ...init, signal, redirect: "follow" });
    const len = res.headers.get("content-length");
    if (len) active.bytesTotal += Number.parseInt(len, 10);
    if (!res.body) return res;
    // reuse the same 500ms-window speed logic as webBodyToReadable()
    const tracked = wrapBodyWithProgress(res.body, active);
    return new Response(tracked, { headers: res.headers, status: res.status });
  };
}
```

This keeps the **exact** progress semantics the renderer already polls for
(`bytesDownloaded`/`bytesTotal`/`percent`/`speedBps`).

### 5.2 Whisper

**Registry change** (`whisper/constants.ts`): replace the `url: string` field with a
structured reference, and pin a revision.

```ts
export interface WhisperModelDef {
  id: string;
  fileName: string;          // still the on-disk name the binary loads
  displayName: string;
  sizeBytes: number;         // retained for UI display + progress fallback only
  // ...
  repo: string;              // "ggerganov/whisper.cpp"
  repoPath: string;          // "ggml-tiny.bin"
  revision: string;          // pinned commit SHA
}
```

**Download** (`whisper/models.ts:downloadModel`): replace the raw-fetch block (`:192-228`)
with:

```ts
const blobPath = await downloadFileToCacheDir({
  repo: { type: "model", name: model.repo },
  path: model.repoPath,
  revision: model.revision,
  cacheDir: getHfCacheDir(),
  fetch: makeProgressFetch(active, controller.signal),
});
// Materialize at the flat path the inference layer already expects, so binary.ts /
// server.ts are untouched. Copy (not symlink) for Windows safety — see §10 OQ1.
copyFileSync(blobPath, getModelPath(model));
```

**Readiness** (`isModelDownloaded`): prefer "blob present in HF cache for the pinned
revision"; keep the existing flat-path size check as a **fallback** so already-downloaded
users are not forced to re-download (see §8 Migration). The fragile 95% gate stops being
the source of truth.

### 5.3 MLX ASR

Decouple weight download from the Python runtime by downloading the snapshot **in Node**.

**Download** (`mlx-asr/models.ts:downloadMlxModel`): replace the
`updateManagedMlxRuntimeIfNeeded` → `ensureMlxRuntimeDownloaded` → spawn-`--download-model`
sequence (`:244-346`) with an HF snapshot download into the same cache mlx-audio reads:

```ts
active.phase = "downloading_model";
const files = await listFiles({ repo: { type: "model", name: model.hfId },
                                revision: model.revision, recursive: true });
active.bytesTotal = files.reduce((n, f) => n + (f.size ?? 0), 0); // accurate denominator
for (const f of files) {
  await downloadFileToCacheDir({
    repo: { type: "model", name: model.hfId },
    path: f.path, revision: model.revision,
    cacheDir: hfCacheRoot(),
    fetch: makeProgressFetch(active, controller.signal), // cumulative across files
  });
}
```

Result: the Python runtime is needed only at **inference** time, not download time. The
`building_binary` phase no longer gates weight download. Progress becomes accurate
(summed from the file manifest) instead of parsed from worker stdout.

> Keep `snapshotDownload` as a simpler fallback if per-file progress proves unnecessary;
> the explicit `listFiles` + loop is recommended for an accurate progress bar.

### 5.4 Cancellation & deletion

- **Cancel:** the injected `fetch` is bound to the existing `AbortController` in the
  `ActiveDownload` entry → `cancelDownload`/`cancelMlxDownload` keep working unchanged.
- **Delete:** MLX `deleteMlxModel` (rm the repo cache dir) is unchanged. Whisper
  `deleteModel` removes the flat materialized file; optionally also evict the HF blob.

### 5.5 What stays identical

- Routes: `apps/server/src/routes/whisper.ts`, `routes/mlx-asr.ts` — unchanged.
- Status shapes: `ModelDownloadState`, `MlxModelDownloadState` — unchanged.
- Renderer polling (`settings/models.tsx`) — unchanged.
- whisper.cpp binary acquisition (`ensureBinariesDownloaded`, `buildFromSource`,
  `downloadWindowsBinaries`) — **out of scope**, unchanged. (Could later reuse the same
  progress-fetch, but not in this spec.)

---

## 6. API contract

No public changes. This is verifiable by diffing the OpenAPI/`hc` client types before and
after — they must be byte-identical.

---

## 7. Dependencies

- Add `@huggingface/hub` to `apps/server` `package.json` dependencies (pin a version).
- Pure ESM/TS; **no native binaries** → no `electron-builder` rebuild concerns. Confirm the
  server bundler (tsup/esbuild/whatever `apps/server` uses) does not externalize it
  incorrectly, or mark it bundled.

---

## 8. Migration / backward compatibility

- **Existing Whisper files** live at `~/.cache/freestyle/whisper-models/ggml-*.bin`.
  Keep the flat-path size check as a readiness fallback so existing users are not
  re-downloaded. New downloads go through the HF cache and are then materialized at the
  same flat path → no migration script required.
- **Existing MLX snapshots** already live in the HF cache; the new Node downloader writes
  to the identical location, so prior downloads are detected as `ready` unchanged.
- No DB migration. `model_configs` handling in `deleteMlxModel` is untouched.

---

## 9. Bundling / packaging notes

- Verify `@huggingface/hub` resolves at runtime inside the packaged Electron app (asar).
- The HF cache root continues to honor `HUGGINGFACE_HUB_CACHE` / `HF_HOME` (already read by
  `hfCacheRoot()` at `mlx-asr/models.ts:78`); reuse that resolver for Whisper too so both
  providers agree on cache location.

---

## 10. Risks & open questions

- **OQ1 — Windows symlinks.** The HF cache uses `blobs/` + `snapshots/` symlinks. On
  Windows, symlink creation may require privileges. Mitigation for Whisper: we `copyFileSync`
  the resolved blob to the flat path anyway. For MLX: confirm mlx-audio reads symlinked
  snapshots on the platforms it runs (Apple Silicon only today, where symlinks are fine).
- **OQ2 — Resume.** The JS hub client's resume support is weaker than Python
  `huggingface_hub`. This refactor fixes integrity and retry-around-failures, but full
  byte-range resume of a partial file may still be limited. Confirm acceptable, or layer a
  retry-with-backoff wrapper around the per-file download.
- **OQ3 — Per-file progress for MLX.** `listFiles` must return `size` for an accurate
  denominator; verify for `mlx-community/*` repos. Fallback: show indeterminate progress
  during snapshot download.
- **OQ4 — Pinned revisions.** Pinning a commit SHA per model improves reproducibility but
  requires updating the registry when we intentionally bump a model. Decide SHA vs `main`.

---

## 11. Rollout plan (phased)

1. **Phase 0 — Plumbing.** Add dependency; add `lib/hf/progress-fetch.ts` and a shared
   `getHfCacheDir()`; unit-test the progress wrapper. No behavior change.
2. **Phase 1 — Whisper.** Migrate `downloadModel` + registry; keep flat-path materialization
   and the size-check fallback. Ship behind verification on all three platforms.
3. **Phase 2 — MLX.** Replace the Python `--download-model` path with the Node snapshot
   downloader; decouple from runtime acquisition. Keep the Python worker for inference.
4. **Phase 3 — Cleanup.** Remove dead raw-fetch/`webBodyToReadable` code paths once both
   providers are migrated; unify cache helpers.

Each phase is independently shippable and revertible.

---

## 12. Test plan

- **Unit:** registry resolves to `{repo, path, revision}`; progress-fetch reports correct
  `bytesDownloaded`/`speedBps`; abort propagates.
- **Integration:** download `tiny` end-to-end; mid-download cancel leaves no partial in the
  flat path; deliberately corrupt a blob and confirm readiness now rejects it (P1 regression
  test).
- **Cross-platform:** macOS (arm64 + x64), Windows (symlink/copy path), Linux.
- **Migration:** with a pre-existing flat `ggml-tiny.bin`, status is `ready` without
  re-download; with a pre-existing MLX snapshot, status is `ready`.
- **Contract:** generated `hc` types unchanged before/after.