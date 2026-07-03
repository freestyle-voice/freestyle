import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { getRewritePromptContext } from "../src/lib/editor/rewrite-context.js";
import { initSchema } from "../src/lib/schema.js";

let db: DatabaseSync | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function makeDb(): DatabaseSync {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  return db;
}

describe("getRewritePromptContext", () => {
  it("treats Gmail-like contexts as formal", () => {
    const ctx = getRewritePromptContext(
      JSON.stringify({ app: "Gmail", url: "https://mail.google.com" }),
      makeDb(),
    );

    expect(ctx.registerMode).toBe("formal");
    expect(ctx.contextHint).toContain("email");
  });

  it("treats Slack and LinkedIn contexts as formal", () => {
    expect(
      getRewritePromptContext(
        JSON.stringify({ app: "Slack", url: "https://slack.com" }),
        makeDb(),
      ).registerMode,
    ).toBe("formal");

    expect(
      getRewritePromptContext(
        JSON.stringify({ app: "LinkedIn", url: "https://linkedin.com" }),
        makeDb(),
      ).registerMode,
    ).toBe("formal");
  });

  it("treats Discord and messaging contexts as casual", () => {
    expect(
      getRewritePromptContext(
        JSON.stringify({ app: "Discord", url: "https://discord.com" }),
        makeDb(),
      ).registerMode,
    ).toBe("casual");

    expect(
      getRewritePromptContext(JSON.stringify({ app: "Messages" }), makeDb())
        .registerMode,
    ).toBe("casual");
  });

  it("matches web apps from window-title segments when no URL is available", () => {
    const gmail = getRewritePromptContext(
      JSON.stringify({
        app: "firefox",
        windowTitle: "Inbox (2) - matthew@gmail.com - Gmail",
      }),
      makeDb(),
    );
    expect(gmail.registerMode).toBe("formal");
    expect(gmail.contextHint).toContain("email");

    const slack = getRewritePromptContext(
      JSON.stringify({
        app: "chromium",
        windowTitle: "general (Channel) - Acme - Slack",
      }),
      makeDb(),
    );
    expect(slack.registerMode).toBe("formal");
    expect(slack.contextHint).toContain("punctuation");
  });

  it("does not match bare-word patterns against prose inside titles", () => {
    const ctx = getRewritePromptContext(
      JSON.stringify({
        app: "firefox",
        windowTitle: "How to code in Rust - Mozilla Firefox",
      }),
      makeDb(),
    );

    expect(ctx.registerMode).toBe("neutral");
    expect(ctx.contextHint).toBe("The user is dictating in firefox.");
  });

  it("matches app names for desktop apps", () => {
    const ctx = getRewritePromptContext(
      JSON.stringify({ app: "Code", windowTitle: "index.ts — freestyle" }),
      makeDb(),
    );

    expect(ctx.contextHint).toContain("technical terms");
    expect(ctx.registerMode).toBe("formal");
  });
});
