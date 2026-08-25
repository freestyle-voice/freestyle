import { describe, expect, it } from "vitest";

import { markdownBlocks } from "./markdown";

describe("markdownBlocks", () => {
  it("keeps streamed prose readable while recognising headings and lists", () => {
    expect(
      markdownBlocks("# Plan\n\nWrite a reply.\n- Keep it warm\n- Send it"),
    ).toEqual([
      { kind: "heading", level: 1, text: "Plan" },
      { kind: "paragraph", text: "Write a reply." },
      { kind: "list", ordered: false, items: ["Keep it warm", "Send it"] },
    ]);
  });

  it("preserves fenced code without interpreting its contents", () => {
    expect(markdownBlocks("Try this:\n```ts\nconst answer = 42;\n```")).toEqual(
      [
        { kind: "paragraph", text: "Try this:" },
        { kind: "code", text: "const answer = 42;" },
      ],
    );
  });
});
