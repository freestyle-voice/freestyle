import { expect, test } from "@playwright/test";
import { isRemixTargetAllowed } from "../src/main/remix-target";

const EXCLUSIONS = new Set(["freestyle", "electron"]);

test("a null app name is never a remix target", () => {
  expect(isRemixTargetAllowed(null, EXCLUSIONS, false)).toBe(false);
  expect(isRemixTargetAllowed(null, EXCLUSIONS, true)).toBe(false);
});

test("an empty app name is never a remix target", () => {
  expect(isRemixTargetAllowed("", EXCLUSIONS, false)).toBe(false);
  expect(isRemixTargetAllowed("", EXCLUSIONS, true)).toBe(false);
});

test("external apps are remix targets regardless of practice mode", () => {
  expect(isRemixTargetAllowed("Safari", EXCLUSIONS, false)).toBe(true);
  expect(isRemixTargetAllowed("Safari", EXCLUSIONS, true)).toBe(true);
});

test("our own windows are excluded outside practice mode", () => {
  expect(isRemixTargetAllowed("Freestyle", EXCLUSIONS, false)).toBe(false);
  expect(isRemixTargetAllowed("Electron", EXCLUSIONS, false)).toBe(false);
});

test("practice mode suspends the self-exclusion", () => {
  expect(isRemixTargetAllowed("Freestyle", EXCLUSIONS, true)).toBe(true);
  expect(isRemixTargetAllowed("Electron", EXCLUSIONS, true)).toBe(true);
});

test("exclusion matching is case-insensitive and whitespace-tolerant", () => {
  expect(isRemixTargetAllowed("  FREESTYLE  ", EXCLUSIONS, false)).toBe(false);
  expect(isRemixTargetAllowed("electron ", EXCLUSIONS, false)).toBe(false);
  expect(isRemixTargetAllowed("  Notes  ", EXCLUSIONS, false)).toBe(true);
});
