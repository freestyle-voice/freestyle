import { createHighlighterCore } from "shiki/core";
import json from "shiki/dist/langs/json.mjs";
import vitesseLight from "shiki/dist/themes/vitesse-light.mjs";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const highlighter = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  langs: [json],
  themes: [vitesseLight],
});

export function toolJson(value: unknown): string {
  try {
    const dump = JSON.stringify(value, null, 1) ?? "";
    return dump.length > 2_000 ? `${dump.slice(0, 2_000)}\n…` : dump;
  } catch {
    return String(value);
  }
}

/** Highlight untrusted tool JSON through Shiki, which HTML-escapes the source. */
export function highlightToolJson(source: string): Promise<string> {
  return highlighter.then((instance) =>
    instance.codeToHtml(source, { lang: "json", theme: "vitesse-light" }),
  );
}
