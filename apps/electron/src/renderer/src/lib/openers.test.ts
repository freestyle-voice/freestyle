import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissedOpenerIds,
  dismissOpener,
  resetOpenerDismissals,
} from "./openers";

describe("opener dismissals", () => {
  beforeEach(resetOpenerDismissals);

  it("holds dismissals for the session only, in memory", () => {
    expect(dismissedOpenerIds()).toEqual([]);
    dismissOpener("connect:github");
    dismissOpener("automate:morning-inbox-brief");
    expect(dismissedOpenerIds()).toEqual([
      "connect:github",
      "automate:morning-inbox-brief",
    ]);
  });

  it("deduplicates repeat dismissals", () => {
    dismissOpener("a");
    dismissOpener("a");
    expect(dismissedOpenerIds()).toEqual(["a"]);
  });

  it("reset clears everything so suggestions come back", () => {
    dismissOpener("a");
    dismissOpener("b");
    resetOpenerDismissals();
    expect(dismissedOpenerIds()).toEqual([]);
  });
});
