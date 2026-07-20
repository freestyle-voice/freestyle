import { areAllCleanupTonesOff } from "@freestyle-voice/validations";
import { beforeEach, describe, expect, it } from "vitest";
import { writeSetting } from "../src/lib/db.js";
import {
  needsAppContextForCleanup,
  resolveAppContextForCleanup,
} from "../src/lib/post-process.js";

const SAMPLE_CONTEXT = "safari|https://mail.google.com|Gmail";

function setAllTonesOff(): void {
  writeSetting("cleanup_personal_tone", "off");
  writeSetting("cleanup_work_tone", "off");
  writeSetting("cleanup_email_tone", "off");
  writeSetting("cleanup_overall_tone", "off");
}

describe("areAllCleanupTonesOff", () => {
  it("returns true when every sector tone is off", () => {
    expect(
      areAllCleanupTonesOff({
        personalTone: "off",
        workTone: "off",
        emailTone: "off",
        overallTone: "off",
      }),
    ).toBe(true);
  });

  it("returns false when any sector tone is active", () => {
    expect(
      areAllCleanupTonesOff({
        personalTone: "casual",
        workTone: "off",
        emailTone: "off",
        overallTone: "off",
      }),
    ).toBe(false);
  });
});

describe("needsAppContextForCleanup", () => {
  beforeEach(() => {
    writeSetting("llm_cleanup", "true");
    setAllTonesOff();
  });

  it("returns false when cleanup is disabled", () => {
    writeSetting("llm_cleanup", "false");
    expect(needsAppContextForCleanup()).toBe(false);
  });

  it("returns false when all sector tones are off", () => {
    expect(needsAppContextForCleanup()).toBe(false);
  });

  it("returns true when cleanup is on and a sector tone is active", () => {
    writeSetting("cleanup_personal_tone", "casual");
    expect(needsAppContextForCleanup()).toBe(true);
  });
});

describe("resolveAppContextForCleanup", () => {
  beforeEach(() => {
    writeSetting("llm_cleanup", "true");
    setAllTonesOff();
  });

  it("returns null when all sector tones are off", () => {
    expect(resolveAppContextForCleanup(SAMPLE_CONTEXT)).toBeNull();
  });

  it("returns null when cleanup is disabled", () => {
    writeSetting("llm_cleanup", "false");
    expect(resolveAppContextForCleanup(SAMPLE_CONTEXT)).toBeNull();
  });

  it("passes context through when destination routing is needed", () => {
    writeSetting("cleanup_email_tone", "warm");
    expect(resolveAppContextForCleanup(SAMPLE_CONTEXT)).toBe(SAMPLE_CONTEXT);
  });

  it("passes null through unchanged when routing is needed", () => {
    writeSetting("cleanup_work_tone", "direct");
    expect(resolveAppContextForCleanup(null)).toBeNull();
  });
});
