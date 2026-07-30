import { expect, test } from "@playwright/test";
import { normalizeAccelerator } from "../src/main/hotkey-utils";
import {
  acceleratorsEqual,
  canonicalizeAccelerator,
} from "../src/shared/hotkey-utils";

test("canonicalizeAccelerator deduplicates and orders modifiers", () => {
  expect(canonicalizeAccelerator("Shift+Ctrl+Alt+Control+Space")).toBe(
    "Control+Alt+Shift+Space",
  );
  expect(canonicalizeAccelerator("Alt+Shift+Control+Space")).toBe(
    "Control+Alt+Shift+Space",
  );
});

test("acceleratorsEqual recognizes aliases and modifier order", () => {
  expect(acceleratorsEqual("Ctrl+Alt+Space", "Control+Alt+Space")).toBe(true);
  expect(
    acceleratorsEqual("Shift+Alt+Ctrl+Space", "Control+Shift+Alt+Space"),
  ).toBe(true);
  expect(acceleratorsEqual("Option+Enter", "Alt+Return")).toBe(true);
});

test("right modifiers remain present regardless of input order", () => {
  expect(acceleratorsEqual("RightAlt+Space", "Space+RightAlt")).toBe(true);
  expect(canonicalizeAccelerator("RightAlt+Space")).toBe("RightAlt+Space");
  expect(canonicalizeAccelerator("Space+RightAlt")).toBe("RightAlt+Space");
});

test("acceleratorsEqual distinguishes different accelerators", () => {
  expect(acceleratorsEqual("Control+Alt+Space", "Control+Shift+Space")).toBe(
    false,
  );
  expect(acceleratorsEqual("Control+Alt+Space", "Control+Alt+Return")).toBe(
    false,
  );
});

test("normalizeAccelerator keeps its existing output order and format", () => {
  expect(normalizeAccelerator(" shift + ctrl + option + enter ")).toBe(
    "Shift+Control+Alt+Return",
  );
  expect(normalizeAccelerator("Globe+esc")).toBe("Fn+Escape");
});
