import type { FreestyleBridge } from "@freestyle/sdk";
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

  const status = document.createElement("span");
  status.className = "result-status";
  status.textContent = "Transcribing…";

  head.append(name, status);
  el.append(head);

  return {
    el,
    done(text, meta) {
      status.remove();
      const body = document.createElement("p");
      body.className = "result-text";
      body.textContent = text || "(no speech detected)";
      el.append(body);

      if (text) {
        const copy = document.createElement("button");
        copy.className = "result-copy";
        copy.type = "button";
        copy.textContent = "Copy";
        copy.addEventListener("click", () => {
          void bridge?.invoke("copy", { text });
          copy.textContent = "Copied";
          window.setTimeout(() => {
            copy.textContent = "Copy";
          }, 1200);
        });
        head.append(copy);
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
      status.textContent = "Failed";
      status.classList.add("is-error");
      const body = document.createElement("p");
      body.className = "result-text is-error";
      body.textContent = message;
      el.append(body);
    },
  };
}

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
