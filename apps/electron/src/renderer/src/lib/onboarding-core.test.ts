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
} from "./onboarding-core";

describe("parseSaved", () => {
  it("round-trips a valid v2 state", () => {
    const state = {
      v: 2,
      done: false,
      beat: "goal",
      name: "Matt",
      task: "",
      connected: ["gmail"],
      automations: ["morning-inbox-brief"],
    };
    expect(parseSaved(JSON.stringify(state))).toEqual(state);
  });

  it("drops an unknown saved beat so the flow restarts cleanly", () => {
    const state = { v: 2, done: false, beat: "blade" };
    expect(parseSaved(JSON.stringify(state))?.beat).toBeUndefined();
  });

  it("migrates a completed v1 save and restarts a mid-flow one", () => {
    expect(
      parseSaved(JSON.stringify({ v: 1, done: true, task: "old task" })),
    ).toEqual({ v: 2, done: true, task: "old task" });
    expect(
      parseSaved(JSON.stringify({ v: 1, done: false, beat: "job" })),
    ).toBeNull();
  });

  it("rejects garbage, wrong versions, and empty values", () => {
    expect(parseSaved(undefined)).toBeNull();
    expect(parseSaved("")).toBeNull();
    expect(parseSaved("not json")).toBeNull();
    expect(parseSaved(JSON.stringify({ v: 3, done: true }))).toBeNull();
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

  it("runs name-first, receipt-last", () => {
    expect(BEATS[0]).toBe("name");
    expect(BEATS[BEATS.length - 1]).toBe("receipt");
  });

  it("has lines for every beat", () => {
    for (const beat of BEATS) {
      const scene = beatLines(beat, ctx);
      expect(scene.lines.length).toBeGreaterThan(0);
      for (const line of scene.lines) expect(line.length).toBeGreaterThan(0);
    }
  });

  it("leads with the value prop", () => {
    expect(beatLines("name", ctx).lines[0]).toContain("slips");
  });

  it("opens the trade beat with the name reaction", () => {
    expect(beatLines("trade", ctx).lines[0]).toContain("Matt");
  });

  it("goes straight to the mail pitch after the trade", () => {
    expect(beatLines("inbox", ctx).lines[0]).toContain("Hook up your mail");
  });

  it("acknowledges connections in the compass and goal beats", () => {
    expect(
      beatLines("compass", { ...ctx, emailConnected: true }).lines[0],
    ).toContain("watched");
    expect(
      beatLines("compass", { ...ctx, emailConnected: false }).lines[0],
    ).toContain("Suit yourself");
    expect(
      beatLines("goal", { ...ctx, calendarConnected: true }).lines[0],
    ).toContain("watch set");
  });

  it("tunes the goal placeholder to the picked trade", () => {
    expect(jobPlaceholder("Engineer")).toContain("login bug");
    expect(jobPlaceholder("Teacher")).toContain("Grade the essays");
    expect(jobPlaceholder("Beekeeper")).toContain("Figure out my taxes");
    expect(jobPlaceholder("")).toContain("Figure out my taxes");
  });

  it("swaps to no-task fallbacks when the goal was skipped", () => {
    const empty = { ...ctx, task: "" };
    expect(beatLines("receipt", empty).lines.join(" ")).toContain("improvise");
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
  it("offers starters the current tool set can actually run", () => {
    const prompts = starterPrompts();
    expect(prompts).toHaveLength(3);
    // Screen and cursor tools are disabled; a starter that needs them sends
    // the user straight into a refusal.
    for (const prompt of prompts) {
      expect(prompt).not.toMatch(/on my screen|looking at|highlighted/i);
    }
  });

  it("writes a profile without the retired focus field", () => {
    const md = profileMarkdown("Matt", "Engineer");
    expect(md).toContain("- Name: Matt");
    expect(md).toContain("- Trade: Engineer");
    expect(md).not.toContain("Wants help with");
  });
});
