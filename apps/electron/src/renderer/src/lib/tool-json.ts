type JsonHighlighter = {
  codeToHtml(
    source: string,
    options: { lang: "json"; theme: "vitesse-light" },
  ): string;
};

let highlighter: Promise<JsonHighlighter> | undefined;

function getHighlighter(): Promise<JsonHighlighter> {
  highlighter ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/dist/langs/json.mjs"),
    import("shiki/dist/themes/vitesse-light.mjs"),
  ]).then(async ([core, engine, language, theme]) =>
    core.createHighlighterCore({
      engine: engine.createJavaScriptRegexEngine(),
      langs: [language.default],
      themes: [theme.default],
    }),
  );
  return highlighter;
}

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
  return getHighlighter().then((instance) =>
    instance.codeToHtml(source, { lang: "json", theme: "vitesse-light" }),
  );
}
