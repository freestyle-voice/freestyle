import { serverUrlSchema } from "@freestyle/validations";
import { describe, expect, it } from "vitest";

describe("serverUrlSchema", () => {
  const parse = (v: string) => serverUrlSchema.safeParse(v);

  it("treats empty/whitespace as the local server", () => {
    expect(parse("").success && parse("").data).toBe("");
    expect(parse("   ").success && parse("   ").data).toBe("");
  });

  it("strips trailing slashes", () => {
    const r = parse("http://your-vm:4649/");
    expect(r.success && r.data).toBe("http://your-vm:4649");
  });

  it("lowercases scheme and host for reliable ws rewriting", () => {
    const r = parse("  HTTPS://VM:4649/api/  ");
    expect(r.success && r.data).toBe("https://vm:4649/api");
  });

  it("rejects invalid URLs", () => {
    expect(parse("not a url").success).toBe(false);
  });
});
