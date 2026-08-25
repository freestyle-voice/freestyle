import { describe, expect, it } from "vitest";

import {
  connectedSuggestionSlugs,
  parseConnectSuggestions,
} from "@/lib/remix/connect-suggestions";

describe("mobile connector suggestions", () => {
  it("keeps only the first valid desktop-compatible connection cards", () => {
    expect(
      parseConnectSuggestions({
        suggestions: [
          { slug: "gmail", name: "Gmail", description: "Draft email" },
          { slug: "calendar", name: "Calendar" },
          { slug: "drive", name: "Drive" },
          { slug: "broken" },
        ],
      }),
    ).toEqual([
      { slug: "gmail", name: "Gmail", description: "Draft email" },
      { slug: "calendar", name: "Calendar" },
      { slug: "drive", name: "Drive" },
    ]);
  });

  it("does not render malformed tool output as a suggestion card", () => {
    expect(
      parseConnectSuggestions({ suggestions: [null, { name: "Gmail" }] }),
    ).toEqual([]);
  });

  it("identifies only active connections as already connected", () => {
    expect(
      connectedSuggestionSlugs([
        { toolkitSlug: "gmail", status: "active" },
        { toolkitSlug: "calendar", status: "needs_reconnect" },
      ]),
    ).toEqual(new Set(["gmail"]));
  });
});
