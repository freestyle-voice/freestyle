import type { FreestyleBridge } from "freestyle-voice";
import { toWav16k } from "./to-wav.js";

/**
 * Transcribe-files page. Uploads each chosen/dropped audio file to the local
 * server's `POST /api/transcribe` via the host bridge, then renders the raw and
 * cleaned text. No host privileges beyond the bridge.
 */

const bridge: FreestyleBridge | undefined = window.freestyle;

const dropzone = requireEl<HTMLLabelElement>("#dropzone");
const fileInput = requireEl<HTMLInputElement>("#file-input");
const results = requireEl<HTMLUListElement>("#results");

function requireEl<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing element: ${selector}`);
  return el;
}

fileInput.addEventListener("change", () => {
  if (fileInput.files) handleFiles(fileInput.files);
  fileInput.value = "";
});

for (const type of ["dragenter", "dragover"] as const) {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragging");
  });
}
for (const type of ["dragleave", "drop"] as const) {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragging");
  });
}
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
});

function handleFiles(files: FileList): void {
  for (const file of Array.from(files)) {
    if (
      file.type.startsWith("audio/") ||
      /\.(wav|mp3|m4a|ogg|flac|webm)$/i.test(file.name)
    ) {
      void transcribe(file);
    }
  }
}

async function transcribe(file: File): Promise<void> {
  const row = createRow(file.name);
  results.prepend(row.el);

  if (!bridge) {
    row.fail("Host bridge unavailable.");
    return;
  }

  try {
    // Freestyle's transcription providers expect 16 kHz mono PCM WAV, so decode
    // and resample the dropped file (wav/mp3/m4a/…) before uploading.
    let wav: Blob;
    try {
      wav = await toWav16k(file);
    } catch {
      row.fail("Could not decode this audio file.");
      return;
    }

    // Send the WAV bytes as a raw body (not multipart): an ArrayBuffer survives
    // the host bridge intact, whereas a FormData/File is mangled crossing the
    // sandbox boundary. The server accepts a raw audio body too.
    const res = await bridge.api("/api/transcribe", {
      method: "POST",
      headers: { "content-type": "audio/wav" },
      body: await wav.arrayBuffer(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      row.fail(`Server error ${res.status}${detail ? `: ${detail}` : ""}`);
      return;
    }
    const data = (await res.json()) as {
      raw?: string;
      cleaned?: string;
      model?: string;
      durationMs?: number;
      audioDurationMs?: number;
      costUsd?: number;
    };
    row.done(data.cleaned ?? data.raw ?? "", {
      ...(data.model ? { model: data.model } : {}),
      ...(typeof data.durationMs === "number"
        ? { durationMs: data.durationMs }
        : {}),
      ...(typeof data.audioDurationMs === "number"
        ? { audioDurationMs: data.audioDurationMs }
        : {}),
      ...(typeof data.costUsd === "number" ? { costUsd: data.costUsd } : {}),
    });
  } catch (err) {
    row.fail(err instanceof Error ? err.message : String(err));
  }
}

interface ResultMeta {
  model?: string;
  durationMs?: number;
  audioDurationMs?: number;
  costUsd?: number;
}

interface Row {
  el: HTMLLIElement;
  done(text: string, meta: ResultMeta): void;
  fail(message: string): void;
}

function createRow(fileName: string): Row {
  const el = document.createElement("li");
  el.className = "result";

  const head = document.createElement("div");
  head.className = "result-head";

  const name = document.createElement("span");
  name.className = "result-name";
  name.textContent = fileName;

  // While the request is in flight we show a spinner + label. The server
  // returns the whole transcript in one response (no progress stream), so an
  // indeterminate spinner is the honest signal; an elapsed timer gives the user
  // a sense of how long a long file is taking.
  const status = document.createElement("span");
  status.className = "result-status";
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  spinner.setAttribute("aria-hidden", "true");
  const statusLabel = document.createElement("span");
  statusLabel.textContent = "Transcribing…";
  status.append(spinner, statusLabel);

  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    statusLabel.textContent = `Transcribing… ${formatElapsed(Date.now() - startedAt)}`;
  }, 1000);

  head.append(name, status);
  el.append(head);

  return {
    el,
    done(text, meta) {
      window.clearInterval(timer);
      status.remove();
      const body = document.createElement("p");
      body.className = "result-text";
      body.textContent = text || "(no speech detected)";
      el.append(body);

      // Long transcripts are clamped to a few lines; Copy and Download always
      // operate on the full text below.
      if (text) {
        body.classList.add("is-clamped");
        head.append(buildActions(text, fileName));
      }

      const metrics = formatMetrics(meta);
      if (metrics.length > 0) {
        const footer = document.createElement("div");
        footer.className = "result-meta";
        for (const m of metrics) {
          const chip = document.createElement("span");
          chip.textContent = m;
          footer.append(chip);
        }
        el.append(footer);
      }
    },
    fail(message) {
      window.clearInterval(timer);
      status.remove();
      const failed = document.createElement("span");
      failed.className = "result-status is-error";
      failed.textContent = "Failed";
      head.append(failed);
      const body = document.createElement("p");
      body.className = "result-text is-error";
      body.textContent = message;
      el.append(body);
    },
  };
}

/** Elapsed time as `12s` or `2:05` for the in-flight status label. */
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Copy + Download icon buttons that act on the full transcript text. */
function buildActions(text: string, fileName: string): HTMLDivElement {
  const actions = document.createElement("div");
  actions.className = "result-actions";

  const copy = iconButton(ICON_COPY, "Copy transcript");
  copy.addEventListener("click", () => {
    void bridge?.invoke("copy", { text });
    flash(copy, ICON_CHECK);
  });

  const download = iconButton(ICON_DOWNLOAD, "Download transcript");
  download.addEventListener("click", () => downloadText(text, fileName));

  actions.append(copy, download);
  return actions;
}

/** Build a small square icon button containing the given inline SVG. */
function iconButton(svg: string, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "result-action";
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = svg;
  return btn;
}

/** Briefly swap a button's icon (e.g. to a checkmark after copying). */
function flash(btn: HTMLButtonElement, svg: string): void {
  const original = btn.innerHTML;
  btn.innerHTML = svg;
  window.setTimeout(() => {
    btn.innerHTML = original;
  }, 1200);
}

/**
 * Save the transcript as a .txt file. The sandboxed page can't reach the host's
 * native save dialog, so we trigger an in-page object-URL download — Electron
 * handles it like any browser download.
 */
function downloadText(text: string, fileName: string): void {
  const base = fileName.replace(/\.[^./\\]+$/, "") || "transcript";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}.txt`;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const ICON_COPY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
const ICON_DOWNLOAD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>';

/** Build the short metric chips shown under a transcript. */
function formatMetrics(meta: ResultMeta): string[] {
  const chips: string[] = [];
  if (typeof meta.audioDurationMs === "number" && meta.audioDurationMs > 0) {
    chips.push(`${(meta.audioDurationMs / 1000).toFixed(1)}s audio`);
  }
  if (typeof meta.durationMs === "number" && meta.durationMs > 0) {
    chips.push(`${(meta.durationMs / 1000).toFixed(1)}s processing`);
  }
  if (meta.model) chips.push(stripProvider(meta.model));
  if (typeof meta.costUsd === "number" && meta.costUsd > 0) {
    chips.push(`$${meta.costUsd.toFixed(4)}`);
  }
  return chips;
}

function stripProvider(model: string): string {
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}
