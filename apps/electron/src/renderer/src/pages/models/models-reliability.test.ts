import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modelsRoot = dirname(fileURLToPath(import.meta.url));

describe("Models local-runtime reliability", () => {
  it("does not make a local voice model the default before its server starts", async () => {
    const source = await readFile(resolve(modelsRoot, "use-models.ts"), "utf8");

    const selectLocalVoice = source.slice(
      source.indexOf("const selectLocalVoice"),
      source.indexOf("const downloadLocal"),
    );
    expect(selectLocalVoice).toContain("Could not start the local model.");
    expect(selectLocalVoice.indexOf("server.start.$post")).toBeLessThan(
      selectLocalVoice.indexOf("api.models.configured.$post"),
    );
  });

  it("surfaces failed local download and cancellation requests in the model picker", async () => {
    const [hook, modal] = await Promise.all([
      readFile(resolve(modelsRoot, "use-models.ts"), "utf8"),
      readFile(resolve(modelsRoot, "model-modal.tsx"), "utf8"),
    ]);

    expect(hook).toContain("Could not start the local model download.");
    expect(hook).toContain("Could not cancel the local model download.");
    expect(hook).toContain("localActionError");
    expect(modal).toContain("localActionError");
    expect(modal).toContain('role="alert"');
  });
});
