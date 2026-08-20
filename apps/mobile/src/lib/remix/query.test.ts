import { describe, expect, it } from "vitest";

import { remixQueryKeys } from "./query";

describe("Remix query keys", () => {
  it("gives scheduled briefs a separate cache from user conversations", () => {
    expect(remixQueryKeys.threadList("scheduled")).not.toEqual(
      remixQueryKeys.threadList("user"),
    );
  });
});
