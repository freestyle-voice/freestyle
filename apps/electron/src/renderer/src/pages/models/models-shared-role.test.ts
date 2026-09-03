import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modelsRoot = dirname(fileURLToPath(import.meta.url));
const rendererRoot = resolve(modelsRoot, "../..");

describe("Models shared assistant role", () => {
  it("describes the selected LLM as the shared assistant model", async () => {
    const [page, pairCard, locale] = await Promise.all([
      readFile(resolve(modelsRoot, "index.tsx"), "utf8"),
      readFile(resolve(modelsRoot, "pair-card.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "locales/en.json"), "utf8"),
    ]);

    expect(page).toContain('subtitle={t("models.subtitle")}');
    expect(pairCard).toContain('t("models.pair.assistantKicker")');
    expect(locale).toContain(
      '"subtitle": "Configure transcription and assistant models in one place."',
    );
    expect(locale).toContain('"assistantKicker": "AI assistant · optional"');
    expect(locale).toContain(
      '"assistantKickerLocked": "AI assistant · included"',
    );
  });

  it("uses the compact Settings frame instead of a standalone editorial page", async () => {
    const [page, pairCard, modal] = await Promise.all([
      readFile(resolve(modelsRoot, "index.tsx"), "utf8"),
      readFile(resolve(modelsRoot, "pair-card.tsx"), "utf8"),
      readFile(resolve(modelsRoot, "model-modal.tsx"), "utf8"),
    ]);

    expect(page).toContain('data-testid="models-settings-page"');
    expect(page).toContain('data-testid="models-api-keys"');
    expect(pairCard).toContain('data-testid="models-configuration"');
    expect(pairCard).not.toContain("fontSize: 34");
    expect(modal).toContain("max-h-[calc(100dvh-2rem)]");
  });
});
