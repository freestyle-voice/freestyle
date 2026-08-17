import { describe, expect, test } from "vitest";
import { profileAvatarInitial } from "./settings-view";

describe("profileAvatarInitial", () => {
  test("uses the display name when a profile image cannot load", () => {
    expect(profileAvatarInitial("Aditya Mathur", "aditya@example.com")).toBe(
      "A",
    );
  });

  test("falls back to the email when the display name is absent", () => {
    expect(profileAvatarInitial("", "aditya@example.com")).toBe("A");
  });
});
