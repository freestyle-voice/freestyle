import { describe, expect, it } from "vitest";

import { remixQueryKeys } from "./query";

describe("Remix query keys", () => {
  it("gives scheduled briefs a separate cache from user conversations", () => {
    expect(remixQueryKeys.threadList("scheduled")).not.toEqual(
      remixQueryKeys.threadList("user"),
    );
  });

  it("keeps the sidebar's single-page recent sessions cache separate", () => {
    expect(remixQueryKeys.recentSessions).not.toEqual(
      remixQueryKeys.threadList("user"),
    );
  });
});
