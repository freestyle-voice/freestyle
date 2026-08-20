import { describe, expect, it } from "vitest";

import { classifyMobileTool } from "./tool-policy";

describe("mobile agent tool policy", () => {
  it("requires approval for connected-app writes while allowing read-only progress", () => {
    expect(classifyMobileTool("connector__gmail__ro_search_mail")).toBe(
      "connected-read-only",
    );
    expect(classifyMobileTool("connector__gmail__send_email")).toBe(
      "connected-write",
    );
    expect(classifyMobileTool("Read")).toBe("unsupported");
  });
});
