import { expect, test } from "@playwright/test";
import {
  missingDictationPermission,
  resolveAccessibilityPermission,
} from "../src/main/permission-checks";

test("missing accessibility permission blocks dictation", () => {
  expect(missingDictationPermission("darwin", false, "granted")).toBe(
    "accessibility",
  );
});

test("denied microphone permission blocks dictation", () => {
  expect(missingDictationPermission("darwin", true, "denied")).toBe(
    "microphone",
  );
});

test("granted permissions allow dictation", () => {
  expect(missingDictationPermission("darwin", true, "granted")).toBeNull();
});

test("a stale accessibility latch cannot override current macOS trust", () => {
  expect(resolveAccessibilityPermission("darwin", false, true)).toEqual({
    granted: false,
    accessibilityConfirmed: false,
  });
});
