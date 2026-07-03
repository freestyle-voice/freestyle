import { describe, expect, it } from "vitest";
import { getRewritePromptContext } from "../src/lib/editor/rewrite-context.js";

describe("getRewritePromptContext", () => {
  it("routes email-like contexts to email", () => {
    const ctx = getRewritePromptContext(
      JSON.stringify({ app: "Gmail", url: "https://mail.google.com" }),
    );

    expect(ctx.destination).toBe("email");
  });

  it("routes desktop mail apps and browser-title fallbacks to email", () => {
    expect(
      getRewritePromptContext(JSON.stringify({ app: "Mail" })).destination,
    ).toBe("email");

    expect(
      getRewritePromptContext(
        JSON.stringify({
          app: "Firefox",
          windowTitle: "Inbox - me@gmail.com - Gmail",
        }),
      ).destination,
    ).toBe("email");
  });

  it("routes Slack, LinkedIn, and Teams contexts to work", () => {
    expect(
      getRewritePromptContext(
        JSON.stringify({ app: "Slack", url: "https://slack.com" }),
      ).destination,
    ).toBe("work");

    expect(
      getRewritePromptContext(
        JSON.stringify({ app: "LinkedIn", url: "https://linkedin.com" }),
      ).destination,
    ).toBe("work");

    expect(
      getRewritePromptContext(
        JSON.stringify({
          app: "Microsoft Teams",
          url: "https://teams.microsoft.com",
        }),
      ).destination,
    ).toBe("work");
  });

  it("routes Discord and messaging contexts to personal", () => {
    const discord = getRewritePromptContext(
      JSON.stringify({ app: "Discord", url: "https://discord.com" }),
    );
    expect(discord.destination).toBe("personal");
    expect(discord.personalSurface).toBe("discord");

    const messages = getRewritePromptContext(
      JSON.stringify({ app: "Messages" }),
    );
    expect(messages.destination).toBe("personal");
    expect(messages.personalSurface).toBeNull();
  });

  it("detects Discord variants through app or window context", () => {
    expect(
      getRewritePromptContext(JSON.stringify({ app: "Discord Canary" })),
    ).toEqual({
      destination: "personal",
      personalSurface: "discord",
    });

    expect(
      getRewritePromptContext(
        JSON.stringify({
          app: "Firefox",
          windowTitle: "general - Discord",
        }),
      ),
    ).toEqual({
      destination: "personal",
      personalSurface: "discord",
    });
  });

  it("falls back to overall for unmatched contexts", () => {
    expect(
      getRewritePromptContext(
        JSON.stringify({ app: "Cursor", title: "fix tests" }),
      ).destination,
    ).toBe("overall");
  });

  it("routes an unmatched app into the group a user assigned it to", () => {
    expect(
      getRewritePromptContext(JSON.stringify({ app: "Notion" }), [
        { match: "notion", label: "Notion", kind: "app", destination: "work" },
      ]).destination,
    ).toBe("work");
  });

  it("lets a user assignment override the built-in routing", () => {
    // Discord defaults to personal; a work assignment should win.
    const ctx = getRewritePromptContext(JSON.stringify({ app: "Discord" }), [
      { match: "discord", label: "Discord", kind: "app", destination: "work" },
    ]);
    expect(ctx.destination).toBe("work");
    expect(ctx.personalSurface).toBeNull();
  });

  it("uses the latest user assignment when the same route was reassigned", () => {
    const ctx = getRewritePromptContext(JSON.stringify({ app: "Notion" }), [
      {
        match: "notion",
        label: "Notion",
        kind: "app",
        destination: "personal",
      },
      {
        match: "notion",
        label: "Notion",
        kind: "app",
        destination: "work",
      },
    ]);

    expect(ctx.destination).toBe("work");
  });

  it("matches a site assignment against the browser URL", () => {
    expect(
      getRewritePromptContext(
        JSON.stringify({
          app: "Google Chrome",
          url: "https://notion.so/my-page",
          title: "My page",
        }),
        [
          {
            match: "notion.so",
            label: "notion.so",
            kind: "site",
            destination: "personal",
          },
        ],
      ).destination,
    ).toBe("personal");
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
