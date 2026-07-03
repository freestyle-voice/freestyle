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
});
