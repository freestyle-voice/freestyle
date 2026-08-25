import { describe, expect, it } from "vitest";

import { remixDraftStorageKey, updateRemixDraft } from "./drafts";

describe("Remix draft persistence", () => {
  it("scopes drafts to the signed-in account", () => {
    expect(remixDraftStorageKey("user-a")).toBe("remix_drafts:user-a");
    expect(remixDraftStorageKey(undefined)).toBe("remix_drafts");
  });

  it("keeps drafts per thread and removes blank values", () => {
    const withFirst = updateRemixDraft({}, "thread-a", "Finish this note");
    const withBoth = updateRemixDraft(withFirst, "thread-b", "Reply later");

    expect(withBoth).toEqual({
      "thread-a": "Finish this note",
      "thread-b": "Reply later",
    });
    expect(updateRemixDraft(withBoth, "thread-a", "")).toEqual({
      "thread-b": "Reply later",
    });
  });
});
