import { describe, expect, it } from "vitest";
import {
  BEATS,
  beatLines,
  DEFAULT_QUEST,
  handoffCta,
  jobPlaceholder,
  jobReaction,
  nameReaction,
  parseSaved,
  profileMarkdown,
  QUEST_MAX_CHARS,
  questFor,
  seedMessageFor,
  starterPrompts,
  tradeReaction,
} from "./onboarding-core";

describe("parseSaved", () => {
  it("round-trips a valid state", () => {
    const state = { v: 1, done: false, beat: "job", name: "Matt", task: "" };
    expect(parseSaved(JSON.stringify(state))).toEqual(state);
  });

  it("rejects garbage, wrong versions, and empty values", () => {
    expect(parseSaved(undefined)).toBeNull();
    expect(parseSaved("")).toBeNull();
    expect(parseSaved("not json")).toBeNull();
    expect(parseSaved(JSON.stringify({ v: 2, done: true }))).toBeNull();
  });
});

describe("questFor", () => {
  it("uses the task verbatim, whitespace collapsed", () => {
    expect(questFor("  finish   the deck ")).toBe("finish the deck");
  });

  it("falls back to the default quest when empty", () => {
    expect(questFor("   ")).toBe(DEFAULT_QUEST);
  });

  it("caps at the markdown-safe length", () => {
    const quest = questFor("x".repeat(400));
    expect(quest.length).toBeLessThanOrEqual(QUEST_MAX_CHARS);
    expect(quest.endsWith("…")).toBe(true);
  });
});

describe("nameReaction", () => {
  it("recognizes the unedited account name", () => {
    expect(nameReaction("Matthew Wang", "Matthew Wang")).toContain(
      "Already knew",
    );
  });

  it("teases one-to-two-character names", () => {
    expect(nameReaction("MJ", null)).toContain("grunt");
  });

  it("shortens four-plus-word names", () => {
    expect(nameReaction("Jean Claude van Damme III", null)).toContain(
      "All of that?",
    );
    expect(nameReaction("Jean Claude van Damme III", null)).toContain("Jean");
  });

  it("defaults to the good-name line", () => {
    expect(nameReaction("Matt", null)).toContain("shout across a room");
  });
});

describe("tradeReaction", () => {
  it("has a bespoke line for every chip", () => {
    expect(tradeReaction("Consultant")).toContain("hired blade");
    expect(tradeReaction("Between things")).toContain("eleven years");
  });

  it("quotes custom trades back", () => {
    expect(tradeReaction("Beekeeper")).toContain('"Beekeeper."');
  });

  it("handles an empty trade", () => {
    expect(tradeReaction("  ")).toContain("watching what you ask");
  });
});

describe("jobReaction", () => {
  it("calls short tasks blunt", () => {
    expect(jobReaction("Reply to Sam")).toContain("Blunt");
  });

  it("calls long tasks a campaign", () => {
    const long =
      "finish the deck and reply to Sam and also figure out my taxes before Friday somehow";
    expect(jobReaction(long)).toContain("campaign");
  });

  it("has an empty-task line", () => {
    expect(jobReaction("")).toContain("worst hour");
  });

  it("defaults to the target line", () => {
    expect(jobReaction("plan the offsite for the team")).toContain(
      "vaguer orders",
    );
  });
});

describe("beat script", () => {
  const ctx = {
    name: "Matt",
    trade: "Engineer",
    task: "Finish the deck",
    accountName: null,
  };

  it("runs welcome-first, handoff-last", () => {
    expect(BEATS[0]).toBe("welcome");
    expect(BEATS[BEATS.length - 1]).toBe("handoff");
  });

  it("has lines for every beat", () => {
    for (const beat of BEATS) {
      const scene = beatLines(beat, ctx);
      expect(scene.lines.length).toBeGreaterThan(0);
      for (const line of scene.lines) expect(line.length).toBeGreaterThan(0);
    }
  });

  it("opens the trade beat with the name reaction", () => {
    expect(beatLines("trade", ctx).lines[0]).toContain("Matt");
  });

  it("opens the job beat with the trade reaction", () => {
    expect(beatLines("job", ctx).lines[0]).toContain("smith");
  });

  it("tunes the job placeholder to the picked trade", () => {
    expect(jobPlaceholder("Engineer")).toContain("login bug");
    expect(jobPlaceholder("Teacher")).toContain("Grade the essays");
    expect(jobPlaceholder("Beekeeper")).toContain("Figure out my taxes");
    expect(jobPlaceholder("")).toContain("Figure out my taxes");
  });

  it("swaps to no-task fallbacks when the job was skipped", () => {
    const empty = { ...ctx, task: "" };
    expect(beatLines("list", empty).lines.join(" ")).toContain("empty for now");
    expect(beatLines("handoff", empty).lines.join(" ")).toContain("sharpening");
  });
});

describe("the handoff", () => {
  it("brands the CTA by whether a task exists", () => {
    expect(handoffCta("Finish the deck")).toBe("Get it done ▸");
    expect(handoffCta("  ")).toBe("Ride with Jeb ▸");
  });

  it("phrases the seeded message as a request", () => {
    expect(seedMessageFor("Finish the deck")).toBe(
      "Help me get this done: Finish the deck",
    );
  });
});

describe("after onboarding", () => {
  it("offers the three hero starters", () => {
    expect(starterPrompts()).toEqual([
      "Summarize what's on my screen",
      "Rewrite what I'm looking at",
      "Look this up and keep it short",
    ]);
  });

  it("writes a profile without the retired focus field", () => {
    const md = profileMarkdown("Matt", "Engineer");
    expect(md).toContain("- Name: Matt");
    expect(md).toContain("- Trade: Engineer");
    expect(md).not.toContain("Wants help with");
  });
});
