import type { FreestyleBridge } from "@freestyle/sdk";

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
    const form = new FormData();
    form.append("audio", file);
    const res = await bridge.api("/api/transcribe", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      row.fail(`Server error ${res.status}${detail ? `: ${detail}` : ""}`);
      return;
    }
    const data = (await res.json()) as {
      raw?: string;
      cleaned?: string;
    };
    row.done(data.cleaned ?? data.raw ?? "");
  } catch (err) {
    row.fail(err instanceof Error ? err.message : String(err));
  }
}

interface Row {
  el: HTMLLIElement;
  done(text: string): void;
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
    done(text) {
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
