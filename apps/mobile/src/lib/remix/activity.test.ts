import { describe, expect, it } from "vitest";

import { mergeActivity } from "./activity";

describe("Remix activity", () => {
  it("labels scheduled agent threads as briefs and sorts them with conversations", () => {
    expect(
      mergeActivity(
        [{ id: "conversation", title: "Draft", updatedAt: 10, origin: "user" }],
        [{ id: "brief", title: "Morning", updatedAt: 20, origin: "scheduled" }],
      ),
    ).toEqual([
      { id: "brief", title: "Morning", updatedAt: 20, kind: "brief" },
      {
        id: "conversation",
        title: "Draft",
        updatedAt: 10,
        kind: "conversation",
      },
    ]);
  });
});
