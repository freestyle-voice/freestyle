# Technical Spec: Migrate MLX ASR Downloads to `@huggingface/hub`

**Status:** Draft
**Author:** _TBD_
**Date:** 2026-06-04
**Scope:** `apps/server/src/lib/mlx-asr` — MLX (Qwen3-ASR / Parakeet) model **download** path only.
**Depends on:** the Whisper migration (already shipped) — reuses `lib/hf/progress.ts`.

---

## 1. Goal

Replace the subprocess-based MLX model download (spawn the Python worker with
`--download-model`, parse progress as JSON off stdout) with a direct Node download via
`@huggingface/hub`, reusing the `progressFetch` helper introduced for Whisper.

This removes the most brittle parts of the MLX download path and **decouples weight
download from Python-runtime acquisition** — today you cannot fetch model weights until
the bundled Python worker/runtime is installed, even though the download is pure HTTP.

### Non-goals

- No change to MLX **inference** (`server.ts`, the Python worker, `mlx_audio.load()`).
- No change to runtime acquisition itself (`runtime.ts`) — the worker tarball still comes
  from GitHub releases; only **model weight** download changes.
- No change to the `/api/mlx-asr/*` route contract or the `MlxModelDownloadState` shape.
- Apple-Silicon gating (`isAppleSiliconMac()`) is unchanged. This does **not** bring MLX to
  Windows (that needs a different inference runtime — separate effort).

---

## 2. Why this is safe — equivalence of the download

The current download is **not** doing anything MLX-specific. `scripts/mlx_asr_server.py`:

```python
def _download_model(model_id: str) -> None:
    from huggingface_hub import snapshot_download
    path = snapshot_download(model_id, tqdm_class=_ProgressTqdm)   # :143
```

`mlx_audio.load(model_id)` later reads that same snapshot from the HF cache. Therefore a
Node-side `snapshotDownload({ repo: hfId })` writing into the **same** HF cache
(`~/.cache/huggingface/hub/models--<repo>/snapshots/<rev>/`) is functionally equivalent —
`load()` cannot tell which client populated the cache.

This is the core de-risking fact: we are swapping *who performs an identical
`snapshot_download`*, not changing what ends up on disk.

---

## 3. Background — current state

`apps/server/src/lib/mlx-asr/models.ts`

- `downloadMlxModel(modelId)` (`:217`):
  1. Marks phase `building_binary`, calls `updateManagedMlxRuntimeIfNeeded()` then
     `getRunner()`; if the runtime/Python is missing, runs `ensureMlxRuntimeDownloaded()`
     (`runtime.ts`) — **download is gated on the runtime being present**.
  2. Marks phase `downloading_model`, `spawn(runner, ["--model", hfId, "--download-model"])`.
  3. Parses newline-delimited JSON `{type:"progress", bytesDownloaded, bytesTotal}` off
     stdout into the in-memory `ActiveMlxDownload` (`:287-312`); reports via
     `getMlxModelStatus`.
- Readiness: `isMlxModelDownloaded()` (`:99`) — HF snapshot dir exists and is non-empty.
- `getRunner()` (`:113`) resolves the bundled worker or a system Python+mlx-audio — used
  **only** by `downloadMlxModel`.
- `cancelMlxDownload()` (`:349`) — `proc.kill()`, plus `cancelMlxRuntimeDownload()` if still
  in `building_binary`.
- `deleteMlxModel()` (`:360`) — `rm -rf` the repo cache dir + clear `model_configs` row.

### 3.1 The status choreography (the thing to be careful about)

`getMlxModelStatus()` (`:142-204`) resolves, in order:

1. active download error → `error`
2. active download → `downloading` (uses runtime progress during `building_binary`, else
   `active.bytes*`)
3. `describeMlxSetupBlocker()` returns non-null (no Apple Silicon / no worker / no Python /
   mlx-audio missing) → `not_downloaded` if the runtime is installable, else `error`
4. `isMlxModelDownloaded()` → `ready`
5. else → `not_downloaded`

**Key consequence:** step 3 runs *before* step 4. So with the current code, weights on disk
but no runtime ⇒ status is `error`/`not_downloaded`, never `ready`. Any change that lets
weights download without the runtime must decide what this state should report (see §5.2).

---

## 4. Problems being fixed

| # | Problem | Where |
|---|---------|-------|
| M1 | **Brittle progress transport.** Progress is JSON parsed from worker stdout; any stray/partial line, buffering, or worker-version drift breaks the bar. | `models.ts:287-312` |
| M2 | **Download gated on the runtime.** Must install the ~hundreds-of-MB Python worker before any weights download, even though weights are plain HTTP from HF. | `models.ts:244-261` |
| M3 | **Subprocess failure surface.** spawn/env/exit-code/stderr handling for what is fundamentally a file download. | `models.ts:275-346` |
| M4 | **No integrity beyond "dir non-empty."** A partial snapshot reads as present. | `models.ts:99` |

`@huggingface/hub` addresses M1/M3 (no subprocess, progress via `progressFetch`), M4
(content-addressed blobs), and enables M2's fix (§5.2).

---

## 5. Design

### 5.1 Phase 1 — swap the transport (recommended first, low risk)

Keep the **existing choreography** (runtime still ensured first, phases unchanged) and
replace only the spawn with a Node snapshot download. This is the smallest change that
kills the subprocess + stdout-JSON parsing.

In `downloadMlxModel`, after the runtime is ensured and phase flips to `downloading_model`,
replace the `spawn(...)` Promise (`:275-346`) with:

```ts
const repo = { type: "model", name: model.hfId } as const;

// Accurate denominator for the progress bar (sum of LFS + regular file sizes).
const files = await listFiles({ repo, recursive: true });
active.bytesTotal = files.reduce((n, f) => n + (f.size ?? 0), 0);

// progressFetch wraps every blob fetch, so cumulative bytes accrue automatically.
await snapshotDownload({
  repo,
  cacheDir: hfCacheRoot(),
  fetch: progressFetch(active, active.controller.signal),
});
```

`ActiveMlxDownload` changes: drop `proc: ChildProcess | null`, add
`controller: AbortController` (mirrors the Whisper `ActiveDownload`). `cancelMlxDownload`
switches `active.proc?.kill()` → `active.controller.abort()`. The `building_binary` branch
of cancel (calls `cancelMlxRuntimeDownload()`) is unchanged.

**Removed by Phase 1:** the spawn Promise (~72 lines), the stdout JSON parser, the `stderr`
field, and — since it was only used for download — `getRunner()` (~28 lines) plus its
`python.ts` imports used solely there. Net ≈ **−90 lines**.

**Behavioral parity:** runtime is still acquired during `building_binary`, so
`getMlxModelStatus` semantics are **identical** to today. Lowest-risk increment.

### 5.2 Phase 2 — decouple weights from the runtime (optional, behavior change)

Once Phase 1 is proven, drop the runtime-ensure from the *download* path so users can fetch
weights without first installing the Python worker (fixes M2). The runtime is then acquired
lazily at **inference** (server start already calls `canRunMlxAsr()` / ensures the worker).

This requires updating the status choreography so "weights present, runtime absent" is not
reported as a hard `error`. Proposed change to `getMlxModelStatus` (§3.1 step ordering):

- Move the `isMlxModelDownloaded()` check **before** `describeMlxSetupBlocker()`, so a
  downloaded model reports `ready` regardless of runtime state.
- Surface "runtime still needed to run" through the **already-existing** top-level
  `runtime` / `blockedReason` fields on `GET /api/mlx-asr/status` (route `:54`, `:70`),
  which the renderer already receives — i.e. readiness of *weights* and readiness of the
  *runtime* become independent signals, which is more truthful than today.

> Phase 2 touches renderer-visible status semantics, so it needs a UI review: confirm the
> settings screen distinguishes "model downloaded" from "runtime installed." If that
> distinction isn't wanted, **stop after Phase 1** — it already removes the brittle code.

### 5.3 Progress denominator & phases

- `building_binary` (runtime) progress continues to come from
  `getMlxRuntimeDownloadStatus()` exactly as today (`models.ts:158-161`).
- `downloading_model` denominator now comes from `listFiles` sum instead of the worker's
  reported `bytesTotal`. `progressFetch` only accumulates `bytesDownloaded`/`speedBps`
  (it does not trust per-request `content-length`, matching the Whisper helper).

### 5.4 Unchanged

`isMlxModelDownloaded`, `deleteMlxModel` (rm cache dir + DB row), `hfCacheRoot`/
`hfRepoCacheDir`, the route handlers, `MlxModelDownloadState`, runtime acquisition
(`runtime.ts`), and the Python worker (still used for inference, and still supports
`--download-model` as a fallback we simply stop calling).

---

## 6. API contract

No public change. `MlxModelDownloadState` and the `/api/mlx-asr/*` routes are identical.
Phase 2 changes only *which* status a given on-disk state maps to (weights-ready vs
runtime-blocked), not the response shape.

---

## 7. Edge cases & risks

- **OQ1 — `listFiles` sizes.** Need `f.size` populated for safetensors/LFS to get an
  accurate bar. Verify for `mlx-community/*`. Fallback: indeterminate progress (omit
  `downloadProgress` denominator, as the code already tolerates `bytesTotal === 0`).
- **OQ2 — `snapshotDownload` + custom `fetch`.** Confirm `snapshotDownload` forwards the
  `fetch` option to its per-file downloads (it shares the download-file core that
  `downloadFileToCacheDir` uses). If not, fall back to an explicit `listFiles` +
  per-file `downloadFileToCacheDir` loop accumulating into the same `active` sink.
- **OQ3 — Cancellation granularity.** Aborting mid-snapshot leaves a partial cache;
  `isMlxModelDownloaded` (dir non-empty) could then read as present. Mitigation: on abort,
  `rmSync(hfRepoCacheDir(model.hfId), {recursive:true,force:true})` in `cancelMlxDownload`
  (the Python path effectively restarted cleanly too). Decide whether to also prune on the
  next download attempt.
- **OQ4 — Concurrency with runtime download.** Today both share the single
  `activeDownload` in `runtime.ts`. Phase 1 keeps runtime-then-weights sequential, so no
  new concurrency. Phase 2 must ensure a weights download and a lazy runtime fetch don't
  race the same progress slot.
- **OQ5 — `mlx_audio.load()` revision.** `snapshot_download(model_id)` defaults to `main`;
  match it (no `revision`, or pin per model in `MlxAsrModelDef` for reproducibility).

---

## 8. Test plan (Apple Silicon required)

- **Unit:** `ActiveMlxDownload` cancel aborts the controller; `getMlxModelStatus` mapping
  for each state (Phase 2: add the weights-ready/runtime-absent case).
- **Integration (smoke, mirrors the Whisper smoke test):** Node `snapshotDownload` of
  `mlx-community/Qwen3-ASR-0.6B-5bit` (smallest, ~450 MB) into the HF cache; assert the
  snapshot dir matches what `snapshot_download` produces and `isMlxModelDownloaded` → true.
- **Inference parity:** after a Node download, start the MLX server and transcribe a clip —
  confirm `mlx_audio.load()` loads from cache with no re-download.
- **Cancel:** abort mid-download; assert no partial snapshot is left that reads as `ready`
  (OQ3).
- **Migration:** a pre-existing snapshot (downloaded by the old Python path) still reports
  `ready` and runs — verified by leaving an existing user's cache untouched.

---

## 9. Rollout

1. **Phase 1** — transport swap, behavior-identical. Ship and verify on Apple Silicon.
2. **Phase 2** — decouple from runtime + status reorder, **only if** the UI should show
   weights-downloaded independent of runtime-installed. Otherwise stop at Phase 1.
3. **Cleanup** — optionally drop `--download-model` from `scripts/mlx_asr_server.py` once no
   caller remains (keep `--model-status`/inference paths).

Each phase is independently shippable and revertible.

---

## 10. Estimated impact

- **Code:** ≈ −90 lines net in `models.ts` (Phase 1): remove spawn + stdout parser +
  `getRunner`; add ~12 lines of `listFiles`/`snapshotDownload`. No new files (reuses
  `lib/hf/progress.ts`).
- **Reliability:** removes the subprocess + stdout-JSON transport (M1/M3) and adds
  content-addressed integrity (M4).
- **Architecture:** Phase 2 lets weights download without the Python runtime (M2) — the
  most meaningful UX win, at the cost of a status-semantics change requiring UI sign-off.
