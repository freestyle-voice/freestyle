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

  it("keeps model controls interactive while the optional picker catalog loads", async () => {
    const [hook, page, modal, picker] = await Promise.all([
      readFile(resolve(modelsRoot, "use-models.ts"), "utf8"),
      readFile(resolve(modelsRoot, "index.tsx"), "utf8"),
      readFile(resolve(modelsRoot, "model-modal.tsx"), "utf8"),
      readFile(resolve(modelsRoot, "transcription-picker.tsx"), "utf8"),
    ]);

    // The selected configuration is the only critical state. Catalog, key,
    // and local-engine discovery should not delay opening the picker shell.
    expect(hook).toContain(
      "const loading = configuredQuery.isLoading || settingsQuery.isLoading;",
    );
    expect(hook).toContain("catalogLoading: boolean;");
    expect(hook).toContain("keysLoading: boolean;");
    expect(page).toContain("catalogLoading={m.catalogLoading}");
    expect(page).toContain("loading={m.keysLoading}");
    expect(modal).toContain("catalogLoading={catalogLoading}");
    expect(picker).toContain("catalogLoading");
    expect(picker).toContain('t("models.picker.checkingAvailability")');
  });

  it("keeps the managed Cloud path as one all-in-one action", async () => {
    const [page, bundle] = await Promise.all([
      readFile(resolve(modelsRoot, "index.tsx"), "utf8"),
      readFile(resolve(modelsRoot, "freestyle-cloud-bundle-card.tsx"), "utf8"),
    ]);

    expect(page).toContain("<FreestyleCloudBundleCard");
    expect(page).toContain("onUse={() => void configureFreestylePair()}");
    expect(bundle).toContain('data-testid="freestyle-cloud-bundle"');
    expect(bundle).toContain('t("models.freestyleCloud.use")');
    expect(bundle).toContain('t("models.freestyleCloud.signedInDescription")');
    expect(bundle).not.toContain("CloudRouteOption");
  });
});
