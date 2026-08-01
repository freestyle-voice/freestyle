import { expect, test } from "@playwright/test";
import {
  missingDictationPermission,
  resolveAccessibilityPermission,
  startupPermissionWarning,
} from "../src/main/permission-checks";

test("missing accessibility permission triggers a startup warning", () => {
  expect(startupPermissionWarning("darwin", false, false, "granted")).toBe(
    "accessibility",
  );
});

test("granted accessibility permission does not trigger a startup warning", () => {
  expect(startupPermissionWarning("darwin", false, true, "granted")).toBeNull();
});

test("onboarding suppresses the duplicate startup warning", () => {
  expect(startupPermissionWarning("darwin", true, false, "denied")).toBeNull();
});

test("denied and restricted microphone states trigger a startup warning", () => {
  expect(startupPermissionWarning("darwin", false, true, "denied")).toBe(
    "microphone",
  );
  expect(startupPermissionWarning("darwin", false, true, "restricted")).toBe(
    "microphone",
  );
});

test("granted and not-determined microphone states do not trigger a startup warning", () => {
  expect(startupPermissionWarning("darwin", false, true, "granted")).toBeNull();
  expect(
    startupPermissionWarning("darwin", false, true, "not-determined"),
  ).toBeNull();
});

test("missing accessibility and microphone permissions use one combined warning", () => {
  expect(startupPermissionWarning("darwin", false, false, "denied")).toBe(
    "accessibility-and-microphone",
  );
});

test("Windows explicit microphone denial triggers its supported warning path", () => {
  expect(startupPermissionWarning("win32", false, true, "denied")).toBe(
    "microphone",
  );
});

test("Linux does not receive an OS-specific startup permission warning", () => {
  expect(startupPermissionWarning("linux", false, true, "denied")).toBeNull();
});

test("unsupported platforms do not receive an OS-specific startup permission warning", () => {
  expect(
    startupPermissionWarning("freebsd", false, false, "denied"),
  ).toBeNull();
});

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
