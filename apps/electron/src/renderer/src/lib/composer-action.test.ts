import { describe, expect, it } from "vitest";
import { composerAction } from "./composer-action";

describe("composerAction", () => {
  it("shows stop while an answer is being submitted or streamed", () => {
    expect(composerAction("submitted")).toBe("stop");
    expect(composerAction("streaming")).toBe("stop");
  });

  it("shows send once the generation is no longer active", () => {
    expect(composerAction("ready")).toBe("send");
    expect(composerAction("error")).toBe("send");
  });
});
