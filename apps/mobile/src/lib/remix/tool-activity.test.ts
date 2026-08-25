import { describe, expect, it } from "vitest";

import { mobileToolActivity } from "./tool-activity";

describe("mobile tool activity", () => {
  it("turns completed Gmail calls into a safe, readable activity trail", () => {
    expect(
      mobileToolActivity([
        {
          type: "tool-connector__gmail__GMAIL_FETCH_EMAILS",
          toolCallId: "gmail-search",
          state: "output-available",
          input: { tool_slug: "GMAIL_FETCH_EMAILS" },
          output: { ok: true },
        },
        {
          type: "tool-connector__gmail__GET_MESSAGE",
          toolCallId: "gmail-get-message",
          state: "output-available",
          input: { tool_slug: "GET_MESSAGE" },
          output: { ok: true },
        },
      ]),
    ).toEqual([
      { title: "Gmail", detail: "Fetch emails", phase: "done" },
      { title: "Gmail", detail: "Get message", phase: "done" },
    ]);
  });

  it("excludes suggestion cards because they render as their own UI", () => {
    expect(
      mobileToolActivity([
        {
          type: "tool-suggest_connections",
          toolCallId: "suggest-connections",
          state: "output-available",
          input: {},
          output: { suggestions: [] },
        },
      ]),
    ).toEqual([]);
  });

  it("keeps internal connector discovery out of the visible execution trail", () => {
    expect(
      mobileToolActivity([
        {
          type: "tool-connector_search_tools",
          toolCallId: "tool-discovery",
          state: "output-available",
          input: {},
          output: { ok: true },
        },
      ]),
    ).toEqual([]);
  });
});
