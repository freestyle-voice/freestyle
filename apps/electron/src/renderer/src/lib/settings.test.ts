import { describe, expect, it } from "vitest";
import { replaceSetting, settingsForView } from "./settings";

describe("replaceSetting", () => {
  it("updates one value without dropping unrelated settings", () => {
    expect(
      replaceSetting({ language: "en", theme: "dark" }, "theme", "light"),
    ).toEqual({
      language: "en",
      theme: "light",
    });
  });

  it("keeps Settings usable when its initial query fails", () => {
    expect(settingsForView(undefined, true)).toEqual({});
  });
});
