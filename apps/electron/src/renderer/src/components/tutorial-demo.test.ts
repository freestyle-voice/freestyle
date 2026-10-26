import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../lib/query";

vi.stubGlobal("window", { api: { defaultHotkey: "Fn", platform: "darwin" } });
const { TutorialDemo } = await import("./tutorial-demo");

function render(settings: Record<string, string>, interactive = false) {
  const client = new QueryClient();
  client.setQueryData(queryKeys.settings, settings);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(TutorialDemo, { interactive }),
    ),
  );
}

describe("dictation tutorial follows persisted behavior", () => {
  it("uses the configured shortcut and teaches toggle activation", () => {
    const html = render({
      hotkey: "Alt+Space",
      hotkey_mode: "toggle",
      output_mode: "paste",
    });
    expect(html).toContain("⌥");
    expect(html).toMatch(/press again/i);
    expect(html).not.toMatch(/>release\./i);
  });

  it("teaches holding and releasing for hold activation", () => {
    const html = render({
      hotkey: "Fn",
      hotkey_mode: "hold",
      output_mode: "paste",
    });
    expect(html).toMatch(/>Hold</);
    expect(html).toMatch(/release/i);
    expect(html).not.toMatch(/press again/i);
  });

  it("explains manual paste in clipboard mode without promising text will land in practice", () => {
    const html = render({ hotkey: "Fn", output_mode: "clipboard" }, true);
    expect(html).toMatch(/clipboard/i);
    expect(html).toMatch(/paste/i);
    expect(html).not.toContain("your words land right here");
  });
});
